import type { Client, QueryResult, QueryResultRow } from "pg";

/**
 * Exécute une requête de MISE EN PLACE sous le propriétaire des tables, puis
 * rend l'identité simulée (rôle `authenticated`/`anon` et jeton en cours).
 *
 * Depuis l'audit agence du 27/09, un client de l'API ne crée plus un bail
 * directement « actif », ne change plus son état et ne modifie plus un bail
 * signé (trigger `baux_a_verrou_hors_fonctions`) : ces gestes passent par les
 * fonctions de la base. Les tests qui ont besoin d'un bail vivant comme simple
 * décor le posent donc comme le ferait une reprise de données — sous le
 * propriétaire — sans changer ce qu'ils éprouvent ensuite sous l'identité de
 * l'utilisateur.
 */
export async function requeteProprietaire<R extends QueryResultRow = QueryResultRow>(
  db: Client,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<R>> {
  const {
    rows: [{ role }],
  } = await db.query<{ role: string }>("select current_user::text as role");
  await db.query("reset role");
  try {
    return await db.query<R>(sql, params);
  } finally {
    const {
      rows: [{ session }],
    } = await db.query<{ session: string }>("select session_user::text as session");
    if (role !== session) await db.query(`set local role ${role}`);
  }
}
