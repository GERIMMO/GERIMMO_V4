"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";

export type EtatDevisAdmin = { erreur?: string };

// Console SA : marquer une demande de devis comme traitée (la réponse part
// par email, hors plateforme). La RLS réserve l'update au super admin.
export async function marquerDevisTraitee(id: string): Promise<EtatDevisAdmin> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("demandes_devis")
    .update({ traitee_le: new Date().toISOString() })
    .eq("id", id);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/admin/devis");
  return {};
}
