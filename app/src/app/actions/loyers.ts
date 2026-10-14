"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { abandonnerPieceGed, preparerFichierGed } from "@/lib/ged-depot";
import { envoyerEmail } from "@/lib/email";
import { corpsQuittance, sujetQuittance } from "@/lib/quittance-email";
import {
  assemblerQuittanceDelivree,
  chargerQuittanceDocument,
  manquantsQuittance,
  motifQuittanceIncomplete,
  parties,
} from "@/lib/quittance-conforme";
import { aujourdhuiParis, eur } from "@/lib/ged";
import { avertissementExerciceNonTermine, etatDecompteSortie, exerciceNonTermine, messageSoldeNonAppele, type EtatDecompteSortie } from "@/lib/baux";
import { valeursDuFormulaire } from "@/lib/formulaires";
import {
  erreurDuChamp,
  lireDecimal,
  lireMontant,
  lireMontantFacultatif,
  verifierDateDejaPassee,
} from "@/lib/saisie-montant";
import { emettreRecusQuittances, libelleEmission } from "@/lib/quittances";
import { compteRenduEncaissement, type EtatAppel } from "@/lib/imputation";
import { adresseDeRetour, MESSAGE_SITE_NON_CONFIGURE } from "@/lib/site";
import { estRejeuCleEnvoi, lireCleEnvoi, messageDejaEnregistre } from "@/lib/cle-envoi";
import {
  CHAMP_CONFIRMATION_MONTANT,
  confirmationDonnee,
  evaluerEncaissement,
  type ConfirmationEncaissement,
  type LigneTerme,
} from "@/lib/garde-encaissement";

export type EtatLoyers = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
  // D04 (2), VER-TS-02 : le montant dépasse largement le dû. RIEN n'est enregistré ; le formulaire propose de
  // confirmer (bouton qui renvoie `confirmation_montant`) ou de corriger. Jamais un refus.
  confirmation?: ConfirmationEncaissement;
  // D05, PR178-B-06 : cet envoi (même clé) était déjà enregistré. `succes` le dit ; rien n'a été écrit de plus.
  dejaEnregistre?: boolean;
};

