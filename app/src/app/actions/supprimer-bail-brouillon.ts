"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { estUuid } from "@/lib/identifiants";
import { baseEspace } from "@/lib/racine-espace";

export type ResultatSuppressionBail = { erreur?: string; succes?: string; retour?: string };

export async function supprimerBailBrouillon(orgId: string, bailId: string): Promise<ResultatSuppressionBail> {
  if (!estUuid(orgId) || !estUuid(bailId)) return { erreur: "Ce brouillon est introuvable." };
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  // Le contrôle et la suppression sont atomiques, même si le bail a été
  // activé dans un autre onglet depuis l’ouverture de la confirmation.
  const { data, error } = await supabase.rpc("supprimer_bail_brouillon", { p_org: orgId, p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message) };
  if (data?.bail_id !== bailId || !estUuid(data?.lot_id) || !estUuid(data?.bien_id)) {
    return { erreur: "La suppression n’a pas pu être confirmée. Rechargez la liste des baux." };
  }
  // Les chemins à revalider sont ceux des DOSSIERS (la route, restée /agence) ; le retour, lui, est l'adresse que
  // verra la personne : /espace/<id> chez le propriétaire direct (décision D27).
  const ficheLot = `/agence/${orgId}/parc/${data.bien_id}/lots/${data.lot_id}`;
  for (const chemin of [ficheLot, `/agence/${orgId}/parc/${data.bien_id}`, `/agence/${orgId}/parc`, `/agence/${orgId}/baux/${bailId}`, `/agence/${orgId}`]) {
    revalidatePath(chemin);
  }
  const retour = `${baseEspace(orgId, role === "proprietaire_direct")}/parc/${data.bien_id}/lots/${data.lot_id}#baux`;
  return { succes: "Brouillon supprimé.", retour };
}
