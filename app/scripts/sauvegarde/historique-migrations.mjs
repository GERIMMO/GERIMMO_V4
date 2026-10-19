/** L'historique manque aux copies anciennes, qui restent restaurables. */
export async function verifierHistoriqueMigrations(client, requis) {
  const { rows: [{ present }] } = await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present");
  if (!present) {
    if (requis) throw new Error('Historique des migrations absent de la restauration.');
    return { present: false, versions: null };
  }
  const { rows: [{ versions }] } = await client.query('select count(*)::int as versions from supabase_migrations.schema_migrations');
  return { present: true, versions };
}
