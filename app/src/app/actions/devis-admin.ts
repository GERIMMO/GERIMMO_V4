"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";

export type EtatDevisAdmin = { erreur?: string; succes?: string };

// Console SA : marquer une demande commerciale comme traitée (la réponse part
// par email, hors plateforme).
//
// Audit console 27/09 (majeur 6) : l'action s'en remettait à la RLS — hors
// droits, l'update touchait 0 ligne SANS erreur, et l'écran affichait un
// succès. Désormais : garde serveur (superviseur permanent, double
// vérification), passage par `demande_devis_traitee` qui refuse, journalise
// et dit si la demande était déjà traitée.
export async function marquerDevisTraitee(id: string): Promise<EtatDevisAdmin> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "Demande introuvable." };
  const supabase = await createClient();
  const { data: autorise, error: acces } = await supabase.rpc("is_permanent_super_admin");
  if (acces || autorise !== true) {
    return { erreur: "Ce geste demande votre compte de supervision et sa double vérification." };
  }
  const { data, error } = await supabase.rpc("demande_devis_traitee", { p_demande: id });
  if (error) return { erreur: /introuvable/i.test(error.message) ? "Demande introuvable." : sansJargon(error.message) };
  revalidatePath("/admin/devis");
  revalidatePath("/admin/brief");
  if (data !== true) return { erreur: "Cette demande était déjà marquée traitée : rien n’a changé." };
  return { succes: "Demande marquée traitée." };
}
