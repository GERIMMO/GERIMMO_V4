// Deux bases jetables : les tests SQL ne modifient pas les fixtures de l'API.
// Ce banc reproduit les politiques SQL ; il ne remplace pas la recette sur
// PostgREST/Supabase et n'exécute pas le planificateur pg_cron.
import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';

const url = new URL(process.env.SUPABASE_DB_URL ?? '');
const nom = url.pathname.slice(1);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+$/.test(nom)) {
  throw new Error('La préparation exige une base locale jetable nommée gerimmo_ci_…');
}
const app = new URL('../../', import.meta.url);
const manifeste = (await readFile(new URL('e2e/local/ordre-migrations.txt', app), 'utf8')).trim().split(/\r?\n/);
const fichiers = (await readdir(new URL('supabase/migrations/', app))).filter((f) => f.endsWith('.sql'));
if (new Set(manifeste).size !== manifeste.length || fichiers.length !== manifeste.length || fichiers.some((f) => !manifeste.includes(f))) {
  throw new Error('Le manifeste doit contenir chaque migration exactement une fois.');
}
const db = new Client({ connectionString: url.href });
await db.connect();
try {
  // Ne jamais rejouer le bootstrap sur une base utilisée : ses GRANT initiaux
  // pourraient annuler les restrictions ajoutées par les migrations suivantes.
  const { rows: [{ utilisee }] } = await db.query("select exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and c.relkind in ('r','p','v','m')) as utilisee");
  if (utilisee) throw new Error('Base déjà initialisée : créez une nouvelle base jetable.');
  await db.query(await readFile(new URL('e2e/local/bootstrap-supabase-local.sql', app), 'utf8'));
  // Conserve les déclarations de tâches, sans lancer de travail automatique.
  await db.query(`create schema cron;
    create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean not null default true);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
    create schema e2e_local;
    create table e2e_local.migrations(name text primary key,applied_at timestamptz default now());`);
  for (const fichier of manifeste) {
    const sql = (await readFile(new URL('supabase/migrations/' + fichier, app), 'utf8')).replace(/^create extension if not exists pg_cron;/m, '');
    await db.query(sql);
    await db.query('insert into e2e_local.migrations(name) values($1)', [fichier]);
    // Identifiant local explicite : plusieurs anciens fichiers partagent le même jour.
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
      [fichier.slice(0, -4), fichier.slice(fichier.indexOf('_') + 1, -4), [sql]]);
  }
  // Modules expérimentaux activés uniquement dans ces bases fictives locales.
  await db.query("update public.artisan_modules_locaux set actif=true");
} finally { await db.end(); }

const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.href });
await admin.connect();
const nomApi = nom + '_api';
try {
  // Le nom est validé ci-dessus et aucune suppression de base n'est permise.
  await admin.query(`create database "${nomApi}" template "${nom}"`);
} finally { await admin.end(); }
const apiUrl = new URL(url); apiUrl.pathname = '/' + nomApi;
const api = new Client({ connectionString: apiUrl.href });
await api.connect();
try { await api.query(await readFile(new URL('supabase/seed.sql', app), 'utf8')); }
finally { await api.end(); }
console.log(`${manifeste.length} migrations appliquées. Bases SQL et API séparées, fixtures fictives prêtes.`);
