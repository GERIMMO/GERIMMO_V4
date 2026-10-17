import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const source = process.env.SUPABASE_DB_URL;
const psql = process.env.RECETTE_PSQL ?? 'psql';
const disponible = Boolean(source && spawnSync(psql, ['--version']).status === 0);
// Ce test crée ses propres bases locales. Aucune URL distante, même munie d'un passe-droit.
if (source) {
  const cible = new URL(source);
  if (!['postgres:', 'postgresql:'].includes(cible.protocol) || !['127.0.0.1', 'localhost'].includes(cible.hostname)
    || !/^\/gerimmo_ci_[a-z_]+$/.test(cible.pathname)) throw new Error('Base locale fictive obligatoire.');
}

describe.skipIf(!disponible)('Cinq identités réutilisables : cycle réel en base locale', () => {
  const suffixe = 'r20261017000000-1';
  const nom = 'gerimmo_ci_fixes_' + randomBytes(5).toString('hex').replace(/[0-9]/g, n => String.fromCharCode(107 + Number(n)));
  const dossier = mkdtempSync(path.join(tmpdir(), 'gerimmo-fixes-'));
  let admin: Client, db: Client;
  let env: NodeJS.ProcessEnv;
  let ids: string[];
  const lancer = (action: string) => spawnSync(process.execPath, ['scripts/recette-production-comptes.mjs', action], { env, encoding: 'utf8', timeout: 60_000 });
  const identites = async () => (await db.query("select id from auth.users where raw_app_meta_data->>'gerimmo_recette'='permanente-v1' order by id")).rows.map(r => r.id);
  const supervision = async () => (await db.query("select count(*)::int n from public.memberships where role='super_admin'")).rows[0].n;

  beforeAll(async () => {
    const url = new URL(source!); url.pathname = '/postgres';
    admin = new Client({ connectionString: url.href }); await admin.connect();
    await admin.query(`create database "${nom}"`);
    url.pathname = '/' + nom;
    const preparation = spawnSync(process.execPath, ['e2e/local/preparer-ci.mjs'], { env: { ...process.env, SUPABASE_DB_URL: url.href }, encoding: 'utf8', timeout: 90_000 });
    expect(preparation.status, 'Préparation des seules bases fictives').toBe(0);
    db = new Client({ connectionString: url.href }); await db.connect();
    // Le banc n'exécute pas GoTrue ni cron ; ces tables permettent de vérifier les retraits.
    await db.query(`create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
      create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
      create function cron.unschedule(bigint) returns boolean language sql as $$ delete from cron.job where jobid=$1 returning true $$;
      create function cron.unschedule(text) returns boolean language sql as $$ delete from cron.job where jobname=$1 returning true $$;`);
    const fichier = path.join(dossier, 'env-prive'); writeFileSync(fichier, '', { mode: 0o600 });
    env = { NODE_ENV: 'test', PATH: process.env.PATH, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: nom,
      RECETTE_PSQL: psql, RECETTE_URL: 'http://localhost:3503', RECETTE_SUFFIXE: suffixe, RECETTE_COMPTES_FIXES: '1', GITHUB_ENV: fichier };
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      for (const n of [nom + '_api', nom]) await admin.query(`drop database if exists "${n}" with (force)`);
      await admin.end();
    }
    rmSync(dossier, { recursive: true, force: true });
  });

  it('conserve les cinq comptes et leurs dossiers après la clôture, puis reprend les mêmes UUID', async () => {
    expect(lancer('preparer').status).toBe(0);
    ids = await identites(); expect(ids).toHaveLength(5); expect(await supervision()).toBe(1);
    // Aucun second contrôle ne doit réinitialiser un groupe déjà en cours d'utilisation.
    expect(lancer('preparer').status).toBe(1); expect(await identites()).toEqual(ids); expect(await supervision()).toBe(1);
    const avant = (await db.query('select count(*)::int n from public.organizations')).rows[0].n;
    const sup = (await db.query("select id from auth.users where email like 'delivered+recette-superadmin-%'")).rows[0].id;
    await db.query('insert into auth.sessions(user_id) values($1)', [sup]);
    expect(lancer('purger').status).toBe(0);
    expect(await identites()).toEqual(ids); expect(await supervision()).toBe(0);
    expect((await db.query('select count(*)::int n from public.organizations')).rows[0].n).toBe(avant);
    expect((await db.query('select count(*)::int n from auth.sessions')).rows[0].n).toBe(0);
    expect((await db.query("select banned_until='infinity'::timestamptz as bloque from auth.users where id=$1", [sup])).rows[0].bloque).toBe(true);
    expect(lancer('preparer').status).toBe(0);
    expect(await identites()).toEqual(ids); expect(await supervision()).toBe(1);
    expect(lancer('purger').status).toBe(0); expect(await identites()).toEqual(ids);
  }, 120_000);

  it('nettoie le compte ponctuel d’inscription sans supprimer les cinq comptes fixes', async () => {
    await db.query("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,'{}','{}')", [`delivered+inscription-0-i${suffixe}@resend.dev`]);
    expect(lancer('purger').status).toBe(0);
    expect((await db.query('select count(*)::int n from auth.users')).rows[0].n).toBe(5);
    expect(await identites()).toEqual(ids);
  }, 60_000);

  it('refuse un compte fixe sans marque serveur et un rattachement extérieur', async () => {
    await db.query("update auth.users set raw_app_meta_data=raw_app_meta_data-'gerimmo_recette' where id=$1", [ids[0]]);
    expect(lancer('preparer').status).toBe(1);
    await db.query("update auth.users set raw_app_meta_data=raw_app_meta_data||'{\"gerimmo_recette\":\"permanente-v1\"}' where id=$1", [ids[0]]);
    const autre = (await db.query("insert into public.organizations(name,type,status) values('Autre test local protégé','agence','essai') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence')", [ids[0], autre]);
    const avant = (await db.query('select count(*)::int n from public.biens')).rows[0].n;
    expect(lancer('preparer').status).toBe(1);
    expect(await identites()).toEqual(ids);
    expect((await db.query('select count(*)::int n from public.biens')).rows[0].n).toBe(avant);
    // La base dédiée entière est retirée après le test ; ce dossier extérieur reste intact.
  }, 60_000);
});
