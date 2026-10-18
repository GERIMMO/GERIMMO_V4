"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { detecterMimeReel, EXTENSIONS } from "@/lib/file-type";
import { annulerDemandeYoutrust, configurationYoutrust, lireDemandeYoutrust, supprimerBrouillonYoutrust } from "@/lib/youtrust";

export type EtatSignature = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
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
  const { data: responsableReel, error: erreurDroit } = await supabase.rpc("has_org_role", {
    org: orgId, roles: ROLES_RESPONSABLES,
  });
  if (erreurDroit || !responsableReel) return { erreur: "La signature est réservée au responsable de l’organisation, hors accès de supervision." };
  if(formData.get("autorisation_signature")!=="on") return {erreur:"Confirmez que cette signature est la vôtre et autorisez son utilisation sur vos documents courants."};
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
  const { data: responsableReel, error: erreurDroit } = await supabase.rpc("has_org_role", {
    org: orgId, roles: ROLES_RESPONSABLES,
  });
  if (erreurDroit || !responsableReel) return { erreur: "La signature est réservée au responsable de l’organisation, hors accès de supervision." };
  const { error } = await supabase.rpc("definir_signature_organisation", {
    p_org: orgId,
    p_path: null,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/profil`);
  return { succes: "Signature retirée — la zone restera vierge sur les prochains documents." };
}

export async function envoyerPourSignature(_orgId:string,_documentId:string,_personId:string):Promise<EtatSignature> {
  return {erreur:"Les nouveaux engagements se signent avec Zoho depuis la fiche du document. Les anciennes demandes restent consultables."};
}

// Les anciennes demandes restent annulables et leurs retours restent lisibles.
// Les nouveaux engagements passent par le circuit Zoho du document.
// Annuler une demande en attente (mauvais destinataire, signature obtenue
// autrement) — le document disparaît de son « À signer ».
export async function annulerDemandeSignature(
  orgId: string,
  demandeId: string
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const droit = await supabase.rpc("has_org_role", {org:orgId,roles:["proprietaire_direct","admin_agence","agent"]});
  if(droit.error || !droit.data)return {erreur:"L’annulation exige un rôle de gestion dans cet espace."};
  const demande = await supabase.from("demandes_signature").select("prestataire,external_request_id,signee_le").eq("id",demandeId).eq("organization_id",orgId).single();
  if(demande.error || !demande.data)return {erreur:"Demande introuvable."};
  if(demande.data.signee_le)return {erreur:"Cette demande a déjà été signée."};
  if(demande.data.prestataire === "youtrust") {
    const config=configurationYoutrust();
    if(!config || config.environnement!=="production" || !demande.data.external_request_id)return {erreur:"La connexion au prestataire est nécessaire pour confirmer l’arrêt de cette signature."};
    try {
      const distant=await lireDemandeYoutrust(config,demande.data.external_request_id);
      if(distant.id!==demande.data.external_request_id || distant.external_id!==demandeId)return {erreur:"Le rattachement au prestataire doit être vérifié avant d’annuler."};
      if(distant.status==="done")return {erreur:"Le document est déjà signé chez le prestataire. Actualisez son suivi."};
      if(distant.status==="draft")await supprimerBrouillonYoutrust(config,distant.id);
      else if(["ongoing","approval"].includes(distant.status)) {
        await annulerDemandeYoutrust(config,distant.id);
        if((await lireDemandeYoutrust(config,distant.id)).status!=="canceled")return {erreur:"L’arrêt n’est pas encore confirmé. La demande reste suivie dans Gerimmo."};
      } else if(!["expired","declined","rejected","canceled","deleted"].includes(distant.status))return {erreur:"L’état de cette signature nécessite une vérification avant son annulation."};
    } catch {return {erreur:"L’arrêt chez le prestataire n’a pas pu être confirmé. La demande est conservée dans Gerimmo."};}
  }
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
