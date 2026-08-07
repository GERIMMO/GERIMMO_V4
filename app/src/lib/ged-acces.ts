import { createClient } from "@/lib/supabase/server";
import { ROLES_GERANTS } from "@/lib/ged";

// Garde d'accès GED (actions et route fichier) : session valide + adhésion
// active avec un rôle gérant dans l'agence demandée
export async function verifierGerant(orgId: string) {
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
    return { supabase, user: null, role: null };
  }
  return { supabase, user, role: adhesion.role as string };
}
