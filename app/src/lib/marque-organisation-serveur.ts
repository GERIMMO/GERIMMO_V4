import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarqueOrganisation } from "./marque-organisation";

/** Caller supplies its scoped client. Failure must never invent a verified identity. */
export async function chargerMarque(db: SupabaseClient, orgId: string): Promise<MarqueOrganisation | null> {
  const { data, error } = await db.from("organizations").select("name, nom_portail, logo_url, couleur_primaire, couleur_secondaire, domaine_personnalise, domaine_personnalise_verifie_le, email_expediteur, email_expediteur_verifie_le, email_contact").eq("id", orgId).maybeSingle();
  if (error || !data) return null;
  return data as MarqueOrganisation;
}
