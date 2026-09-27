// Exerce une copie réelle téléchargée de Scaleway dans une base locale neuve.
// Aucune connexion à la base ou au Storage de production ; seul le bilan
// agrégé est publiable. Les fichiers déchiffrés restent dans le dossier privé
// du processus et sont retirés dans le finally, y compris en cas d'échec.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { extraire as extraireBase, argumentsConnexion } from './base.mjs';
import { extraire as extraireFichiers, verifier as verifierFichiers, lireCle } from './fichiers.mjs';

export function verifierDestination(texte) {
  const url = new URL(texte);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.search || url.hash
    || !/^\/gerimmo_restauration_[a-z0-9_]+$/.test(url.pathname)
    || texte.includes('rddlxunppddzpsaatdaz')) {
    throw new Error('La destination doit être une base locale neuve nommée gerimmo_restauration_…');
  }
  return url;
}

export function verifierPrefixe(prefixe) {
  if (!/^\d{8}-\d{4}$/.test(prefixe ?? '')) throw new Error('Préfixe de sauvegarde invalide.');
  return prefixe;
}

export async function restaurerArchive({ dossier, prefixe, cle, destination }) {
  verifierPrefixe(prefixe);
  const url = verifierDestination(destination);
  const base = url.pathname.slice(1);
  const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
  const travail = await fs.mkdtemp(path.join(os.tmpdir(), 'gerimmo-reprise-'));
  await fs.chmod(travail, 0o700);
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let creee = false, cible;
  const debut = Date.now();
  try {
    const archiveBase = path.join(dossier, `base-${prefixe}`);
    const archiveFichiers = path.join(dossier, `fichiers-${prefixe}`);
    const infoBase = await extraireBase(archiveBase, cle, path.join(travail, 'base'));
    const manifeste = await verifierFichiers(archiveFichiers, cle);
    await extraireFichiers(archiveFichiers, cle, path.join(travail, 'fichiers'));
    // Relire les fichiers réellement extraits, pas seulement leurs archives.
    for (const f of manifeste.objets) {
      const octets = await fs.readFile(path.join(travail, 'fichiers', f.bucket, f.nom));
      if (octets.length !== f.taille || createHash('sha256').update(octets).digest('hex') !== f.sha256) {
        throw new Error('Le fichier restauré ne correspond pas à la sauvegarde.');
      }
    }
    await admin.connect();
    // Ne jamais remplacer une base existante, même avec le préfixe attendu.
    if ((await admin.query('select 1 from pg_database where datname=$1', [base])).rowCount) {
      throw new Error('La base cible existe déjà : exercice refusé.');
    }
    for (const role of ['anon', 'authenticated', 'service_role', 'authenticator', 'dashboard_user',
      'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_read_only_user']) {
      if (!(await admin.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
        await admin.query(`create role "${role}" nologin`);
      }
    }
    await admin.query(`create database "${base}"`); creee = true;
    cible = new pg.Client({ connectionString: url.toString() }); await cible.connect();
    await cible.query('drop schema public; create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;');
    const { args, env } = argumentsConnexion(url.toString());
    const r = spawnSync('pg_restore', ['--no-owner', '--exit-on-error', ...args, path.join(travail, 'base/base.dump')],
      { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (r.status !== 0) {
      // Garder le diagnostic sur le disque éphémère, jamais en artefact ni en
      // journal public : une erreur SQL peut citer une donnée personnelle.
      await fs.writeFile(path.join(travail, 'erreur-restauration.txt'), r.stderr ?? '', { mode: 0o600 });
      const categorie = /role .* does not exist/.test(r.stderr ?? '') ? 'rôle manquant'
        : /schema .* does not exist/.test(r.stderr ?? '') ? 'schéma manquant'
        : /type .* does not exist/.test(r.stderr ?? '') ? 'type manquant'
        : /already exists/.test(r.stderr ?? '') ? 'objet déjà présent' : 'erreur PostgreSQL';
      throw new Error(`Restauration interrompue : ${categorie}. Aucun contenu de la base affiché.`);
    }
    const tables = (await cible.query(`select schemaname,tablename from pg_tables
      where schemaname in ('public','auth','storage') order by 1,2`)).rows;
    let lignes = 0;
    for (const t of tables) {
      const ident = x => '"' + x.replaceAll('"', '""') + '"';
      lignes += Number((await cible.query(`select count(*) as n from ${ident(t.schemaname)}.${ident(t.tablename)}`)).rows[0].n);
    }
    const securite = (await cible.query(`select
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and p.prokind='f' and p.prosecdef and has_function_privilege('anon',p.oid,'execute')) as definer_anonymes,
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
        and c.relkind='r' and not c.relrowsecurity) as tables_sans_rls,
      (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
        where n.nspname='public' and c.contype='f' and not c.convalidated) as contraintes_non_validees`)).rows[0];
    if (Object.values(securite).some(n => Number(n) !== 0)) throw new Error('Les protections de la base restaurée ne sont pas toutes confirmées.');
    const objets = (await cible.query('select bucket_id,name from storage.objects')).rows;
    const dansArchive = new Set(manifeste.objets.map(f => `${f.bucket}/${f.nom}`));
    const dansBase = new Set(objets.map(f => `${f.bucket_id}/${f.name}`));
    const manquants = [...dansBase].filter(n => !dansArchive.has(n)).length;
    const nonReferences = [...dansArchive].filter(n => !dansBase.has(n)).length;
    if (manquants || nonReferences) throw new Error('La liste des fichiers restaurés ne correspond pas à la base sauvegardée.');
    return { reussi: true, date: new Date().toISOString(), sauvegarde: prefixe, date_sauvegarde: infoBase.date,
      tables: tables.length, lignes, fichiers: manifeste.objets.length, fichiers_manquants: manquants,
      octets_base: infoBase.octets, protections: 'validées', duree_secondes: Math.ceil((Date.now() - debut) / 1000),
      portee: 'Base PostgreSQL et fichiers restaurés localement ; bascule des services Supabase non effectuée.' };
  } finally {
    if (cible) await cible.end().catch(() => {});
    try { if (creee) await admin.query(`drop database "${base}"`); }
    finally { await admin.end().catch(() => {}); await fs.rm(travail, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [dossier, prefixe, rapport] = process.argv.slice(2);
    const bilan = await restaurerArchive({ dossier, prefixe, cle: lireCle(process.env.GERIMMO_BACKUP_KEY),
      destination: process.env.GERIMMO_RESTORE_URL ?? `postgres://postgres:gerimmo-reprise@127.0.0.1:5432/gerimmo_restauration_${randomBytes(6).toString('hex')}` });
    if (rapport) await fs.writeFile(rapport, JSON.stringify(bilan, null, 2));
    console.log(JSON.stringify(bilan));
  } catch (e) { console.error(e instanceof Error ? e.message : 'Exercice interrompu.'); process.exitCode = 1; }
}
