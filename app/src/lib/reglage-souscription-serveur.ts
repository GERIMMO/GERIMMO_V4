import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Lecture à chaque requête, y compris à la confirmation d'un paiement. */
export async function lireReglageSouscription() {
  const db = await createClient();
  const { data, error } = await db.from("supervision_identite")
    .select("blocage_souscription_identite,revision")
    .eq("singleton", true).maybeSingle();
  const indisponible = Boolean(error) || typeof data?.blocage_souscription_identite !== "boolean"
    || !Number.isSafeInteger(data?.revision);
  return {
    blocageIdentiteActif: indisponible || data.blocage_souscription_identite !== false,
    revision: indisponible ? null : data.revision as number,
    indisponible,
  };
}
