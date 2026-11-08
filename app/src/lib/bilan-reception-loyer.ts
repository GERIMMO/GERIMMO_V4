import type { SupabaseClient } from "@supabase/supabase-js";
import { disponibilitesQuittances, type DisponibiliteQuittance } from "@/lib/quittance-conforme";

export type BilanReception = {
  statut: "regle" | "partiel" | "non_recu";
  comptabilise?: boolean;
  informationEnvoi?: string;
  document?: {
    id: string;
    quittance: boolean;
    disponibilite: DisponibiliteQuittance;
    envoyeLe: string | null;
  };
};

async function verifierEcriture(db: SupabaseClient, orgId: string, bailId: string, cle: string) {
  const paiement = await db.from("encaissements").select("id")
    .eq("organization_id", orgId).eq("bail_id", bailId).eq("cle_envoi", cle).maybeSingle();
  if (paiement.error || !paiement.data) return false;
  const ecriture = await db.from("ecritures").select("id")
    .eq("organization_id", orgId).eq("bail_id", bailId).eq("encaissement_id", paiement.data.id)
    .eq("categorie", "loyer").eq("sens", "recette").limit(1).maybeSingle();
  return !ecriture.error && Boolean(ecriture.data);
}

async function lireJustificatif(db: SupabaseClient, orgId: string, bailId: string, appelId: string) {
  const { data, error } = await db.from("quittances").select("id,est_quittance,email_envoye_at")
    .eq("organization_id", orgId).eq("bail_id", bailId).eq("appel_id", appelId).maybeSingle();
  if (error || !data) return undefined;
  const disponibilites = await disponibilitesQuittances(db, [data.id]);
  return { id: data.id as string, quittance: data.est_quittance === true,
    disponibilite: disponibilites[data.id], envoyeLe: data.email_envoye_at as string | null };
}

export async function bilanApresPaiement(db: SupabaseClient, orgId: string, bailId: string, appelId: string,
  statut: "regle" | "partiel", cle: string | null): Promise<BilanReception> {
  // Le paiement a déjà été validé. Une lecture indisponible après coup doit rester
  // « à vérifier », sans présenter le paiement comme échoué ni demander de le ressaisir.
  const [comptes, piece] = await Promise.allSettled([
    cle ? verifierEcriture(db, orgId, bailId, cle) : undefined,
    lireJustificatif(db, orgId, bailId, appelId),
  ]);
  return { statut, comptabilise: comptes.status === "fulfilled" ? comptes.value : false,
    document: piece.status === "fulfilled" ? piece.value : undefined };
}
