"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";

export type EtatSessionArtisan = { erreur?: string };

/**
 * ENTRER DANS LA SESSION D'UN ARTISAN (19/09).
 *
 * « Je veux pas une simple vue, je souhaite entrer dans sa session comme si
 * j'étais l'artisan. » La bascule est en base : `ouvrir_session_artisan` pose
 * une traversée bornée à trente minutes, et `mon_artisan_id()` — la pièce
 * maîtresse du portail — rend dès lors l'artisan visé. Les écrans du portail
 * suivent sans une ligne de changement, écritures comprises.
 *
 * La supervision garde SON identité de compte : tout ce qui enregistre un
 * auteur enregistre le superviseur, et l'ouverture est au journal d'audit.
 */
export async function entrerDansSessionArtisan(
  artisanId: string,
  _etat: EtatSessionArtisan,
  formData: FormData
): Promise<EtatSessionArtisan> {
  const motif = String(formData.get("motif") ?? "").trim();
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
