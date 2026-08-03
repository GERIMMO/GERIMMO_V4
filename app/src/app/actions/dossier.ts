"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { TYPES_PIECE_DOSSIER } from "@/lib/dossier";

export type EtatDossier = { erreur?: string; succes?: string };

// Déposer une pièce au dossier d'une personne. Si `remplace_id` est fourni, la
// nouvelle pièce remplace une version antérieure (versioning intégral RM-0b.4.1 :
// l'ancienne est conservée, seule la courante s'affiche).
export async function deposerPieceDossier(
  orgId: string,
  personId: string,
  _etat: EtatDossier,
  formData: FormData
): Promise<EtatDossier> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  const type = String(formData.get("type") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  const remplaceId = String(formData.get("remplace_id") ?? "").trim();
  const expireLe = String(formData.get("expire_le") ?? "").trim();

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez un fichier." };
  }
  if (!(type in TYPES_PIECE_DOSSIER)) {
    return { erreur: "Type de pièce invalide." };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { erreur: "Fichier trop volumineux (10 Mo maximum)." };
  }

  const resultat = await deposerFichierGed(supabase, user, orgId, fichier, type, titre);
  if (resultat.erreur || !resultat.documentId) {
    return { erreur: resultat.erreur ?? "Échec du dépôt." };
  }

  // Rattachement à la personne (le dossier suit la personne, RM-0b.7.2)
  const { error: erreurLien } = await supabase.from("document_liens").insert({
    document_id: resultat.documentId,
    organization_id: orgId,
    entite: "personne",
    entite_id: personId,
  });
  if (erreurLien) {
    return { erreur: `Pièce déposée mais rattachement en échec : ${sansJargon(erreurLien.message)}` };
  }

  // Versioning (remplace une version antérieure) + date d'expiration (attestation)
  const maj: { remplace_id?: string; expire_le?: string } = {};
  if (remplaceId) maj.remplace_id = remplaceId;
  if (expireLe) maj.expire_le = expireLe;
  if (Object.keys(maj).length > 0) {
    const { error: erreurMaj } = await supabase
      .from("documents")
      .update(maj)
      .eq("id", resultat.documentId)
      .eq("organization_id", orgId);
    if (erreurMaj) {
      return { erreur: `Pièce déposée mais mise à jour en échec : ${sansJargon(erreurMaj.message)}` };
    }
  }

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: remplaceId ? "Nouvelle version déposée." : "Pièce ajoutée au dossier." };
}
