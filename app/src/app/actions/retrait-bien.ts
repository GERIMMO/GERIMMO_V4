"use server";

// Retirer un bien du parc, ou l'y remettre (audit du 27/09).
//
// « Un bien retiré n'est plus compté le mois suivant » : la phrase figurait
// sur « Mon abonnement », la FAQ et la page d'accueil, sans qu'aucun geste
// permette de retirer un bien. Le retrait est un ARCHIVAGE ([[Archivage
// plutôt que suppression]]) : le bien et ses lots libres sortent du parc et
// du comptage de l'abonnement, l'historique reste, et le geste se défait.
// La base garde la règle (`retirer_bien`, déclencheur `garde_archivage_bien`) :
// pas de retrait d'un bien qui porte un bail ou un mandat en cours.

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatRetraitBien = { erreur?: string; succes?: string };

function revalider(orgId: string, bienId: string) {
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/parc`);
  revalidatePath(`/agence/${orgId}/abonnement`);
  revalidatePath(`/agence/${orgId}`);
}

export async function retirerBien(
  orgId: string,
  bienId: string,
  _etat: EtatRetraitBien,
  _formData: FormData
): Promise<EtatRetraitBien> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("retirer_bien", { p_org: orgId, p_bien: bienId });
  if (error) return { erreur: sansJargon(error.message) };
  revalider(orgId, bienId);
  return { succes: "Bien retiré du parc actif ; votre historique est conservé. Consultez Mon abonnement pour vérifier la formule correspondant au portefeuille restant et programmer une baisse à la prochaine échéance." };
}

export async function retablirBien(
  orgId: string,
  bienId: string,
  _etat: EtatRetraitBien,
  _formData: FormData
): Promise<EtatRetraitBien> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("retablir_bien", { p_org: orgId, p_bien: bienId });
  if (error) return { erreur: sansJargon(error.message) };
  revalider(orgId, bienId);
  return {
    succes:
      "Bien remis au parc. Réactivez ses lots depuis la liste ci-dessus ; la capacité disponible est vérifiée avant toute remise en gestion.",
  };
}
