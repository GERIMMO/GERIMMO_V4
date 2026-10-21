import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

const source = process.env.SUPABASE_DB_URL;
if (source) {
  const u = new URL(source);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['127.0.0.1', 'localhost'].includes(u.hostname)
    || !/^\/gerimmo_ci_[a-z_]+$/.test(u.pathname)) throw new Error('Base locale fictive obligatoire.');
}
const migration = readFileSync('supabase/migrations/20261021175930_nettoyage_initial_comptes.sql', 'utf8');
describe.skipIf(!source)('Effacement initial : isolation et conservation vérifiées sur le schéma complet', () => {
  const nom = 'gerimmo_ci_nettoyage_' + randomBytes(5).toString('hex').replace(/[0-9]/g, n => String.fromCharCode(107 + Number(n)));
  let admin: Client, db: Client;
  let garde: { sa: string; empreinte: string; nombre: number; organisations: number; artisans: number };
  const inventaire = async () => (await db.query(`select
    (select account_id from public.memberships where role='super_admin' and organization_id is null limit 1) sa,
    md5(string_agg(id::text,',' order by id)) empreinte, count(*)::int nombre,
    (select count(*)::int from public.organizations) organisations,
    (select count(*)::int from public.artisans) artisans
    from auth.users where id not in (select account_id from public.memberships where role='super_admin')`)).rows[0];
  const nettoyer = (g = garde) => db.query('select pg_temp.nettoyer_comptes_initial($1,$2,$3,$4,$5) as bilan', [g.sa, g.empreinte, g.nombre, g.organisations, g.artisans]);
  beforeAll(async () => {
    const url = new URL(source!); url.pathname = '/postgres';
    admin = new Client({ connectionString: url.href }); await admin.connect();
    await admin.query(`create database "${nom}"`); url.pathname = '/' + nom;
    const p = spawnSync(process.execPath, ['e2e/local/preparer-ci.mjs'], { env: { ...process.env, SUPABASE_DB_URL: url.href }, encoding: 'utf8', timeout: 90_000 });
    expect(p.status, p.stderr).toBe(0);
    url.pathname = '/' + nom + '_api'; db = new Client({ connectionString: url.href }); await db.connect();
    await db.query(migration.split('do $operation$')[0]);
    garde = await inventaire();
    await db.query("insert into public.publications(periode,titre,auteur_account_id) values('test-nettoyage','Article à conserver',$1)", [garde.sa]);
    await db.query('insert into auth.sessions(user_id) select id from auth.users');
  }, 120_000);
  beforeEach(async () => { await db.query('begin'); });
  afterEach(async () => { await db.query('rollback'); });
  afterAll(async () => {
    await db?.end();
    if (admin) { for (const n of [nom + '_api', nom]) await admin.query(`drop database if exists "${n}" with (force)`); await admin.end(); }
  });
  it('refuse un inventaire modifié', async () => { await expect(nettoyer({ ...garde, empreinte: 'inexacte' })).rejects.toThrow('Inventaire'); });
  it('refuse un nouvel inscrit après le recensement', async () => {
    await db.query("insert into auth.users(email,raw_app_meta_data,raw_user_meta_data) values('nouveau@example.com','{}','{}')");
    await expect(nettoyer()).rejects.toThrow('Inventaire');
  });
  it('refuse un autre superadmin actif', async () => {
    await db.query("insert into public.memberships(account_id,role) select id,'super_admin' from auth.users where id<>$1 limit 1", [garde.sa]);
    await expect(nettoyer()).rejects.toThrow('autre superadmin');
  });
  it('refuse le rattachement du superadmin à un espace ciblé', async () => {
    await db.query("insert into public.memberships(account_id,organization_id,role) select $1,id,'admin_agence' from public.organizations limit 1", [garde.sa]);
    await expect(nettoyer()).rejects.toThrow('espaces non isolé');
  });
  it('refuse une recette encore ouverte', async () => {
    await db.query("insert into cron.job(jobname) values('recette-expiration-test')");
    await expect(nettoyer()).rejects.toThrow('recette est encore ouverte');
  });
  it('annule tout si un article appartient à un compte supprimé', async () => {
    await db.query("insert into public.publications(periode,titre,auteur_account_id) select 'test','Article protégé',id from auth.users where id<>$1 limit 1", [garde.sa]);
    await db.query('savepoint garde');
    await expect(nettoyer()).rejects.toThrow('contenu ou réglage protégé');
    await db.query('rollback to savepoint garde');
    expect((await inventaire()).nombre).toBe(garde.nombre);
  });
  it('supprime comptes, dossiers et sessions associés en conservant superadmin, article et réglages', async () => {
    const reglages = (await db.query('select to_jsonb(t) as t from public.marketing_reglages t')).rows;
    const resultat = (await nettoyer()).rows[0].bilan;
    expect(resultat).toMatchObject({ comptes_supprimes: garde.nombre, superadmin_conserve: true });
    expect((await db.query('select id from auth.users')).rows).toEqual([{ id: garde.sa }]);
    for (const table of ['organizations','artisans','persons','biens','lots','baux']) expect((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, table).toBe(0);
    expect((await db.query('select user_id from auth.sessions')).rows).toEqual([{ user_id: garde.sa }]);
    expect((await db.query('select to_jsonb(t) as t from public.marketing_reglages t')).rows).toEqual(reglages);
    expect((await db.query("select count(*)::int n from public.publications where titre='Article à conserver'")).rows[0].n).toBe(1);
  }, 30_000);
  it('reste sans effet hors du projet autorisé', async () => {
    const avant = await inventaire(); await db.query(migration); expect(await inventaire()).toEqual(avant);
  });
});
