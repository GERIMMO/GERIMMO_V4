/**
 * Essai de publication « retours » du 25/11/2026, constat RET-01 : chaque retour du lot à publier retire SA PROPRE version
 * du registre des migrations (`supabase_migrations.schema_migrations`), sans quoi le chantier « Migrations Supabase »
 * refuserait de rejouer la migration (« version déjà enregistrée »). Cette ligne du registre n'est pas une donnée métier.
 *
 * Les tests qui vérifient qu'un retour « ne supprime rien » la retirent du texte avec cette fonction AVANT leurs propres
 * contrôles, qui restent entiers : elle exige de trouver la suppression une seule fois, pour cette version exacte, et ne
 * retire rien d'autre. Toute autre suppression reste refusée par ces contrôles. Voir tests/retours-lot-publication-registre.test.ts.
 */
export function sansRetraitDuRegistre(sql: string, version: string): string {
  if (!/^\d{14}$/.test(version)) throw new Error(`version sur 14 chiffres attendue : ${version}`);
  const clause = `delete from supabase_migrations.schema_migrations where version = '${version}';`;
  const occurrences = sql.split(clause).length - 1;
  if (occurrences !== 1) throw new Error(`retrait de la version ${version} du registre attendu une fois, trouvé ${occurrences} fois`);
  return sql.replace(clause, "");
}
