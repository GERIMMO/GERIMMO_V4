// Exercice de restauration automatisable sur le banc local (audit du 27/09).
//
// POURQUOI. Le Plan de reprise d'activité (RM-A4.12) exige un test de
// restauration documenté, bloquant avant la mise en production — et Gerimmo
// est en production sans qu'aucune restauration ait jamais été jouée. Une
// sauvegarde que l'on n'a jamais restaurée n'est qu'une hypothèse.
//
// CE QUE FAIT L'EXERCICE, de bout en bout, avec les VRAIS programmes de la
// sauvegarde (base.mjs) :
//   1. export chiffré de la base source (pg_dump, AES-256-GCM, clé jetable) ;
//   2. vérification de l'archive, puis déchiffrement dans un dossier neuf ;
//   3. création d'une base cible VIDE (seuls les rôles de la grappe et le
//      schéma `extensions` y sont préparés, comme sur un projet Supabase neuf) ;
//   4. `pg_restore --no-owner` du dump ;
//   5. comparaison source / cible : nombre de lignes de chaque table des
//      schémas sauvegardés, politiques RLS, tables sous RLS, droits des rôles
//      `anon` / `authenticated` / `service_role` sur les tables et les
//      fonctions — et le contrôle « aucune fonction ouverte à anon » sur la
//      base restaurée (les droits font partie de la défense : un dump sans
//      GRANT/REVOKE rouvrirait toutes les fonctions à PUBLIC) ;
//   6. bilan JSON (durées, nombres, écarts) ; la base cible est supprimée
//      sauf `--garder`.
//
// GARDE-FOUS. Source et cible doivent être sur la machine locale (127.0.0.1,
// localhost) ; la cible doit s'appeler `gerimmo_restauration…` ; le projet de
// production est refusé par son identifiant. On n'exerce JAMAIS sur la
// production : l'exercice sur un projet Supabase de secours est décrit dans
// docs/sauvegarde-et-restauration.md.
//
// Usage (depuis app/) :
//   node scripts/sauvegarde/exercice-restauration.mjs \
//     [--source postgres://postgres@127.0.0.1:55432/gerimmo_ci_neuf_api] \
//     [--cible gerimmo_restauration] [--garder]
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { exporter, extraire, SCHEMAS, verifier } from './base.mjs';

const PRODUCTION = 'rddlxunppddzpsaatdaz';
const LOCAUX = ['127.0.0.1', 'localhost', '::1'];

/** Refuse tout ce qui n'est pas une base locale nommée pour l'exercice. */
export function verifierCibles(source, cible) {
  const s = new URL(source);
  if (source.includes(PRODUCTION)) throw new Error('La production n’est jamais une source d’exercice.');
  if (!LOCAUX.includes(s.hostname)) throw new Error('La source doit être une base locale (127.0.0.1).');
  if (!/^gerimmo_restauration[a-z0-9_]*$/.test(cible)) throw new Error('La cible doit s’appeler gerimmo_restauration… (base jetable).');
  const u = new URL(source); u.pathname = `/${cible}`;
  const admin = new URL(source); admin.pathname = '/postgres';
  return { cibleUrl: u.toString(), adminUrl: admin.toString() };
}

function psql(url, sql) {
  const r = spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', url, '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql : ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout.trim();
}

// Chaque instantané rend une liste triée de lignes texte : deux bases
// identiques rendent deux listes identiques.
const INSTANTANES = {
  politiques: `select schemaname||'.'||tablename||' '||policyname||' '||cmd||' '||array_to_string(roles,',')
                 from pg_policies where schemaname in (${SCHEMAS.map(s => `'${s}'`).join(',')}) order by 1`,
  rls: `select n.nspname||'.'||c.relname||' '||c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where c.relkind='r' and n.nspname in (${SCHEMAS.map(s => `'${s}'`).join(',')}) order by 1`,
  droits_tables: `select grantee||' '||table_schema||'.'||table_name||' '||privilege_type from information_schema.role_table_grants
                   where grantee in ('anon','authenticated','service_role') and table_schema in (${SCHEMAS.map(s => `'${s}'`).join(',')}) order by 1`,
  droits_colonnes: `select grantee||' '||table_schema||'.'||table_name||'.'||column_name||' '||privilege_type from information_schema.column_privileges
                     where grantee in ('anon','authenticated') and table_schema='public' order by 1`,
  droits_fonctions: `select r.rolname||' '||p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      cross join (values ('anon'),('authenticated'),('service_role')) r(rolname)
                      where n.nspname='public' and p.prokind='f' and has_function_privilege(r.rolname,p.oid,'EXECUTE') order by 1`,
};

/** `lire(sql)` rend une liste de lignes texte (première colonne). */
async function lignesParTable(lire) {
  const tables = await lire(`select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and n.nspname in (${SCHEMAS.map(s => `'${s}'`).join(',')}) order by 1`);
  const comptes = {};
  for (const t of tables) {
    const [schema, table] = t.split('.');
    comptes[t] = Number((await lire(`select count(*) from "${schema}"."${table}"`))[0]);
  }
  return comptes;
}

