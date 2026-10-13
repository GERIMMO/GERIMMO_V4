"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";

export type EtatSessionArtisan = { erreur?: string };

/** Diagnostic motivé, trente minutes en lecture seule, auteur réel conservé. */
export async function entrerDansSessionArtisan(
  artisanId: string,
  _etat: EtatSessionArtisan,
  formData: FormData
): Promise<EtatSessionArtisan> {
  const motif = String(formData.get("motif") ?? "").trim();
  if (motif.length < 3 || motif.length > 1000) return { erreur: "Indiquez le motif du diagnostic (3 à 1000 caractères)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ouvrir_session_artisan", {
    p_artisan: artisanId,
    p_motif: motif || null,
  });
  if (error) return { erreur: `Entrée impossible : ${sansJargon(error.message)}` };
  redirect("/artisan");
}

/** Refermer la traversée et revenir à la fiche du client. */
export async function quitterSessionArtisan(formData: FormData) {
  const retour = String(formData.get("artisan_id") ?? "").trim();
  const supabase = await createClient();
  // Une fermeture ne se refuse pas : même en échec, on quitte le portail —
  // rester dedans en croyant en être sorti serait le pire des deux.
  await supabase.rpc("fermer_session_artisan");
  redirect(retour ? `/admin/clients/artisans/${retour}` : "/admin/clients");
}
