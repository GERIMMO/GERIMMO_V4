import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
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

describe.skipIf(!disponible)('Recette éphémère : cycle complet et retrait des identités', () => {
  const suffixe = 'r20261021009999-1';
  const nom = 'gerimmo_ci_ephemere_' + randomBytes(5).toString('hex').replace(/[0-9]/g, n => String.fromCharCode(107 + Number(n)));
  const dossier = mkdtempSync(path.join(tmpdir(), 'gerimmo-ephemere-'));
  let admin: Client, db: Client;
  let env: NodeJS.ProcessEnv;
  let storage: Server;
  const lancer = (action: string) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/recette-production-comptes.mjs', action], { env, timeout: 60_000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject); child.on('exit', status => resolve({ status, stdout, stderr }));
  });
  beforeAll(async () => {
    const url = new URL(source!); url.pathname = '/postgres';
    admin = new Client({ connectionString: url.href }); await admin.connect();
    await admin.query(`create database "${nom}"`);
    url.pathname = '/' + nom;
    const preparation = spawnSync(process.execPath, ['e2e/local/preparer-ci.mjs'], { env: { ...process.env, SUPABASE_DB_URL: url.href }, encoding: 'utf8', timeout: 90_000 });
    expect(preparation.status, 'Préparation des seules bases fictives').toBe(0);
    db = new Client({ connectionString: url.href }); await db.connect();
    // Le banc n'exécute pas GoTrue ni cron ; ces tables permettent de vérifier les retraits.
    await db.query(`create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
      create function cron.unschedule(bigint) returns boolean language sql as $$ delete from cron.job where jobid=$1 returning true $$;
      create function cron.unschedule(text) returns boolean language sql as $$ delete from cron.job where jobname=$1 returning true $$;`);
    storage = createServer(async (req, res) => {
      if (req.method !== 'DELETE' || req.url !== '/storage/v1/object/depots-temporaires') { res.writeHead(404).end(); return; }
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const { prefixes } = JSON.parse(body);
        const r = await db.query("delete from storage.objects where bucket_id='depots-temporaires' and name=any($1::text[]) returning name", [prefixes]);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(r.rows));
      } catch { res.writeHead(500).end(); }
    });
    await new Promise<void>(resolve => storage.listen(0, '127.0.0.1', resolve));
    const address = storage.address(); if (!address || typeof address === 'string') throw new Error('Banc Storage absent');
    const fichier = path.join(dossier, 'env-prive'); writeFileSync(fichier, '', { mode: 0o600 });
    env = { NODE_ENV: 'test', PATH: process.env.PATH, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: nom,
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_SERVICE_ROLE_KEY: 'fictive-locale', RECETTE_PSQL: psql, RECETTE_URL: 'http://localhost:3503', RECETTE_SUFFIXE: suffixe, GITHUB_ENV: fichier };
  }, 120_000);

  afterAll(async () => {
    if (storage) await new Promise<void>(resolve => storage.close(() => resolve()));
    await db?.end();
    if (admin) {
      for (const n of [nom + '_api', nom]) await admin.query(`drop database if exists "${n}" with (force)`);
      await admin.end();
    }
    rmSync(dossier, { recursive: true, force: true });
  });

  it('retire les cinq comptes, leurs sessions et dossiers, et le compte d’inscription', async () => {
    const sa = (await db.query("insert into auth.users(email,raw_app_meta_data,raw_user_meta_data) values('superadmin-protege@example.com','{}','{}') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,role) values($1,'super_admin')", [sa]);
    expect((await lancer('preparer')).status).toBe(0);
    expect((await db.query('select count(*)::int n from auth.users')).rows[0].n).toBe(6);
    await db.query('insert into auth.sessions(user_id) select id from auth.users');
    await db.query("insert into auth.users(email,raw_app_meta_data,raw_user_meta_data) values($1,'{}','{}')", [`delivered+inscription-0-${suffixe}@resend.dev`]);
    // Les dépôts temporaires sont préfixés par le compte, et non par l'organisation.
    const compte = (await db.query('select id from auth.users where id<>$1 limit 1', [sa])).rows[0].id;
    await db.query("insert into storage.objects(bucket_id,name) values('depots-temporaires',$1),('depots-temporaires',$2)", [compte + '/essai.pdf', sa + '/a-conserver.pdf']);
    const fin = await lancer('purger'); expect(fin.status, fin.stderr).toBe(0);
    expect(fin.stdout).toContain('Purge vérifiée');
    expect((await db.query("select name from storage.objects where bucket_id='depots-temporaires'")).rows).toEqual([{ name: sa + '/a-conserver.pdf' }]);
    expect((await db.query('select id from auth.users')).rows).toEqual([{ id: sa }]);
    expect((await db.query('select user_id from auth.sessions')).rows).toEqual([{ user_id: sa }]);
    for (const table of ['organizations','artisans','persons','biens','lots']) expect((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, table).toBe(0);
    expect((await db.query("select count(*)::int n from cron.job where jobname like 'recette-expiration-%'")).rows[0].n).toBe(0);
    expect((await lancer('purger')).status).toBe(0);
  }, 120_000);
});
