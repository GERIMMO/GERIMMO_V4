"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { estUuid } from "@/lib/identifiants";

export type ResultatSuppressionBail = { erreur?: string; succes?: string; retour?: string };

export async function supprimerBailBrouillon(orgId: string, bailId: string): Promise<ResultatSuppressionBail> {
  if (!estUuid(orgId) || !estUuid(bailId)) return { erreur: "Ce brouillon est introuvable." };
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  // Le contrôle et la suppression sont atomiques, même si le bail a été
  // activé dans un autre onglet depuis l’ouverture de la confirmation.
  const { data, error } = await supabase.rpc("supprimer_bail_brouillon", { p_org: orgId, p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message) };
  if (data?.bail_id !== bailId || !estUuid(data?.lot_id) || !estUuid(data?.bien_id)) {
    return { erreur: "La suppression n’a pas pu être confirmée. Rechargez la liste des baux." };
  }
  const ficheLot = `/agence/${orgId}/parc/${data.bien_id}/lots/${data.lot_id}`;
  for (const chemin of [ficheLot, `/agence/${orgId}/parc/${data.bien_id}`, `/agence/${orgId}/parc`, `/agence/${orgId}/baux/${bailId}`, `/agence/${orgId}`]) {
    revalidatePath(chemin);
  }
  return { succes: "Brouillon supprimé.", retour: `${ficheLot}#baux` };
}
