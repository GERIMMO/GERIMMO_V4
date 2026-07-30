import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_GERANTS } from "@/lib/ged";

// Garde commune des pages de l'espace agence (partagé avec le propriétaire
// direct dès le S2 — parcours communs du plan). La RLS protège les données ;
// cette garde protège la navigation et fournit le contexte de page.
// cache() : layout et page l'appellent dans la même requête — une seule exécution.
export const verifierAccesEspace = cache(async function verifierAccesEspace(
  orgId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !ROLES_GERANTS.includes(adhesion.role)) {
    redirect("/espaces");
  }

  const { data: organisation } = await supabase
    .from("organizations")
    .select("id, name, status")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  return { supabase, user, role: adhesion.role as string, organisation };
});