function lecteur(client) {
  return async sql => (await client.query({ text: sql, rowMode: 'array' })).rows.map(r => String(r[0]));
}

function ecart(a, b) {
  const A = new Set(a), B = new Set(b);
  return { manquants: [...A].filter(x => !B.has(x)), en_trop: [...B].filter(x => !A.has(x)) };
}

export async function exercer({ source, cible = 'gerimmo_restauration', garder = false }) {
  const debut = Date.now();
  const { cibleUrl, adminUrl } = verifierCibles(source, cible);
  const cle = randomBytes(32);
  const travail = await fs.mkdtemp(path.join(os.tmpdir(), 'gerimmo-restauration-'));
  /** @type {Record<string, any>} */
  const bilan = { source: new URL(source).pathname.slice(1), cible, etapes: {} };
  const chrono = (nom, t0) => { bilan.etapes[nom] = `${((Date.now() - t0) / 1000).toFixed(1)} s`; };
  // La source est lue dans UN instantané, partagé avec pg_dump : les écritures
  // concurrentes (autres tests, application) ne faussent pas la comparaison.
  const client = new pg.Client({ connectionString: source });
  await client.connect();
  try {
    await client.query('begin transaction isolation level repeatable read read only');
    const { rows: [{ snapshot }] } = await client.query('select pg_export_snapshot() as snapshot');
    let t = Date.now();
    const exporte = await exporter(path.join(travail, 'base'), cle, source, { snapshot });
    bilan.octets = exporte.octets; chrono('export_chiffre', t);

    t = Date.now();
    await verifier(path.join(travail, 'base'), cle);
    await extraire(path.join(travail, 'base'), cle, path.join(travail, 'clair'));
    chrono('verification_dechiffrement', t);

    t = Date.now();
    psql(adminUrl, `drop database if exists ${cible}`);
    psql(adminUrl, `create database ${cible}`);
    // Un projet Supabase neuf a déjà ses rôles (grappe) et le schéma des
    // extensions ; le dump apporte public, auth et storage.
    psql(cibleUrl, 'drop schema if exists public cascade');
    psql(cibleUrl, 'create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; grant usage on schema extensions to anon, authenticated, service_role');
    const r = spawnSync('pg_restore', ['--no-owner', '--exit-on-error', '--dbname', cibleUrl, path.join(travail, 'clair', 'base.dump')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`pg_restore : ${(r.stderr || '').trim().split('\n').slice(0, 3).join(' | ')}`);
    chrono('restauration', t);

    t = Date.now();
    const lireSource = lecteur(client);
    const cibleClient = new pg.Client({ connectionString: cibleUrl });
    await cibleClient.connect();
    const lireCible = lecteur(cibleClient);
    const lignesSource = await lignesParTable(lireSource), lignesCible = await lignesParTable(lireCible);
    const tablesDifferentes = Object.keys({ ...lignesSource, ...lignesCible })
      .filter(k => lignesSource[k] !== lignesCible[k])
      .map(k => `${k} : ${lignesSource[k] ?? 'absente'} → ${lignesCible[k] ?? 'absente'}`);
    const ecarts = {};
    for (const [nom, sql] of Object.entries(INSTANTANES)) {
      const e = ecart(await lireSource(sql), await lireCible(sql));
      if (e.manquants.length || e.en_trop.length) ecarts[nom] = { manquants: e.manquants.slice(0, 20), en_trop: e.en_trop.slice(0, 20), total: e.manquants.length + e.en_trop.length };
    }
    const ouvertesAnon = Number((await lireCible(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f' and has_function_privilege('anon',p.oid,'EXECUTE')`))[0]);
    await cibleClient.end();
    chrono('comparaison', t);

    bilan.tables = Object.keys(lignesCible).length;
    bilan.lignes = Object.values(lignesCible).reduce((a, b) => a + b, 0);
    bilan.tables_differentes = tablesDifferentes;
    bilan.ecarts_droits = ecarts;
    bilan.fonctions_ouvertes_a_anon = ouvertesAnon;
    bilan.reussi = tablesDifferentes.length === 0 && Object.keys(ecarts).length === 0 && ouvertesAnon === 0;
    bilan.duree = `${((Date.now() - debut) / 1000).toFixed(1)} s`;
    bilan.date = new Date().toISOString();
    return bilan;
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end().catch(() => {});
    await fs.rm(travail, { recursive: true, force: true });
    if (!garder) { try { psql(adminUrl, `drop database if exists ${cible}`); } catch { /* rien à nettoyer */ } }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const valeur = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const bilan = await exercer({
      source: valeur('--source') ?? 'postgres://postgres@127.0.0.1:55432/gerimmo_ci_neuf_api',
      cible: valeur('--cible') ?? 'gerimmo_restauration',
      garder: args.includes('--garder'),
    });
    console.log(JSON.stringify(bilan, null, 2));
    if (!bilan.reussi) process.exitCode = 1;
  } catch (e) { console.error(e instanceof Error ? e.message : 'Exercice interrompu.'); process.exitCode = 1; }
}
