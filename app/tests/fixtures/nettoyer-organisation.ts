/**
 * Retire d'une base de test une organisation fictive et tout ce qu'elle porte.
 *
 * Les essais de CONCURRENCE (deux sessions qui ne se voient qu'après un commit) ne peuvent pas jouer dans une
 * transaction annulée : leur fixture est validée, donc à nettoyer. Sans cela, les lignes restent dans la base partagée
 * de la suite et faussent les tests qui comptent « toute la table » (ex. `reprise-comptable.test.ts`).
 *
 * Exige une base locale jetable (rôle propriétaire) : `session_replication_role = replica` suspend les clés étrangères et
 * les déclencheurs le temps du nettoyage (les journaux en écriture seule refusent sinon la suppression). Les comptes de
 * connexion sont retirés ensuite, déclencheurs en marche, pour que leurs lignes dérivées partent avec eux.
 */
import type { Client } from "pg";

export async function supprimerOrganisationDeTest(admin: Client, org: string | undefined, comptes: string[]): Promise<void> {
  if (!org) return;
  await admin.query("reset role");
  await admin.query("begin");
  try {
    await admin.query("set local session_replication_role = replica");
    const { rows } = await admin.query<{ table_name: string }>(
      `select c.table_name
         from information_schema.columns c
         join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and c.column_name = 'organization_id' and t.table_type = 'BASE TABLE'`
    );
    for (const { table_name } of rows) await admin.query(`delete from public."${table_name}" where organization_id = $1`, [org]);
    await admin.query("delete from public.organizations where id = $1", [org]);
    if (comptes.length) await admin.query("delete from public.audit_log where account_id = any($1::uuid[])", [comptes]);
    await admin.query("commit");
  } catch (erreur) {
    await admin.query("rollback");
    throw erreur;
  }
  if (comptes.length) await admin.query("delete from auth.users where id = any($1::uuid[])", [comptes]);
}
