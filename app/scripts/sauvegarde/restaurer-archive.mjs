// Exerce une copie réelle téléchargée de Scaleway dans une base locale neuve.
// Aucune connexion à la base ou au Storage de production ; seul le bilan
// agrégé est publiable. Les fichiers déchiffrés restent dans le dossier privé
// du processus et sont retirés dans le finally, y compris en cas d'échec.
import { verifierHistoriqueMigrations } from './historique-migrations.mjs';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { extraire as extraireBase, argumentsConnexion, SCHEMAS } from './base.mjs';
import { extraire as extraireFichiers, verifier as verifierFichiers, lireCle } from './fichiers.mjs';
import { FICHIER_TACHES_CLAIR, genererRejeu, normaliserTaches } from './taches-planifiees.mjs';

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

/**
 * D07 (AUD-C-02) : les tâches planifiées de la copie sont rejouées par le script que `extraire` a généré, sur un planificateur
 * de FAÇADE (schéma `cron` minimal, créé puis retiré) — la base jetable n'a ni pg_cron ni pg_net. Cela prouve que la liste
 * sauvegardée se rejoue en entier, sans doublon et à l'identique ; cela ne prouve PAS que pg_cron les exécute (extension
 * de la plateforme, à activer avec pg_net sur le projet de secours). Le schéma `cron` ne doit pas déjà exister.
 */
export async function verifierRejeuTaches(cible, taches) {
  const attendues = normaliserTaches(taches);
  await cible.query(`create schema cron;
    create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean not null default true);
    create function cron.schedule(text, text, text) returns bigint language sql as $f$
      insert into cron.job (jobname, schedule, command) values ($1, $2, $3)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $f$;
    create function cron.alter_job(job_id bigint, active boolean default null) returns void language sql as $f$
      update cron.job set active = coalesce($2, active) where jobid = $1 $f$;`);
  try {
    const script = genererRejeu(attendues, { verifierExtensions: false });
    // Deux fois : rejouer le script ne crée aucun doublon.
    await cible.query(script);
    await cible.query(script);
    // Triées en JavaScript, comme `normaliserTaches` : l'ordre d'un `order by` dépend de la collation de la base.
    const { rows } = await cible.query('select jobname, schedule, command, active from cron.job');
    rows.sort((a, b) => (a.jobname < b.jobname ? -1 : a.jobname > b.jobname ? 1 : 0));
    if (JSON.stringify(rows) !== JSON.stringify(attendues.map(t => ({ jobname: t.jobname, schedule: t.schedule, command: t.command, active: t.active })))) {
      throw new Error('Le rejeu des tâches planifiées ne redonne pas la liste sauvegardée.');
    }
    return rows.length;
  } finally {
    await cible.query('drop schema cron cascade').catch(() => {});
  }
}

/** Le registre D08-C doit rester privé après import, y compris ses fonctions et ses déclencheurs. */
export async function verifierSupportInterne(cible, attendu = false) {
  const present = (await cible.query("select to_regnamespace('support_interne') is not null as present")).rows[0].present;
  if (!present) {
    const dependant = (await cible.query("select to_regprocedure('public.preparer_encaissement_support(uuid,uuid,uuid,numeric,numeric,text)') is not null or to_regprocedure('public.poser_gardes_traversee()') is not null as present")).rows[0].present;
    if (attendu || dependant) throw new Error('Le registre privé de support manque dans la restauration.');
    return { present: false };
  }
  const etat = (await cible.query(`select
    (select count(*) from pg_namespace n cross join (values ('anon'),('authenticated')) r(nom)
      where n.nspname='support_interne' and (has_schema_privilege(r.nom,n.oid,'USAGE') or has_schema_privilege(r.nom,n.oid,'CREATE'))) as schema_ouvert,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values ('anon'),('authenticated')) r(nom)
      where n.nspname='support_interne' and has_function_privilege(r.nom,p.oid,'EXECUTE')) as fonctions_ouvertes,
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'),('authenticated')) r(nom)
      where n.nspname='support_interne' and c.relkind='r' and has_table_privilege(r.nom,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as tables_ouvertes,
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='support_interne' and c.relkind='r' and not c.relrowsecurity) as tables_sans_rls,
    (select count(*) from (values ('gestes_encaissement'),('controles_organisation'),('maintenance_lignes')) t(nom)
      where to_regclass('support_interne.'||t.nom) is null) as tables_manquantes,
    (select count(*) from (values ('preparer_maintenance_artisans()'),('preparer_blacklist_globale(uuid)'),('garder_ecriture_traversee()'),('refuser_auto_habilitation()'),('purger_gestes_support()')) f(signature)
      where to_regprocedure('support_interne.'||f.signature) is null) as fonctions_manquantes,
    (select count(*) from (values ('public.organizations','traversee_lecture_seule','garder_ecriture_traversee()'),
      ('storage.objects','traversee_lecture_seule','garder_ecriture_traversee()'),
      ('public.memberships','traversee_auto_habilitation','refuser_auto_habilitation()')) g(cible,nom,fonction)
      where not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(g.cible) and t.tgname=g.nom
        and t.tgenabled in ('O','A') and t.tgfoid=to_regprocedure('support_interne.'||g.fonction))) as gardes_manquantes,
    (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='support_interne' and t.tgenabled not in ('O','A')) as gardes_inactives`)).rows[0];
  if (Object.values(etat).some(n => Number(n) !== 0)) throw new Error('Les protections du registre privé de support ne sont pas confirmées.');
  return { present: true, protections: 'validées' };
}

