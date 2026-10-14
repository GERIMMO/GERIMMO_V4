import { createClient } from "@/lib/supabase/server";
import { ROLES_GERANTS } from "@/lib/ged";
import { tracerTraversee } from "@/lib/traversee";
import type { GesteTrace } from "@/lib/gestes-trace";

// Garde des actions locataire : session valide + adhésion 'locataire' dans
// l'agence — défense en profondeur avant tout chemin Storage, les policies et
// fonctions definer revérifient en base. `lecture: true` (routes fichier)
// accepte l'adhésion DÉSACTIVÉE : le locataire sorti garde ses documents en
// consultation (quittances 10 ans, décompte — chantier D2) ; les gestes, eux,
// restent réservés à l'adhésion active.
export async function verifierLocataire(orgId: string, options: { lecture?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .in("status", options.lecture ? ["active", "inactive"] : ["active"])
    .eq("role", "locataire")
    .maybeSingle();
  if (!adhesion) return { supabase, user: null };
  return { supabase, user };
}

// Garde d'accès GED (actions et route fichier) : session valide + adhésion
// active avec un rôle gérant dans l'agence demandée.
// `geste` (D08, relecture) : une action financière y dit son nom et sa cible, pour que la
// trace d'une entrée du super-administrateur nomme le geste et le bail visés (lib/gestes-trace.ts).
// Sans effet sur les droits : seule la ligne d'audit d'une traversée le lit.
export async function verifierGerant(orgId: string, geste?: GesteTrace) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null };
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !ROLES_GERANTS.includes(adhesion.role)) {
    // Le super admin agit partout avec le rôle plein de l'organisation
    // (décision Tahir 09/09) — la base revérifie via org_ids_avec_roles.
    const { data: superAdmin } = await supabase.rpc("is_super_admin");
    if (superAdmin) {
      const { data: org } = await supabase
        .from("organizations")
        .select("type")
        .eq("id", orgId)
        .maybeSingle();
      if (org) {
        // RM-A1.11 : la traversée est autorisée mais tracée (journal d'audit).
        // Un échec du log ne bloque pas l'action. D08 (audit du 13/10, SA-01) :
        // « traversee_action » ne part que d'une requête qui peut écrire (action
        // serveur, formulaire) ; la lecture d'un fichier ou le contrôle d'un
        // dossier à l'affichage d'une page s'écrivent comme une consultation.
        // La ligne dit la page et l'objet concernés et la décision d'accès.
        await tracerTraversee(supabase, { orgId, nature: "geste", resultat: "autorise", geste });
        return {
          supabase,
          user,
          role: org.type === "proprietaire_direct" ? "proprietaire_direct" : "admin_agence",
        };
      }
      await tracerTraversee(supabase, { orgId, nature: "geste", resultat: "refuse", motif: "organisation_introuvable", geste });
    }
    return { supabase, user: null, role: null };
  }
  return { supabase, user, role: adhesion.role as string };
}
