import type { Client } from "pg";

/**
 * Rejoue un geste « comme si on était un autre jour » : `public.aujourdhui_paris()` est remplacée, dans la transaction du
 * test (annulée à la fin), par une date fixe, le temps du geste, puis rendue à sa définition.
 *
 * Pourquoi (décision Q23 du 24/11/2026) : la révision du loyer d'une année se demande pendant un an ; passé ce délai, la
 * base la refuse, même avec une demande antidatée. Un test qui enregistre aujourd'hui « la révision de l'an dernier » puis
 * « celle de cette année » n'est donc plus possible tel quel : la première s'enregistre le jour où elle a été demandée.
 *
 * `jour` est une expression SQL de date, évaluée AVANT de figer (ex. « public.aujourdhui_paris() - interval '1 year' »).
 * `enGerant` reprend la session du gérant : remplacer la fonction demande le rôle propriétaire de la base.
 */
export async function auJourDeParis<T>(db: Client, jour: string, enGerant: () => Promise<void>, geste: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  const { rows: [avant] } = await db.query<{ def: string; j: string }>(
    `select pg_get_functiondef('public.aujourdhui_paris()'::regprocedure) as def, to_char((${jour})::date, 'YYYY-MM-DD') as j`);
  await db.query(`create or replace function public.aujourdhui_paris() returns date language sql stable set search_path = '' as $$ select date '${avant.j}' $$`);
  await enGerant();
  try {
    return await geste();
  } finally {
    await db.query("reset role");
    await db.query(avant.def);
    await enGerant();
  }
}
