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

  // Perf 30/08 : l'adhésion et son organisation en un seul aller-retour
  // (deux requêtes en cascade auparavant, sur chaque page de l'espace).
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role, organisation:organizations(id, name, status, type, essai_fin)")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !ROLES_GERANTS.includes(adhesion.role)) {
    // Le SUPER ADMIN entre partout (décision Tahir 09/09 : « toutes les
    // autorisations ») : sans adhésion locale, il porte le rôle plein de
    // l'organisation visitée — la base le reconnaît de son côté
    // (org_ids_avec_roles), la traçabilité reste au compte.
    const { data: superAdmin } = await supabase.rpc("is_super_admin");
    if (superAdmin) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name, status, type, essai_fin")
        .eq("id", orgId)
        .maybeSingle();
      if (org) {
        // RM-A1.11 : la traversée est autorisée mais tracée (journal d'audit).
        // Un échec du log ne bloque pas la page. cache() par requête : un log
        // par page visitée, c'est voulu.
        await supabase.rpc("log_sa_access", { org: orgId, sa_action: "traversee_espace" });
        return {
          supabase,
          user,
          role: org.type === "proprietaire_direct" ? "proprietaire_direct" : "admin_agence",
          organisation: org,
          estProprietaire: org.type === "proprietaire_direct",
        };
      }
    }
    redirect("/espaces");
  }
  const organisation = (Array.isArray(adhesion.organisation)
    ? adhesion.organisation[0]
    : adhesion.organisation) as {
    id: string;
    name: string;
    status: string;
    type: string;
    essai_fin: string | null;
  } | null;
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
// 'locataire' et on récupère sa fiche personne. Une adhésion DÉSACTIVÉE
// (locataire sorti) garde l'espace en LECTURE : quittances (10 ans), décompte
// de restitution, justificatifs — les gestes, eux, exigent l'adhésion active
// (chantier D2 de l'audit du 06/09). La RLS ne couvrant que les adhésions
// actives, le contexte passe par une RPC definer.
export const verifierAccesEspaceLocataire = cache(async function verifierAccesEspaceLocataire(
  orgId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: contexte } = await supabase.rpc("mon_espace_locataire", { p_org: orgId });
  const espace = ((contexte ?? []) as {
    organisation_nom: string;
    person_id: string | null;
    nom: string | null;
    prenom: string | null;
    adhesion_active: boolean;
  }[])[0];
  if (!espace) redirect("/espaces");

  return {
    supabase,
    user,
    organisation: { id: orgId, name: espace.organisation_nom },
    personne: espace.person_id
      ? { id: espace.person_id, nom: espace.nom ?? "", prenom: espace.prenom }
      : null,
    adhesionActive: espace.adhesion_active,
  };
});
