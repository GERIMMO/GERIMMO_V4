"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { envoyerEmail } from "@/lib/email";
import { corpsQuittance, sujetQuittance } from "@/lib/quittance-email";
import { eur } from "@/lib/ged";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { emettreRecusQuittances, libelleEmission } from "@/lib/quittances";
import { compteRenduEncaissement, type EtatAppel } from "@/lib/imputation";

export type EtatLoyers = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Envoyer une quittance par email au locataire (API Resend).
export async function envoyerQuittance(
  orgId: string,
  bailId: string,
  quittanceId: string
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

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

  const { data } = await supabase.rpc("quittance_detail", { p_quittance: quittanceId });
  const q = ((data ?? []) as {
    emetteur: string;
    periode: string;
    loyer_hc: number;
    charges: number;
    montant: number;
    est_quittance: boolean;
  }[])[0];
  if (!q) return { erreur: "Quittance introuvable." };

  const origine = (await headers()).get("origin") ?? "";
  // Le corps vit dans lib/quittance-email : la tâche planifiée envoie le même
  // document, et deux mises en forme pour une même quittance ne s'expliquent
  // pas au locataire qui la conserve.
  const message = {
    estQuittance: q.est_quittance,
    periode: q.periode,
    loyerHc: q.loyer_hc,
    charges: q.charges,
    montant: q.montant,
    emetteur: q.emetteur,
    prenom: loc.prenom,
    lien: `${origine}/quittance/${quittanceId}`,
  };
  const html = corpsQuittance(message);

  const envoi = await envoyerEmail({ to: loc.email, subject: sujetQuittance(message), html });
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
    .eq("organization_id", orgId);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  if (erreurMemo) {
    return {
      succes: `Quittance envoyée à ${loc.email}, mais l'envoi n'a pas pu être mémorisé — le bouton peut réapparaître.`,
    };
  }
  return { succes: `Quittance envoyée à ${loc.email}.` };
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
  const reelles = Number(String(formData.get("charges_reelles") ?? "").trim());
  if (!annee) return { erreur: "Année invalide.", valeurs };
  if (Number.isNaN(reelles) || reelles < 0) return { erreur: "Charges réelles invalides.", valeurs };
  const fichier = formData.get("justificatif");
  if (!(fichier instanceof File) || fichier.size === 0)
    return { erreur: "Le justificatif est obligatoire (décompte remis au locataire).", valeurs };
  const depot = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", `Décompte de charges ${annee}`);
  if (depot.erreur || !depot.documentId) return { erreur: depot.erreur ?? "Échec du dépôt du justificatif.", valeurs };

  const { data, error } = await supabase.rpc("regulariser_charges", {
    p_bail: bailId,
    p_annee: annee,
    p_charges_reelles: reelles,
    p_justificatif: depot.documentId,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  const ecart = Number(data);
  const msg =
    ecart > 0
      ? `Trop-perçu de ${eur(ecart)} à rembourser au locataire.`
      : ecart < 0
        ? `Complément de ${eur(Math.abs(ecart))} dû par le locataire.`
        : "Charges équilibrées (aucun écart).";
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // La régularisation passe au journal : la page comptabilité suit.
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: msg };
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

// Saisir un encaissement (imputé automatiquement du plus ancien au plus récent).
export async function ajouterEncaissement(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!montant || montant <= 0) return { erreur: "Montant invalide.", valeurs };
  const date = String(formData.get("date_paiement") ?? "").trim() || null;
  const mode = String(formData.get("mode") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  // L'état d'AVANT, lu avant l'écriture : la couverture des termes n'est
  // stockée nulle part (etat_loyers_bail la recalcule depuis le total
  // encaissé), donc seul l'écart avant/après dit où l'argent est allé.
  const { data: lignesAvant, error: erreurAvant } = await supabase.rpc("etat_loyers_bail", {
    p_bail: bailId,
  });
  if (erreurAvant) return { erreur: sansJargon(erreurAvant.message), valeurs };

  const { error } = await supabase.from("encaissements").insert({
    organization_id: orgId,
    bail_id: bailId,
    montant,
    date_paiement: date ?? undefined,
    mode,
    note,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
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
  const nouv = Number(String(formData.get("irl_nouveau") ?? "").trim());
  const dateEffet = String(formData.get("date_effet") ?? "").trim();
  if (!nouv || !dateEffet)
    return { erreur: "Indice IRL du trimestre et date d'effet obligatoires.", valeurs };
  const { data, error } = await supabase.rpc("reviser_loyer", {
    p_bail: bailId,
    p_irl_nouveau: nouv,
    p_date_effet: dateEffet,
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