// Envoyer une quittance ou un reçu partiel par email au locataire (API Resend).
export async function envoyerQuittance(
  orgId: string,
  bailId: string,
  quittanceId: string
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  // Les identifiants reçus peuvent être incohérents, même si les boutons
  // habituels transmettent le bon trio. La lecture respecte la RLS et lie
  // le document au bail dont on va chercher le destinataire.
  const { data: document, error: erreurDocument } = await supabase
    .from("quittances")
    .select("id")
    .eq("id", quittanceId)
    .eq("bail_id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (erreurDocument)
    return { erreur: "Impossible de vérifier le document à envoyer. Réessayez." };
  if (!document)
    return { erreur: "Ce document est introuvable ou inaccessible pour ce bail." };

  const { data: bail } = await supabase
    .from("baux")
    .select("locataire_principal")
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const { data: loc } = bail?.locataire_principal
    ? await supabase.from("persons").select("email, nom, prenom").eq("id", bail.locataire_principal).maybeSingle()
    : { data: null };
  if (!loc?.email) return { erreur: "Le locataire n'a pas d'email renseigné." };

  const { data, error: erreurDetail } = await supabase.rpc("quittance_detail", { p_quittance: quittanceId });
  if (erreurDetail)
    return { erreur: "Impossible de lire le document à envoyer. Réessayez." };
  const q = ((data ?? []) as {
    emetteur: string;
    periode: string;
    loyer_hc: number;
    charges: number;
    montant: number;
    est_quittance: boolean;
  }[])[0];
  if (!q) return { erreur: "Document de paiement introuvable." };

  // La même barrière que le PDF (audit du 27/09, [[Quittance conforme]]) :
  // le lien de l'e-mail ouvre le document conforme ; s'il lui manque
  // l'identité ou l'adresse de l'émetteur, on ne l'envoie pas — on dit quoi
  // compléter.
  const conforme = await chargerQuittanceDocument(supabase, quittanceId);
  if (!conforme) return { erreur: "Impossible de lire le document à envoyer. Réessayez." };
  const manquants = manquantsQuittance(assemblerQuittanceDelivree(conforme));
  if (manquants.length > 0) return { erreur: motifQuittanceIncomplete(manquants, q.est_quittance) };
  const libelleEnvoi = q.est_quittance ? "Quittance envoyée" : "Reçu de paiement partiel envoyé";

  // Audit du 30/09 (B4) : sans adresse configurée, le lien de la quittance
  // serait relatif — mort dans un e-mail. On ne l'envoie pas, on dit quoi
  // configurer.
  const origine = adresseDeRetour();
  if (!origine) return { erreur: MESSAGE_SITE_NON_CONFIGURE };
  // Le corps vit dans lib/quittance-email : la tâche planifiée envoie le même
  // document, et deux mises en forme pour une même quittance ne s'expliquent
  // pas au locataire qui la conserve.
  const message = {
    estQuittance: q.est_quittance,
    periode: q.periode,
    loyerHc: q.loyer_hc,
    charges: q.charges,
    montant: q.montant,
    // Chez un propriétaire direct, le bailleur signe : pas le nom du « parc ».
    emetteur: parties(conforme).emetteur ?? q.emetteur,
    prenom: loc.prenom,
    lien: `${origine}/quittance/${quittanceId}`,
  };
  const html = corpsQuittance(message);

  const envoi = await envoyerEmail({ organisation: { db: supabase, id: orgId }, to: loc.email, subject: sujetQuittance(message), html });
  if (envoi.erreur) {
    console.error("[quittance email] échec:", envoi.erreur);
    return { erreur: envoi.erreur };
  }

  // L'email est parti : si la mémorisation échoue, on le dit (le bouton
  // « Envoyer » réapparaîtrait, avec un double envoi possible).
  const { error: erreurMemo } = await supabase
    .from("quittances")
    .update({ email_envoye_at: new Date().toISOString() })
    .eq("id", quittanceId)
    .eq("bail_id", bailId)
    .eq("organization_id", orgId);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  if (erreurMemo) {
    return {
      succes: `${libelleEnvoi} à ${loc.email}, mais l'envoi n'a pas pu être mémorisé — le bouton peut réapparaître.`,
    };
  }
  return { succes: `${libelleEnvoi} à ${loc.email}.` };
}

// Relance d'impayé ou mise en demeure (LRAR hors plateforme : date de 1re présentation).
export async function ajouterRelance(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const niveau = String(formData.get("niveau") ?? "");
  if (!["relance_1", "relance_2", "mise_en_demeure"].includes(niveau))
    return { erreur: "Niveau de relance invalide.", valeurs };
  const { error } = await supabase.from("relances").insert({
    organization_id: orgId,
    bail_id: bailId,
    niveau,
    date_envoi: String(formData.get("date_envoi") ?? "").trim() || undefined,
    date_premiere_presentation:
      String(formData.get("date_premiere_presentation") ?? "").trim() || null,
    numero_recommande: String(formData.get("numero_recommande") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Relance enregistrée." };
}

export async function supprimerRelance(
  orgId: string,
  bailId: string,
  relanceId: string
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.from("relances").delete().eq("id", relanceId).eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Relance supprimée." };
}

// D40 : « repris au décompte de sortie » ne se dit que si le décompte de sortie du bail n'est pas finalisé (voir `etatDecompteSortie`).
// Une lecture qui échoue ne bloque rien : le texte cesse alors d'affirmer.
async function lireEtatDecompteSortie(supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"], orgId: string, bailId: string): Promise<EtatDecompteSortie> {
  const { data, error } = await supabase.from("restitutions").select("statut").eq("organization_id", orgId).eq("bail_id", bailId).maybeSingle();
  return etatDecompteSortie(data, error);
}

// Régularisation annuelle des charges (justificatif obligatoire déposé en GED).
export async function regulariserCharges(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const annee = Number(String(formData.get("annee") ?? "").trim());
  if (!annee) return { erreur: "Année invalide.", valeurs };
  // Lu sur le texte tel que tapé (« 840,00 » vaut 840) : le champ est en `type="text"`, jamais `type="number"`
  // qui donne 84000 à un navigateur non francophone (VFL-07). Zéro admis : des charges nulles se saisissent.
  const reellesLues = lireMontantFacultatif(formData.get("charges_reelles"));
  if ("erreur" in reellesLues) return { erreur: reellesLues.erreur, valeurs };
  if (reellesLues.montant === null)
    return { erreur: "Indiquez les charges réelles de l'exercice — saisissez 0 si elles sont nulles.", valeurs };
  const reelles = reellesLues.montant;
  const fichier = formData.get("justificatif");
  if (!(fichier instanceof File) || fichier.size === 0)
    return { erreur: "Le justificatif est obligatoire (décompte remis au locataire).", valeurs };
  // D38 (CHF-02, option A) : un exercice non terminé (le 31/12, jour de Paris, n'est pas passé) se régularise sur confirmation explicite.
  // La vérification est ICI, côté serveur : une requête directe sans la case cochée est refusée, avant tout dépôt de pièce.
  const exerciceEnCours = exerciceNonTermine(annee, aujourdhuiParis());
  if (exerciceEnCours && String(formData.get("confirmer_exercice_en_cours") ?? "") !== "oui")
    return {
      erreur: `${avertissementExerciceNonTermine(annee, await lireEtatDecompteSortie(supabase, orgId, bailId))} Cochez la confirmation pour l’enregistrer malgré tout.`,
      valeurs,
    };
  // Audit agence 27/09 : le décompte n'existe en GED que si la régularisation
  // existe. Déposé avant la fonction, chaque refus (exercice déjà régularisé,
  // forfait, exercice hors bail…) laissait une pièce rattachée à rien, dont
  // l'empreinte bloquait ensuite le nouvel essai avec le même fichier. L'octet
  // monte au Storage, la fiche naît dans la transaction de la régularisation.
  const prep = await preparerFichierGed(supabase, orgId, fichier);
  if (prep.erreur || !prep.fichier) return { erreur: prep.erreur ?? "Échec du dépôt du justificatif.", valeurs };
  const piece = prep.fichier;

  const { data, error } = await supabase.rpc("regulariser_charges_avec_justificatif", {
    p_bail: bailId,
    p_annee: annee,
    p_charges_reelles: reelles,
    p_note: String(formData.get("note") ?? "").trim() || null,
    p_storage_path: piece.chemin,
    p_mime: piece.mime,
    p_taille: piece.taille,
    p_empreinte: piece.empreinte,
    // Audit gestion du 29/09 : régularisation tardive (après le 31/12 de
    // l'année suivant l'exercice) — le locataire peut demander de régler le
    // complément par douzièmes (art. 23 loi 89-462).
    p_etaler: formData.get("etaler") === "on",
  });
  if (error) {
    await abandonnerPieceGed(supabase, piece);
    return { erreur: sansJargon(error.message), valeurs };
  }
  const ecart = Number(data);
  const etale = formData.get("etaler") === "on";
  // Trop-perçu : « en faveur du locataire », sans verbe d'action — le texte dit juste après que ce solde n'est pas appelé mais repris.
  const msg =
    ecart > 0
      ? `Trop-perçu de ${eur(ecart)} en faveur du locataire.`
      : ecart < 0
        ? etale
          ? `Complément de ${eur(Math.abs(ecart))} dû par le locataire, qui a demandé à le régler en 12 mensualités (échéancier enregistré).`
          : `Complément de ${eur(Math.abs(ecart))} dû par le locataire.`
        : "Charges équilibrées (aucun écart).";
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // Audit du 27/09 : la régularisation n'écrit PAS au journal (aucun appel
  // ni avoir n'est encore généré) ; son solde est repris au décompte de
  // restitution à la sortie (montants_reels_bail).
  revalidatePath(`/agence/${orgId}/comptabilite`);
  // D40 (CHF-06, option A) : on le dit à l'émission, et une alerte garde la trace du solde non appelé (mécanisme d'alertes existant).
  // L'alerte est posée après la régularisation, qui ne se défait pas si elle échoue : le message le dit alors.
  // Le décompte de sortie est lu ICI, après l'enregistrement : « repris au décompte de sortie » est faux s'il est déjà finalisé.
  const soldeNonAppele = ecart !== 0;
  const decompte = soldeNonAppele ? await lireEtatDecompteSortie(supabase, orgId, bailId) : "non_finalise";
  const phraseSolde = soldeNonAppele ? messageSoldeNonAppele(decompte, etale && ecart < 0) : "";
  let alerteManquante = false;
  if (soldeNonAppele) {
    const suffixeFinalise = decompte === "finalise" ? ", décompte de sortie déjà finalisé" : "";
    const { error: erreurAlerte } = await supabase.from("alerts").insert({
      organization_id: orgId,
      type: "regularisation_non_appelee",
      criticite: "normale",
      titre:
        (ecart < 0
          ? `Régularisation des charges ${annee} : complément de ${eur(-ecart)} dû par le locataire`
          : `Régularisation des charges ${annee} : trop-perçu de ${eur(ecart)} en faveur du locataire`) + suffixeFinalise,
      details: { bail_id: bailId, annee, ecart, libelle: phraseSolde },
    });
    if (erreurAlerte) {
      console.error("[regularisation] alerte du solde non appelé non enregistrée", erreurAlerte.message);
      alerteManquante = true;
    } else {
      revalidatePath(`/agence/${orgId}/alertes`);
    }
  }
  const complements = [
    phraseSolde,
    exerciceEnCours ? "Enregistrée sur un exercice non terminé : comparaison non homogène, elle ne se modifie plus." : "",
    alerteManquante ? "Attention : l’alerte n’a pas pu être créée, notez ce solde pour ne pas l’oublier." : "",
    prep.avertissement ?? "",
  ].filter(Boolean);
  return { succes: [msg, ...complements].join(" ") };
}

// Générer les appels de loyer manquants (échéancier) jusqu'au mois courant.
export async function genererAppels(orgId: string, bailId: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("generer_appels_loyer", { p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `${data ?? 0} appel(s) de loyer généré(s).` };
}

/** Un encaissement déjà enregistré par cet envoi : de quoi le dire à l'écran. */
type EncaissementDeLEnvoi = { bail_id: string; montant: number; date_paiement: string };

/**
 * Cherche l'encaissement que cette clé d'envoi a déjà écrit (D05). La lecture passe par la RLS : elle ne voit que les
 * encaissements de l'organisation (et, pour un agent restreint, de son portefeuille).
 */
async function encaissementDeLEnvoi(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  cle: string
): Promise<{ ligne: EncaissementDeLEnvoi | null } | { erreur: string }> {
  const { data, error } = await supabase
    .from("encaissements")
    .select("bail_id, montant, date_paiement")
    .eq("organization_id", orgId)
    .eq("cle_envoi", cle)
    .maybeSingle();
  if (error) return { erreur: "Impossible de vérifier que cet encaissement n'est pas déjà enregistré. Réessayez." };
  return { ligne: (data as EncaissementDeLEnvoi | null) ?? null };
}

// Saisir un encaissement (imputé automatiquement du plus ancien au plus récent).
//
// D05 (PR178-B-06) : le formulaire envoie une clé (`cle_envoi`), la même à chaque nouvel envoi du même formulaire. Un
// envoi déjà reçu n'écrit rien (ni encaissement, ni reçu, ni quittance) et l'écran dit « déjà enregistré ». La clé
// est reconnue AVANT tout calcul, et l'index unique de la base reste le garde-fou quand deux envois se croisent.
//
// D04 (2) (VER-TS-02) : au-delà de 2 × (reste dû + un terme), l'action n'écrit pas ; elle renvoie un état
// « confirmation requise ». Le formulaire se ressoumet avec `confirmation_montant`, qui porte le montant confirmé.
export async function ajouterEncaissement(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const lu = lireMontant(formData.get("montant"));
  if ("erreur" in lu) return { erreur: lu.erreur, valeurs };
  const montant = lu.montant;
  const date = String(formData.get("date_paiement") ?? "").trim() || null;
  const dateRefusee = verifierDateDejaPassee(date, "La date d'encaissement");
  if (dateRefusee) return { erreur: dateRefusee, valeurs };
  const mode = String(formData.get("mode") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const cleLue = lireCleEnvoi(formData.get("cle_envoi"));
  if ("erreur" in cleLue) return { erreur: cleLue.erreur, valeurs };
  const cle = cleLue.cle;

  // Un envoi déjà reçu (réponse perdue, double clic, nouvel essai) : on le dit, on n'écrit rien.
  const dejaEnregistre = (ligne: EncaissementDeLEnvoi): EtatLoyers => {
    if (ligne.bail_id !== bailId) {
      return {
        erreur: "Cette référence d'envoi a déjà servi pour un autre dossier. Rechargez la page avant d'enregistrer.",
        valeurs,
      };
    }
    revalidatePath(`/agence/${orgId}/baux/${bailId}`);
    revalidatePath(`/agence/${orgId}/comptabilite`);
    return {
      succes: messageDejaEnregistre({
        objet: "Cet encaissement",
        montant: Number(ligne.montant),
        date: ligne.date_paiement,
        montantSaisi: montant,
      }),
      dejaEnregistre: true,
    };
  };
  const connu = await encaissementDeLEnvoi(supabase, orgId, cle);
  if ("erreur" in connu) return { erreur: connu.erreur, valeurs };
  if (connu.ligne) return dejaEnregistre(connu.ligne);

  // L'état d'AVANT, lu avant l'écriture : la couverture des termes n'est
  // stockée nulle part (etat_loyers_bail la recalcule depuis le total
  // encaissé), donc seul l'écart avant/après dit où l'argent est allé.
  const { data: lignesAvant, error: erreurAvant } = await supabase.rpc("etat_loyers_bail", {
    p_bail: bailId,
  });
  if (erreurAvant) return { erreur: sansJargon(erreurAvant.message), valeurs };

  // D04 (2) : le montant est-il plausible au regard du dû ? Sans terme appelé, le terme est celui du bail.
  const termes = (lignesAvant ?? []) as LigneTerme[];
  let termeDuBail = 0;
  if (termes.length === 0) {
    const { data: bail } = await supabase
      .from("baux")
      .select("loyer_hc, charges")
      .eq("id", bailId)
      .eq("organization_id", orgId)
      .maybeSingle();
    termeDuBail = Math.round(Number(bail?.loyer_hc ?? 0) * 100 + Number(bail?.charges ?? 0) * 100) / 100;
  }
  const verdict = evaluerEncaissement(montant, termes, termeDuBail);
  if (verdict.confirmationRequise && !confirmationDonnee(formData.get(CHAMP_CONFIRMATION_MONTANT), montant)) {
    return { confirmation: verdict.confirmation, valeurs };
  }

  const { error } = await supabase.from("encaissements").insert({
    organization_id: orgId,
    bail_id: bailId,
    montant,
    date_paiement: date ?? undefined,
    mode,
    note,
    cle_envoi: cle,
  });
  if (error) {
    // Deux envois de la même clé se sont croisés : l'autre a gagné, celui-ci n'a rien écrit.
    if (estRejeuCleEnvoi(error)) {
      const gagnant = await encaissementDeLEnvoi(supabase, orgId, cle);
      if ("ligne" in gagnant && gagnant.ligne) return dejaEnregistre(gagnant.ligne);
      return {
        succes: "Cet encaissement est déjà enregistré : il n'a pas été enregistré une seconde fois.",
        dejaEnregistre: true,
      };
    }
    return { erreur: sansJargon(error.message), valeurs };
  }
  // L'encaissement déclenche tout : reçu du montant réglé sur un paiement
  // partiel, promu en quittance quand le mois se solde — sans clic de plus.
  // (Le déclencheur en base l'a déjà fait pendant l'INSERT : cet appel est un
  // filet, ses compteurs valent 0 et ne peuvent pas servir de compte rendu.)
  const emission = await emettreRecusQuittances(supabase, bailId);
  const { data: lignesApres, error: erreurApres } = await supabase.rpc("etat_loyers_bail", {
    p_bail: bailId,
  });
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // L'encaissement écrit au journal (loyer + honoraires) : la compta suit.
  revalidatePath(`/agence/${orgId}/comptabilite`);
  if (erreurApres)
    return {
      succes: `Encaissement enregistré — l'imputation n'a pas pu être relue : ${sansJargon(erreurApres.message)}`,
    };
  const compteRendu = compteRenduEncaissement(
    montant,
    (lignesAvant ?? []) as EtatAppel[],
    (lignesApres ?? []) as EtatAppel[]
  );
  if (emission.erreur)
    return { succes: `${compteRendu} Rattrapage des documents en échec : ${emission.erreur}` };
  return { succes: compteRendu };
}

// Supprimer un encaissement, c'est CORRIGER le journal : la suppression
// contre-passe automatiquement les écritures déjà écrites (RM-A6.3 —
// l'écriture ne se modifie pas, on supprime et on ressaisit). Une correction
// comptable porte le motif de son auteur (RM-A6.6, règle bloquante du
// livrable A6) : on le collecte ici, comme la justification d'imputation d'un
// incident, et on le passe à la base, qui l'inscrit sur la contre-écriture.
export async function supprimerEncaissement(
  orgId: string,
  bailId: string,
  encId: string,
  formData?: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const motif = String(formData?.get("motif") ?? "").trim();
  if (!motif) {
    return {
      erreur: "Dites pourquoi vous retirez cet encaissement : le motif reste au journal.",
    };
  }
  const { error } = await supabase.rpc("supprimer_encaissement", {
    p_encaissement: encId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: "Encaissement supprimé — le motif est inscrit au journal." };
}

// Réviser le loyer selon l'IRL (clause requise, DPE F/G bloqué, prescription 1 an).
// L'indice de RÉFÉRENCE n'est pas saisi ici : il est figé au bail à sa signature
// (RM-3.8.2) et la base le lit elle-même. Seul l'indice du trimestre de révision,
// saisi par l'admin d'agence (RM-3.8.3), est fourni.
export async function reviserLoyer(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  // L'indice se lit sur le texte tel que tapé (« 145,17 » vaut 145,17) : champ en `type="text"` (VFL-07).
  const indiceSaisi = String(formData.get("irl_nouveau") ?? "").trim();
  const indiceLu = indiceSaisi ? lireDecimal(indiceSaisi) : { valeur: 0 };
  if ("erreur" in indiceLu) return { erreur: erreurDuChamp("Indice IRL", indiceLu.erreur), valeurs };
  const nouv = indiceLu.valeur;
  // Audit 29/09 : on saisit la date de la DEMANDE, pas la date d'effet. La
  // base en déduit l'effet — l'anniversaire si la demande tombe ce jour-là,
  // sinon la date de la demande, sans rétroactivité (art. 17-1 I).
  const dateDemande = String(formData.get("date_demande") ?? "").trim();
  // Constat 21 : l'indice nouveau est celui du trimestre de référence du bail.
  const trimestre = String(formData.get("irl_trimestre_numero") ?? "").trim();
  const anneeIndice = String(formData.get("irl_trimestre_annee") ?? "").trim();
  if (!nouv || !dateDemande || !trimestre || !anneeIndice)
    return {
      erreur: "Indice IRL, trimestre et année de l'indice, et date de la demande obligatoires.",
      valeurs,
    };
  const { data, error } = await supabase.rpc("reviser_loyer", {
    p_bail: bailId,
    p_irl_nouveau: nouv,
    p_irl_trimestre: `T${trimestre} ${anneeIndice}`,
    p_date_demande: dateDemande,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `Loyer révisé à ${data} € HC.` };
}

// Rattrapage manuel : régénérer les reçus (paiements partiels) et quittances
// (mois soldés) du bail — l'encaissement les émet normalement tout seul.
export async function emettreQuittances(orgId: string, bailId: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const emission = await emettreRecusQuittances(supabase, bailId);
  if (emission.erreur) return { erreur: emission.erreur };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/comptabilite`);
  if (emission.quittances + emission.recus === 0)
    return { succes: "Rien à régénérer : reçus et quittances sont à jour." };
  return { succes: `${libelleEmission(emission.quittances, emission.recus)}.` };
}
