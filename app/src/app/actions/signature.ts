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
// signature reste un acte des parties. Réservé au responsable.
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

  const { error, data } = await supabase
    .from("organizations")
    .update({ signature_path: chemin })
    .eq("id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message) };
  if (!data?.length) return { erreur: "Modification refusée." };

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
  const { error, data } = await supabase
    .from("organizations")
    .update({ signature_path: null })
    .eq("id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message) };
  if (!data?.length) return { erreur: "Modification refusée." };
  revalidatePath(`/agence/${orgId}/profil`);
  return { succes: "Signature retirée — la zone restera vierge sur les prochains documents." };
}

// « Envoyer pour signature » : le document généré devient visible dans
// l'espace du signataire (carte « À signer » de Mes documents) — il le
// télécharge, le signe et dépose le PDF signé ; le retour vous alerte.
// Signature en ligne (Yousign) : chantier S10 — d'ici là, le circuit est
// celui du dépôt du document signé.
export async function envoyerPourSignature(
  orgId: string,
  documentId: string,
  personId: string
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: existante } = await supabase
    .from("demandes_signature")
    .select("id")
    .eq("organization_id", orgId)
    .eq("document_id", documentId)
    .eq("person_id", personId)
    .is("signee_le", null)
    .maybeSingle();
  if (existante) {
    return { erreur: "Ce document est déjà en attente de signature chez cette personne." };
  }

  const { error } = await supabase.from("demandes_signature").insert({
    organization_id: orgId,
    document_id: documentId,
    person_id: personId,
    created_by: user.id,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/documents`);
  return {
    succes:
      "Envoyé pour signature — le document apparaît dans « À signer » de son espace ; vous serez alerté au retour du signé.",
  };
}