/** Les anciennes archives sans consommations restent lisibles. Une archive
 * portant leurs tables ou RPC doit aussi restaurer leurs fonctions privées.
 * Contrairement au support, authenticated a volontairement USAGE ici :
 * les wrappers SQL invoker et les politiques RLS l'exigent. */
export async function verifierConsommationsInterne(cible, attendu = false) {
  const present = (await cible.query("select to_regnamespace('consommations_interne') is not null as present")).rows[0].present;
  if (!present) {
    const dependant = (await cible.query("select to_regclass('public.compteurs_consommation') is not null or to_regprocedure('public.planifier_releves_consommation()') is not null as present")).rows[0].present;
    if (attendu || dependant) throw new Error('Le schéma privé des consommations manque dans la restauration.');
    return { present: false };
  }
  const etat = (await cible.query(`select
    (select count(*) from pg_namespace n where n.nspname='consommations_interne'
      and (has_schema_privilege('anon',n.oid,'USAGE') or has_schema_privilege('anon',n.oid,'CREATE')
        or has_schema_privilege('authenticated',n.oid,'CREATE') or not has_schema_privilege('authenticated',n.oid,'USAGE'))) as schema_incorrect,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='consommations_interne' and has_function_privilege('anon',p.oid,'EXECUTE')) as fonctions_anonymes,
    (select count(*) from (values ('garder_rattachement()'),('garder_empreinte_repartition()'),('garder_facture()'),('planifier()')) f(signature)
      where to_regprocedure('consommations_interne.'||f.signature) is null) as fonctions_manquantes,
    (select count(*) from (values
      ('public.compteurs_consommation','conso_rattachement','garder_rattachement()'),
      ('public.contrats_fourniture','conso_rattachement','garder_rattachement()'),
      ('public.repartitions_fourniture','conso_empreinte_repartition','garder_empreinte_repartition()'),
      ('public.factures_fourniture','conso_facture','garder_facture()')) g(cible,nom,fonction)
      where not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(g.cible) and t.tgname=g.nom
        and t.tgenabled in ('O','A') and t.tgfoid=to_regprocedure('consommations_interne.'||g.fonction))) as gardes_manquantes`)).rows[0];
  if (Object.values(etat).some(n => Number(n) !== 0)) throw new Error('Les protections des consommations restaurées ne sont pas confirmées.');
  return { present: true, protections: 'validées' };
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
      where schemaname=any($1::text[]) order by 1,2`, [SCHEMAS])).rows;
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
    const manifesteBase = JSON.parse(await fs.readFile(path.join(travail, 'base/restauration-base.json'), 'utf8'));
    const historiqueMigrations = await verifierHistoriqueMigrations(cible, manifesteBase.schemas?.includes('supabase_migrations'));
    const supportInterne = await verifierSupportInterne(cible, manifesteBase.schemas?.includes('support_interne'));
    const consommationsInterne = await verifierConsommationsInterne(cible, manifesteBase.schemas?.includes('consommations_interne'));
    const objets = (await cible.query('select bucket_id,name from storage.objects')).rows;
    const dansArchive = new Set(manifeste.objets.map(f => `${f.bucket}/${f.nom}`));
    const dansBase = new Set(objets.map(f => `${f.bucket_id}/${f.name}`));
    const manquants = [...dansBase].filter(n => !dansArchive.has(n)).length;
    const nonReferences = [...dansArchive].filter(n => !dansBase.has(n)).length;
    if (manquants || nonReferences) throw new Error('La liste des fichiers restaurés ne correspond pas à la base sauvegardée.');
    // Les copies d'avant le 14/10/2026 n'ont pas de liste de tâches (`taches_planifiees: null`) : elles se restaurent
    // comme avant, et le bilan le dit au lieu de l'omettre.
    let tachesPlanifiees = 'absentes de cette copie (antérieure à leur sauvegarde)';
    if (infoBase.taches_planifiees !== null) {
      const taches = JSON.parse(await fs.readFile(path.join(travail, 'base', FICHIER_TACHES_CLAIR), 'utf8')).taches;
      tachesPlanifiees = await verifierRejeuTaches(cible, taches);
    }
    return { reussi: true, date: new Date().toISOString(), sauvegarde: prefixe, date_sauvegarde: infoBase.date,
      tables: tables.length, lignes, fichiers: manifeste.objets.length, fichiers_manquants: manquants,
      octets_base: infoBase.octets, protections: 'validées', historique_migrations: historiqueMigrations, support_interne: supportInterne, consommations_interne: consommationsInterne, taches_planifiees: tachesPlanifiees, duree_secondes: Math.ceil((Date.now() - debut) / 1000),
      portee: 'Base PostgreSQL et fichiers restaurés localement ; bascule des services Supabase non effectuée. Tâches pg_cron : liste et script de rejeu contrôlés sur un planificateur de façade ; pg_cron et pg_net non activés.' };
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
