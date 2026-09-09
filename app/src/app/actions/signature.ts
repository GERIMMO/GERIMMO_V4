"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { detecterMimeReel, EXTENSIONS } from "@/lib/file-type";

export type EtatSignature = {
  erreur?: string;
  succes?: string;
};

// Signature préenregistrée de l'organisation (chantier documentaire 08/09) :
// une image (PNG/JPEG, fond clair) apposée sur les documents émis SEULE —
// quittances, reçus, courriers. Jamais sur un bail ni un EDL : là, la
// signature reste un acte des parties. Réservé au responsable. L'enregistrement
// passe par une RPC (audit 09/09) : elle met l'ancien fichier en file de purge
// — une signature manuscrite est une donnée personnelle, rien ne traîne.
export async function enregistrerSignature(
  orgId: string,
  _etat: EtatSignature,
  formData: FormData
): Promise<EtatSignature> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation." };
  }
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez l'image de votre signature (PNG ou JPEG)." };
  }
  if (fichier.size > 1_000_000) {
    return { erreur: "Image trop lourde (1 Mo maximum) — une signature scannée suffit." };
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMimeReel(octets);
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return { erreur: "Format refusé : PNG ou JPEG uniquement (contenu vérifié)." };
  }

  const chemin = `${orgId}/signature-${randomUUID()}.${EXTENSIONS[mime]}`;
  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (erreurUpload) return { erreur: sansJargon(erreurUpload.message) };

  const { error } = await supabase.rpc("definir_signature_organisation", {
    p_org: orgId,
    p_path: chemin,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/profil`);
  return {
    succes:
      "Signature enregistrée — elle s'apposera désormais sur vos quittances, reçus et courriers générés.",
  };
}

export async function retirerSignature(orgId: string): Promise<EtatSignature> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation." };
  }
  const { error } = await supabase.rpc("definir_signature_organisation", {
    p_org: orgId,
    p_path: null,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/profil`);
  return { succes: "Signature retirée — la zone restera vierge sur les prochains documents." };
}

// « Envoyer pour signature » : le document généré devient visible dans
// l'espace du signataire (carte « À signer » de Mes documents) — il le
// télécharge, le signe et dépose le PDF signé ; le retour vous alerte.
// La RPC porte les gardes (audit 09/09) : types signables seulement (bail,
// courrier, quittance — jamais un EDL, RM-13.1.6), signataire rattaché AU
// document, espace locataire actif obligatoire (sinon la demande partait
// dans le vide), une seule demande en attente par document et personne.
// Signature en ligne (Yousign) : chantier S10.
export async function envoyerPourSignature(
  orgId: string,
  documentId: string,
  personId: string
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("envoyer_pour_signature", {
    p_org: orgId,
    p_document: documentId,
    p_person: personId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/documents`);
  return {
    succes:
      "Envoyé pour signature — le document apparaît dans « À signer » de son espace ; vous serez alerté au retour du signé.",
  };
}

// Annuler une demande en attente (mauvais destinataire, signature obtenue
// autrement) — le document disparaît de son « À signer ».
export async function annulerDemandeSignature(
  orgId: string,
  demandeId: string
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("annuler_demande_signature", {
    p_org: orgId,
    p_demande: demandeId,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/documents`);
  return { succes: "Demande annulée." };
}

// Mise à disposition (RM-12 : un geste, jamais un effet de bord) : rend une
// quittance ou un courrier généré visible dans « Mes documents » du locataire
// rattaché — ou l'en retire.
export async function partagerDocument(
  orgId: string,
  documentId: string,
  partager: boolean
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("partager_document_locataire", {
    p_org: orgId,
    p_doc: documentId,
    p_partager: partager,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/documents`);
  return {
    succes: partager
      ? "Mis à disposition — le locataire le voit dans « Mes documents »."
      : "Retiré de l'espace du locataire.",
  };
}
