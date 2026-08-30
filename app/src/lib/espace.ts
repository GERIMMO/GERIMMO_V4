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
    .select("id, name, status, type, essai_fin")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  return {
    supabase,
    user,
    role: adhesion.role as string,
    organisation,
    // S9a : le propriétaire direct reprend les écrans de l'agence, sans
    // mandats ni honoraires — les pages s'adaptent sur ce seul drapeau.
    estProprietaire: organisation.type === "proprietaire_direct",
  };
});

// Garde de l'espace locataire (module 0b). Le locataire n'accède qu'à sa propre
// fiche et à ses pièces (RLS + fonctions definer) ; ici on vérifie l'adhésion
// 'locataire' et on récupère sa fiche personne.
export const verifierAccesEspaceLocataire = cache(async function verifierAccesEspaceLocataire(
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
    .eq("role", "locataire")
    .maybeSingle();
  if (!adhesion) redirect("/espaces");

  const { data: organisation } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  const { data: personne } = await supabase
    .from("persons")
    .select("id, nom, prenom")
    .eq("organization_id", orgId)
    .eq("account_id", user.id)
    .maybeSingle();

  return { supabase, user, organisation, personne };
});
