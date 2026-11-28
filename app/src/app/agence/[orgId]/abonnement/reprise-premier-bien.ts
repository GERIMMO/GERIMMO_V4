"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { baseEspace } from "@/lib/racine-espace";

type EtatReprise = { erreur?: string };

export async function reprendreEssaiPremierBien(orgId: string): Promise<EtatReprise> {
  const { supabase, estProprietaire, role, traverseeLectureSeule } = await verifierAccesEspace(orgId);
  if (!estProprietaire || role !== "proprietaire_direct" || traverseeLectureSeule) {
    return { erreur: "Seul le titulaire de l’espace peut le rouvrir." };
  }
  const { data: fin, error } = await supabase.rpc("rouvrir_essai_premier_bien", { p_org: orgId });
  if (error) return { erreur: "Votre espace n’a pas pu être rouvert. Réessayez dans un instant." };
  if (!fin) return { erreur: "La réouverture n’est plus disponible. Rechargez la page pour voir l’état de votre espace." };

  const base = baseEspace(orgId, estProprietaire);
  revalidatePath(base, "layout");
  redirect(`${base}/parc/nouveau`);
}
