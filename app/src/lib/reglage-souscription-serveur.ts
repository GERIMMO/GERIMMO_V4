import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Lecture à chaque requête, y compris à la confirmation d'un paiement.
 *
 * Seconde reprise du 24/11/2026 (relecture T4R-02) : la vente aux particuliers SANS médiateur de la consommation est
 * une décision à part, datée (`vente_particuliers_sans_mediateur_le`, migration 20261125106000). Elle est lue par une
 * requête séparée : si la colonne manque (code déployé avant sa migration) ou si la lecture échoue, la décision vaut
 * « non prise » — fermé par défaut — sans fermer pour autant ce que les deux autres réglages ouvrent.
 */
export async function lireReglageSouscription() {
  const db = await createClient();
  const [{ data, error }, decision] = await Promise.all([
    db.from("supervision_identite")
      .select("blocage_souscription_identite,souscriptions_payantes_ouvertes,revision")
      .eq("singleton", true).maybeSingle(),
    db.from("supervision_identite").select("vente_particuliers_sans_mediateur_le").eq("singleton", true).maybeSingle(),
  ]);
  const indisponible = Boolean(error) || typeof data?.blocage_souscription_identite !== "boolean"
    || !Number.isSafeInteger(data?.revision);
  const date = decision?.error ? null : (decision?.data as { vente_particuliers_sans_mediateur_le?: unknown } | null | undefined)?.vente_particuliers_sans_mediateur_le;
  return {
    blocageIdentiteActif: indisponible || data.blocage_souscription_identite !== false,
    ventesOuvertes: !indisponible && data?.souscriptions_payantes_ouvertes === true,
    /** Date de la décision « vendre aux particuliers sans médiateur », ou `null` : non prise, retirée ou illisible. */
    venteSansMediateurLe: !indisponible && typeof date === "string" && !Number.isNaN(Date.parse(date)) ? date : null,
    revision: indisponible ? null : data.revision as number,
    indisponible,
  };
}
