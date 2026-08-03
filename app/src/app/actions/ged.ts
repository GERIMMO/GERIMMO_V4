"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { TYPES_DEPOSABLES } from "@/lib/ged";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";

export type EtatDepot = { erreur?: string; succes?: string };

export async function deposerDocument(
  orgId: string,
  _etat: EtatDepot,
  formData: FormData
): Promise<EtatDepot> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  const type = String(formData.get("type") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  const personneId = String(formData.get("personne") ?? "");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez un fichier." };
  }
  if (!(TYPES_DEPOSABLES as readonly string[]).includes(type)) {
    return { erreur: "Type de document invalide." };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { erreur: "Fichier trop volumineux (10 Mo maximum)." };
  }

  const resultat = await deposerFichierGed(supabase, user, orgId, fichier, type, titre);
  if (resultat.erreur || !resultat.documentId) {
    return { erreur: resultat.erreur ?? "Échec du dépôt." };
  }

  // Rattachement complémentaire (module 12) : la personne si choisie
  if (personneId) {
    const { error: erreurLien } = await supabase.from("document_liens").insert({
      document_id: resultat.documentId,
      organization_id: orgId,
      entite: "personne",
      entite_id: personneId,
    });
    if (erreurLien) {
      return { erreur: `Document déposé mais rattachement en échec : ${sansJargon(erreurLien.message)}` };
    }
  }

  revalidatePath(`/agence/${orgId}/documents`);
  return { succes: "Document déposé." };
}
