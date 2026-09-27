// Le nom de la personne connectée dans une organisation (audit du 27/09).
//
// Le propriétaire direct était salué « Bonjour » tout court et son avatar
// portait « P » (l'initiale de son « Parc ») : le prénom n'était lu que dans
// les métadonnées du compte, remplies à l'inscription seulement. Sa fiche
// personne (« Moreau Claire ») existe pourtant, rattachée à son compte : on
// la lit d'abord, les métadonnées ensuite.

import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type IdentiteCompte = { prenom: string | null; nom: string | null };

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Initiales « prénom nom » : « CM » pour Claire Moreau ; null si rien de connu. */
export function initialesDe(identite: IdentiteCompte): string | null {
  const i = `${identite.prenom?.[0] ?? ""}${identite.nom?.[0] ?? ""}`.toUpperCase();
  return i || null;
}

export const identiteDuCompte = cache(async function identiteDuCompte(
  supabase: SupabaseClient,
  orgId: string,
  user: Pick<User, "id" | "user_metadata">
): Promise<IdentiteCompte> {
  const { data } = await supabase
    .from("persons")
    .select("nom, prenom")
    .eq("organization_id", orgId)
    .eq("account_id", user.id)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  const meta = (user.user_metadata ?? {}) as { prenom?: unknown; nom?: unknown };
  return {
    prenom: texte(data?.prenom) ?? texte(meta.prenom),
    nom: texte(data?.nom) ?? texte(meta.nom),
  };
});
