"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { preparerFichierGed, type FichierPrepareGed } from "@/lib/ged-depot";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { lireMontant } from "@/lib/saisie-montant";
import { genererDocument } from "./documents-generes";

// Le Storage n'est pas transactionnel : quand la règle métier refuse la
// retenue, l'octet est déjà monté. Sans fiche il est déjà illisible (la policy
// du bucket exige un document vivant), mais il porte des données du locataire :
// il part dans la file de purge physique, vidée par le Super Admin. Échec
// éventuel ignoré — l'agent doit lire le refus métier, pas un incident de
// ménage.
async function abandonnerPiece(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  piece: FichierPrepareGed
): Promise<void> {
  await supabase.rpc("purger_fichier_sans_fiche", { p_storage_path: piece.chemin });
}

export type EtatRestit = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

export async function demarrerRestitution(
  orgId: string,
  bailId: string,
  _etat: EtatRestit,
  formData: FormData
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const date = String(formData.get("date_remise_cles") ?? "").trim();
  if (!date) return { erreur: "Date de remise des clés obligatoire.", valeurs };
  const conforme = formData.get("conforme") === "on";
  const { error } = await supabase.rpc("demarrer_restitution", {
    p_bail: bailId,
    p_date_remise: date,
    p_conforme: conforme,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // Décision D35 (1) : tant que la restitution est « en cours », le même geste la corrige —
  // la base ne réarrête alors aucun montant.
  return {
    succes:
      formData.get("correction") === "1"
        ? "Remise des clés corrigée — les montants arrêtés ne changent pas."
        : "Restitution démarrée.",
  };
}

export async function ajouterRetenue(
  orgId: string,
  bailId: string,
  restitutionId: string,
  _etat: EtatRestit,
  formData: FormData
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const libelle = String(formData.get("libelle") ?? "").trim();
  if (!libelle) return { erreur: "Libellé obligatoire.", valeurs };
  // Montant lu sur le texte tel que tapé (« 840,00 » vaut 840) : champ en `type="text"` (VFL-07).
  const coutLu = lireMontant(formData.get("cout"));
  if ("erreur" in coutLu) return { erreur: coutLu.erreur, valeurs };
  const cout = coutLu.montant;
  const dureeStr = String(formData.get("duree_vie") ?? "").trim();
  const ageStr = String(formData.get("age") ?? "").trim();

  // Le justificatif ne doit exister en GED que si la retenue existe. Refuser
  // une retenue est courant et légitime — « Élément entièrement amorti »
  // (RM-2.4.5), « Sans EDL d'entrée » (RM-2.4.3) : à l'ancien ordre (dépôt
  // puis RPC), chaque refus laissait derrière lui une pièce rattachée à rien
  // qui, par son empreinte, interdisait ensuite de redéposer le même devis.
  // L'octet monte au Storage (non transactionnel, il précède forcément), la
  // fiche naît dans la transaction de la retenue — ou n'existe jamais.
  let piece: FichierPrepareGed | null = null;
  let avertissement: string | undefined;
  const fichier = formData.get("justificatif");
  if (fichier instanceof File && fichier.size > 0) {
    const prep = await preparerFichierGed(supabase, orgId, fichier);
    if (prep.erreur || !prep.fichier) return { erreur: prep.erreur ?? "Échec du dépôt du justificatif.", valeurs };
    piece = prep.fichier;
    avertissement = prep.avertissement;
  }

  const { error } = piece
    ? await supabase.rpc("ajouter_retenue_avec_justificatif", {
        p_restitution: restitutionId,
        p_libelle: libelle,
        p_cout: cout,
        p_duree_vie: dureeStr ? Number(dureeStr) : null,
        p_age: ageStr ? Number(ageStr) : null,
        p_storage_path: piece.chemin,
        p_mime: piece.mime,
        p_taille: piece.taille,
        p_empreinte: piece.empreinte,
      })
    : await supabase.rpc("ajouter_retenue", {
        p_restitution: restitutionId,
        p_libelle: libelle,
        p_cout: cout,
        p_duree_vie: dureeStr ? Number(dureeStr) : null,
        p_age: ageStr ? Number(ageStr) : null,
        p_justificatif: null,
      });
  if (error) {
    if (piece) await abandonnerPiece(supabase, piece);
    return { erreur: sansJargon(error.message), valeurs };
  }
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: avertissement ? `Retenue ajoutée. ${avertissement}` : "Retenue ajoutée." };
}

export async function supprimerRetenue(
  orgId: string,
  bailId: string,
  retenueId: string
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  // Revue 29/08 : le DELETE direct ne supprimait rien (aucune policy DELETE)
  // tout en affichant « Retenue retirée » — on passe par la fonction, qui
  // ferme aussi l'alerte « sans justificatif » liée à cette retenue.
  const { error } = await supabase.rpc("supprimer_retenue", { p_retenue: retenueId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Retenue retirée." };
}

// Justificatif fourni après coup : ferme l'alerte « retenue sans justificatif »
// (alerte liée à son événement d'origine — décision 29/08).
export async function justifierRetenue(
  orgId: string,
  bailId: string,
  retenueId: string,
  _etat: EtatRestit,
  formData: FormData
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const fichier = formData.get("justificatif");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le devis ou la facture." };
  // Même indivisibilité qu'à l'ajout : « Cette retenue a déjà un justificatif »
  // (double-clic, deux agents sur le même dossier) ne doit pas laisser la
  // seconde pièce derrière lui.
  const prep = await preparerFichierGed(supabase, orgId, fichier);
  if (prep.erreur || !prep.fichier) return { erreur: prep.erreur ?? "Échec du dépôt du justificatif." };
  const piece = prep.fichier;
  const { error } = await supabase.rpc("justifier_retenue_avec_piece", {
    p_retenue: retenueId,
    p_storage_path: piece.chemin,
    p_mime: piece.mime,
    p_taille: piece.taille,
    p_empreinte: piece.empreinte,
  });
  if (error) {
    await abandonnerPiece(supabase, piece);
    return { erreur: sansJargon(error.message) };
  }
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: prep.avertissement ? `Justificatif joint. ${prep.avertissement}` : "Justificatif joint." };
}

// Le dépôt et les impayés du décompte sont un INSTANTANÉ pris au démarrage, pas
// un calcul permanent. Entre le démarrage et la finalisation, le locataire
// règle souvent son arriéré — précisément parce qu'on le lui réclame pour qu'il
// récupère son dépôt. À quelle date les impayés DOIVENT être arrêtés n'est
// tranché nulle part (le wiki porte la question en « point à trancher ») : on
// ne décide donc pas à la place du gérant, on lui donne le geste. Refusé en
// base une fois le décompte figé (RM-2.7.3).
export async function rafraichirMontantsRestitution(
  orgId: string,
  bailId: string,
  restitutionId: string
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("rafraichir_montants_restitution", {
    p_restitution: restitutionId,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return {
    succes: `Montants réarrêtés à aujourd'hui — impayés imputés : ${Number(data)} €.`,
  };
}

// Décompte envoyé au locataire : l'événement qui ferme l'alerte d'envoi.
export async function marquerDecompteEnvoye(
  orgId: string,
  bailId: string,
  restitutionId: string,
  _etat: EtatRestit,
  formData: FormData
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const date = String(formData.get("date") ?? "").trim();
  if (!date) return { erreur: "Indiquez la date d'envoi.", valeurs };
  const { error } = await supabase.rpc("marquer_decompte_envoye", {
    p_restitution: restitutionId,
    p_date: date,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  // Décision D36 (option C) : à l'envoi, le décompte devient une pièce de « Mes
  // documents » du locataire sortant. L'envoi est déjà enregistré : si la pièce
  // ne peut pas être mise à disposition, on le dit, on ne l'annule pas.
  const miseADisposition = await mettreDecompteADisposition(supabase, orgId, bailId);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/documents`);
  const base = "Décompte marqué envoyé — l'alerte d'envoi est fermée.";
  return {
    succes: miseADisposition.ok
      ? `${base} Il est à disposition du locataire dans « Mes documents ».`
      : `${base} En revanche, le décompte n'a pas pu être mis à disposition du locataire dans « Mes documents » (${miseADisposition.raison}). Générez le décompte PDF, puis mettez-le à disposition depuis Documents.`,
  };
}

// Génère le décompte de restitution (PDF rangé en GED, rattaché au bail et aux
// locataires) puis le met à disposition du locataire : c'est la pièce
// « décompte » de son espace (D36). Le geste de mise à disposition est celui de
// partager_document_locataire (RM-12) ; ici il est déclenché par l'envoi, que
// l'écran annonce avant la validation.
async function mettreDecompteADisposition(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  bailId: string
): Promise<{ ok: true } | { ok: false; raison: string }> {
  try {
    const generation = await genererDocument(
      orgId,
      "decompte_restitution",
      bailId,
      `/agence/${orgId}/baux/${bailId}`
    );
    if (!generation.documentId || generation.erreur) {
      return { ok: false, raison: generation.erreur ?? "le PDF n'a pas pu être généré" };
    }
    const { error } = await supabase.rpc("partager_document_locataire", {
      p_org: orgId,
      p_doc: generation.documentId,
      p_partager: true,
    });
    if (error) return { ok: false, raison: sansJargon(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, raison: "une erreur technique est survenue" };
  }
}

export async function finaliserDecompte(
  orgId: string,
  bailId: string,
  restitutionId: string
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("finaliser_decompte", { p_restitution: restitutionId });
  if (error) return { erreur: sansJargon(error.message) };
  const solde = Number(data);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // La restitution écrit au journal : la page comptabilité suit.
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return {
    succes:
      solde < 0
        ? `Décompte finalisé — créance de ${Math.abs(solde)} € sur le locataire.`
        : `Décompte finalisé — ${solde} € à restituer au locataire.`,
  };
}
