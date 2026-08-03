/**
 * Garde-fou : les tests d'intégration ne doivent pas viser la production.
 *
 * Ils s'exécutent dans une transaction annulée à la fin, mais un test qui
 * oublierait son « rollback », ou qui ferait du DDL, écrirait dans les données
 * réelles des agences. Le risque ne vaut pas la commodité.
 *
 * Pour lever le garde-fou en connaissance de cause (diagnostic ponctuel) :
 *   GERIMMO_AUTORISER_PROD=1 npm test
 */
const PROJET_PRODUCTION = "rddlxunppddzpsaatdaz";

export function verifierBaseDeTest(url: string | undefined): void {
  if (!url) return; // pas d'URL : les tests d'intégration se sautent d'eux-mêmes
  if (!url.includes(PROJET_PRODUCTION)) return;
  if (process.env.GERIMMO_AUTORISER_PROD === "1") return;

  throw new Error(
    "SUPABASE_DB_URL vise la base de PRODUCTION (" + PROJET_PRODUCTION + ").\n" +
      "Les tests d'intégration écrivent en base : pointez-les sur une branche " +
      "Supabase ou sur une base locale avant de les lancer.\n" +
      "Pour passer outre volontairement : GERIMMO_AUTORISER_PROD=1 npm test"
  );
}
