import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const fichiers = ['20261016110000_devis_pdf_versions_alerte', '20261016110100_rdv_relance_accuse_agenda', '20261016180000_relais_retention_sentinelle', '20261016190000_relance_report_reprise_sans_envoi'];
const sql = (fichier: string, retour = false) => readFileSync(new URL(`../supabase/${retour ? 'retours-arriere' : 'migrations'}/${fichier}${retour ? '.retour' : ''}.sql`, import.meta.url), 'utf8');
const signatures = [
  ['public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)', 'public.envoyer_mon_devis_prepare(uuid,integer)', 'public.lire_devis_pdf_version(uuid,integer)'],
  ['public.mes_demandes_rdv_artisan()', 'public.accuser_annulation_rdv(uuid)', 'public.reports_rdv_a_relancer(integer)', 'public.noter_relance_report_rdv(uuid,boolean)'],
  ['public.purger_journal_cron()', 'public.sentinelle_relais()', 'public.appliquer_retention()'],
  ['public.reserver_relance_report_rdv(uuid)', 'public.liberer_relance_report_rdv(uuid,uuid)'],
];
describe.skipIf(!url)('Retours du 16 octobre : registre et nouvelle application par le chantier', () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query('begin'); });
  beforeEach(async () => {
    await db.query('savepoint cas');
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key)');
    for (const f of fichiers) await db.query('insert into supabase_migrations.schema_migrations(version) values($1) on conflict(version) do nothing', [f.slice(0, 14)]);
    await db.query("insert into supabase_migrations.schema_migrations(version) values('20000101000000') on conflict(version) do nothing");
  });
  afterEach(async () => { await db.query('rollback to savepoint cas'); });
  afterAll(async () => { await db?.query('rollback'); await db?.end(); });
  const empreinte = async (i: number) => (await db.query("select md5(string_agg(pg_get_functiondef(s::regprocedure)||coalesce((select proacl::text from pg_proc where oid=s::regprocedure),''),'|' order by s)) e from unnest($1::text[]) s", [signatures[i]])).rows[0].e;
  for (const [i, f] of fichiers.entries()) it(`${f.slice(0, 14)} : retire uniquement sa version, puis le même fichier redevient applicable`, async () => {
    const version = f.slice(0, 14);
    // Le même contrôle préalable que migrations.yml : une version déjà inscrite est refusée.
    const garde = `do $garde$ begin if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then raise exception 'Version déjà enregistrée'; end if; end $garde$;`;
    await db.query('savepoint refuse');
    await expect(db.query(garde)).rejects.toThrow('Version déjà enregistrée');
    await db.query('rollback to savepoint refuse');
    // D22 : son complément de réservation se retire d'abord ; les fonctions du palier initial sont ensuite comparées.
    if (i === 1) await db.query(sql(fichiers[3], true));
    const avant = await empreinte(i);
    await db.query(sql(f, true));
    expect((await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version])).rows).toEqual([]);
    expect((await db.query("select version from supabase_migrations.schema_migrations where version='20000101000000'")).rowCount).toBe(1);
    await db.query(garde);
    await db.query(sql(f));
    await db.query('insert into supabase_migrations.schema_migrations(version) values($1)', [version]);
    expect(await empreinte(i)).toBe(avant);
    expect((await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version])).rowCount).toBe(1);
    // Une erreur dans le lot contrôlé restaure ensemble les définitions et l'historique.
    await db.query('savepoint panne');
    await expect(db.query(sql(f, true) + '\nselect 1/0;')).rejects.toThrow(/division by zero/);
    await db.query('rollback to savepoint panne');
    expect(await empreinte(i)).toBe(avant);
    expect((await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version])).rowCount).toBe(1);
  });
  it('D22 refuse un retour hors ordre sans retirer sa version ni ses fonctions', async () => {
    const avant = await empreinte(1);
    await db.query('savepoint ordre');
    await expect(db.query(sql(fichiers[1], true))).rejects.toThrow(/20261016190000/);
    await db.query('rollback to savepoint ordre');
    expect(await empreinte(1)).toBe(avant);
    expect((await db.query("select version from supabase_migrations.schema_migrations where version='20261016110100'")).rowCount).toBe(1);
  });
});
