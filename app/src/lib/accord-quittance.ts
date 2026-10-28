import type { SupabaseClient } from "@supabase/supabase-js";

/** À appeler dans avantEnvoi, après la préparation du document et de la marque. */
export async function verifierAccordQuittance(db: SupabaseClient, orgId: string, bailId: string, destinataire: string) {
  const { data, error } = await db.rpc("quittance_envoi_autorise", { p_org: orgId, p_bail: bailId, p_destinataire: destinataire });
  if (error) throw new Error("L’accord du locataire ne peut plus être vérifié. Aucun envoi effectué.");
  if (data !== true) throw new Error("L’accord électronique ou l’adresse du locataire a changé. Aucun envoi effectué ; actualisez le dossier.");
}
