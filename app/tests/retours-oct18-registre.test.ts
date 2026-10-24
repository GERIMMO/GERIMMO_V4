/**
 * Lot « supervision et signatures » (17-18/10/2026, mission M4) : les huit retours arrière, joués dans l'ordre inverse du
 * manifeste sur une base CI locale, dans une transaction annulée à la fin.
 *  — la base est construite depuis le manifeste intégré : trois migrations du 19/10 (20261019121000, 20261019123000,
 *    20261019124000) ont réécrit des objets du lot ; leurs retours se jouent d'abord, dans l'ordre de la chaîne « Ordre
 *    complet » du LISEZ-MOI (comme en production), puis les huit ; la marche avant rejoue les huit migrations puis celles
 *    du 19/10 et retrouve l'empreinte de l'état intégré ; trois gardes d'ordre vers ces retours (refus nommant le retour
 *    à jouer d'abord, état inchangé) ;
 *  — chaîne complète : fonctions, déclencheurs, politiques, index et droits retirés ; les huit tables conservées avec leurs
 *    lignes, fermées à anon, authenticated et service_role (droits de table ET par colonne), RLS actif, commentaire
 *    « Conservée » ; les versions des fichiers ET celles enregistrées en production (supervision) retirées, la sentinelle
 *    gardée ; les fonctions rétablies sont au texte exact des migrations citées (empreinte comparée) ;
 *  — rejeu sans effet ; gardes d'ordre (cause prouvée pour 100243) ; garde « en vol » (circuit chez le prestataire) ; garde des doublons de circuits
 *    actifs ; atomicité ; marche avant après suppression manuelle des objets conservés.
 * Sans base : forme des huit fichiers (transaction externe, aucun `drop table` ni `drop column`, fermeture à anon dès
 * qu'une fonction est touchée, versions retirées, `comment on column` gardé par l'existence de la colonne) et LISEZ-MOI (chaque fichier cité, chaîne complète dans l'ordre).
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transactionsInterdites } from '../scripts/verifier-transactions-migration.mjs';
import { verifierBaseDeTest } from './garde-base';

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) || !new URL(url).pathname.includes('ci_'))) throw new Error('Une base CI locale fictive est obligatoire.');

/** Ordre inverse du manifeste : le premier retour à jouer défait la dernière migration appliquée. */
const CHAINE = [
  '20261018193308_signature_devis_accord_client',
  '20261018185515_signatures_documents_budget',
  '20261018143644_certificat_commun_zoho',
  '20261018100243_prestataire_signature_bail',
  '20261018085521_circuit_signature_bail',
  '20261018071556_supervision_index_relations',
  '20261018061548_supervision_complete',
  '20261017180829_supervision_finances',
];
/** Versions sous lesquelles la production a enregistré les trois migrations de supervision (relevé du 19/10/2026). */
const VERSIONS_PRODUCTION: Record<string, string> = { '20261017180829': '20261018071151', '20261018061548': '20261018071200', '20261018071556': '20261018071811' };
const SENTINELLE = '20000101000000';
const versions = (f: string) => [f.slice(0, 14), ...(VERSIONS_PRODUCTION[f.slice(0, 14)] ? [VERSIONS_PRODUCTION[f.slice(0, 14)]] : [])];
const TOUTES_VERSIONS = CHAINE.flatMap(versions);
const sql = (f: string, retour = false) => readFileSync(new URL(`../supabase/${retour ? 'retours-arriere' : 'migrations'}/${f}${retour ? '.retour' : ''}.sql`, import.meta.url), 'utf8');
const lisezMoi = () => readFileSync(new URL('../supabase/retours-arriere/LISEZ-MOI.md', import.meta.url), 'utf8');
const manifeste = () => readFileSync(new URL('../e2e/local/ordre-migrations.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);

/**
 * Les retours du 19/10 qui touchent des objets du lot, dans l'ordre de la chaîne « Ordre complet » du LISEZ-MOI (ils précèdent
 * 20261018231827, puis les huit) : B5 (garder_devis_en_signature, reserver_envoi_signature_bail, index signature_devis_une_offre,
 * retenir_devis au jour de Paris), identité (deux contraintes de supervision_identite), droits anon et prospects
 * (supervision_tracer_modification, clé supervision_prospects.demande_id). Les trois autres retours du 19/10 (122000, 120500,
 * 120000) ne touchent aucun objet des huit.
 */
const RETOURS_1910 = ['20261019124000_devis_signes_sort_et_jour_de_paris', '20261019123000_identite_editeur_prestataires', '20261019121000_droits_anon_contact_articles_et_prospects'];
/** Les mêmes migrations, dans l'ordre du manifeste (marche avant). */
const MIGRATIONS_1910 = [...RETOURS_1910].reverse();
/** Un retour qui gère sa propre transaction (121000) refuse de se jouer dans un lot : seule cette enveloppe lui est retirée (comme tests/supervision-prospects-purge.test.ts). */
const sansEnveloppe = (script: string) => script
  .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, '')
  .replace(/^begin;$/m, '')
  .replace(/^commit;$/m, '');
const retour1910 = (f: string) => sansEnveloppe(sql(f, true));
/** Gardes d'ordre vers les retours du 19/10 : [retour gardé, retour à jouer d'abord, message exact du script, repris au LISEZ-MOI]. */
const GARDES_1910: [string, string, string][] = [
  [CHAINE[0], RETOURS_1910[0], "Retour 20261018193308 refusé : garder_devis_en_signature, reserver_envoi_signature_bail ou l'index signature_devis_une_offre portent encore la forme du 19/10 (B5) ; jouer d'abord le retour 20261019124000"],
  [CHAINE[6], RETOURS_1910[1], "Retour 20261018061548 refusé : les contraintes de supervision_identite admettent encore les clés des prestataires ou la borne de 40 000 octets (19/10) ; jouer d'abord le retour 20261019123000"],
  [CHAINE[6], RETOURS_1910[2], "Retour 20261018061548 refusé : supervision_tracer_modification porte encore le chemin système du 19/10 (pg_trigger_depth) ou la clé supervision_prospects_demande_id_fkey son action référentielle (on delete set null) ; jouer d'abord le retour 20261019121000"],
];

const FONCTIONS = ['supervision_finances', 'supervision_total_couts', 'supervision_tracer_modification', 'reserver_envoi_signature_bail', 'verrouiller_signature_bail', 'archiver_signature_bail', 'proteger_document_en_signature_bail', 'activer_bail_signature_electronique', 'garder_bail_en_signature', 'garder_signature_manuelle_bail', 'fichier_en_signature_bail', 'initialiser_cible_signature', 'regler_budget_signature', 'reserver_budget_signature', 'garder_edl_en_signature', 'lire_budget_signatures', 'lire_signature_devis', 'garder_devis_en_signature', 'refuser_nouvelle_signature_manuelle', 'lire_signature_devis_archive'];
/** Réécrites par ancre : elles survivent au lot et doivent retrouver leur texte exact à la marche avant. */
const ANCREES = ['refuser_ecriture_si_fermee', 'retenir_devis'];
const DECLENCHEURS = ['abonnement_bail_signature_circuits', 'signature_cible', 'traversee_lecture_seule', 'bail_signature_garde_suppression', 'signature_manuelle_bail_garde', 'signature_manuelle_fin_nouveaux_envois', 'document_signature_bail_verrou', 'edl_circuit_verrou', 'edl_lignes_circuit_verrou', 'edl_cles_circuit_verrou', 'edl_compteurs_circuit_verrou', 'devis_signature_verrou', 'supervision_cout_trace', 'supervision_identite_trace', 'supervision_prospect_trace'];
const TABLES = ['bail_signature_circuits', 'signature_budget', 'signature_consommations', 'supervision_couts', 'supervision_executions_decisions', 'supervision_identite', 'supervision_prospects', 'supervision_registre'];
const SUPERVISION = TABLES.slice(3);
const ROLES = ['anon', 'authenticated', 'service_role'];

/** Le texte `create [or replace] function public.<nom>(…) … end $$;` d'une migration, tel qu'écrit. */
function definitionDeMigration(fichier: string, nom: string): string {
  const source = sql(fichier);
  const debut = source.search(new RegExp(`^create (or replace )?function public\\.${nom}\\(`, 'm'));
  const fin = source.indexOf('\nend $$;', debut);
  if (debut < 0 || fin < 0) throw new Error(`${fichier} : définition de ${nom} introuvable`);
  return source.slice(debut, fin + '\nend $$;'.length);
}

describe('les huit retours du lot « supervision et signatures » : forme des fichiers et LISEZ-MOI (sans base)', () => {
  const sansCommentaires = (s: string) => s.replace(/--.*$/gm, '');
  it.each(CHAINE)('%s : transaction externe, aucune suppression de table ni de colonne, fermeture à anon, versions retirées', (f) => {
    const source = sql(f, true);
    const code = sansCommentaires(source);
    expect(transactionsInterdites(source)).toEqual([]);
    expect(code.trim().startsWith("set local lock_timeout = '10s';")).toBe(true);
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(source).toMatch(/^-- RETOUR ARRIÈRE de /m);
    if (/drop function|create or replace function|execute replace\(/i.test(code)) expect(code).toContain('select public.fermer_fonctions_a_anon();');
    const clauses = [...code.matchAll(/delete from supabase_migrations\.schema_migrations where version in \(([^)]*)\)/g)];
    expect(clauses).toHaveLength(1);
    expect([...clauses[0][1].matchAll(/'(\d{14})'/g)].map((m) => m[1]).sort()).toEqual([...versions(f)].sort());
    // Dépôt public : aucune adresse réelle.
    expect(source).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });
  it.each(CHAINE)('%s : chaque `comment on column` est gardé par l’existence de la colonne, jamais par la seule table', (f) => {
    // Un `comment on column` sur une colonne absente ferait échouer toute la transaction : la garde cite la colonne dans
    // information_schema.columns (forme du retour de 20261018061548), pas seulement la table dans to_regclass.
    const code = sansCommentaires(sql(f, true));
    for (const [, table, colonne] of code.matchAll(/comment on column public\.(\w+)\.(\w+) is/g)) {
      expect(code, `${f} : ${table}.${colonne}`).toContain(`table_name = '${table}' and column_name = '${colonne}'`);
    }
  });
  it('le LISEZ-MOI cite les huit fichiers et donne une seule chaîne complète, dans l’ordre inverse du manifeste : les retours du 19/10, 20261018231827, puis les huit', () => {
    const texte = lisezMoi();
    for (const f of CHAINE) expect(texte).toContain(`${f}.retour.sql`);
    expect(texte).toContain('20261018231827_abonnement_jour_paris.retour.sql');
    const chaines = [...texte.matchAll(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/g)];
    expect(chaines).toHaveLength(1);
    const codes = [...chaines[0][1].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    const attendu = CHAINE.map((f) => f.slice(0, 14));
    const debut = codes.indexOf(attendu[0]);
    expect(debut).toBeGreaterThan(0);
    expect(codes.slice(debut, debut + attendu.length)).toEqual(attendu);
    expect(codes[debut - 1]).toBe('20261018231827');
    expect(codes[debut + attendu.length]).toBe('20261016210000');
    const lignes = manifeste();
    expect(attendu.map((v) => lignes.findIndex((m) => m.startsWith(`${v}_`)))).toEqual([...Array(attendu.length).keys()].map((i) => lignes.indexOf('20261018231827_abonnement_jour_paris.sql') - 1 - i));
    // Les retours du 19/10 que ce test joue d'abord : dans la chaîne, avant 20261018231827, dans l'ordre où il les joue ;
    // leurs migrations suivent 20261018231827 au manifeste, dans l'ordre inverse.
    const positions = RETOURS_1910.map((f) => codes.indexOf(f.slice(0, 14)));
    for (const p of positions) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(debut - 1); }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const indices = MIGRATIONS_1910.map((f) => lignes.indexOf(`${f}.sql`));
    for (const i of indices) expect(i).toBeGreaterThan(lignes.indexOf('20261018231827_abonnement_jour_paris.sql'));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
  it.each(GARDES_1910)('%s porte une garde d’ordre vers le retour %s : message exact dans le script et dans sa ligne du LISEZ-MOI', (garde, _premier, message) => {
    expect(sql(garde, true)).toContain(message.replace(/'/g, "''"));
    expect(lisezMoi()).toContain(message);
  });
});

describe.skipIf(!url)('les huit retours du lot « supervision et signatures » : chaîne, gardes, rejeu et marche avant (base CI)', () => {
  let db: Client;
  let org: string, owner: string, bail: string, doc: string;
  const parties = [{ personId: 'tenant', qualite: 'Locataire', prenom: 'Alice', nom: 'Test', email: 'alice@example.test', telephone: '+33600000001', externalId: 's1', statut: 'signed' }, { personId: 'owner', qualite: 'Propriétaire', prenom: 'Benoit', nom: 'Test', email: 'benoit@example.test', telephone: '+33600000002', externalId: 's2', statut: 'signed' }];
  const id = async (texte: string, params: unknown[] = []) => String((await db.query(texte, params)).rows[0].id);
  const def = async (signature: string) => String((await db.query('select pg_get_functiondef(to_regprocedure($1)) as d', [signature])).rows[0].d ?? '');
  const existe = async (signature: string) => (await db.query('select to_regprocedure($1) is not null as e', [signature])).rows[0].e as boolean;
  const occurrences = (texte: string, motif: string) => texte.split(motif).length - 1;
  const declencheurs = async () => (await db.query("select tgname from pg_trigger where not tgisinternal and tgname = any($1) and (tgname <> 'traversee_lecture_seule' or tgrelid = to_regclass('public.bail_signature_circuits')) order by 1", [DECLENCHEURS])).rows.map((r) => r.tgname as string);
  const politiques = async () => (await db.query("select policyname from pg_policies where (schemaname = 'public' and tablename = any($1)) or policyname like 'signature_bail_fichier%' order by 1", [TABLES])).rows.map((r) => r.policyname as string);
  const index = async (table: string) => (await db.query('select indexname from pg_indexes where schemaname = $1 and tablename = $2 order by 1', ['public', table])).rows.map((r) => r.indexname as string);
  const contrainte = async (nom: string) => (await db.query('select exists(select 1 from pg_constraint where conname = $1) as e', [nom])).rows[0].e as boolean;
  const versionsPresentes = async () => (await db.query('select version from supabase_migrations.schema_migrations where version = any($1) order by 1', [[...TOUTES_VERSIONS, SENTINELLE]])).rows.map((r) => r.version as string);
  const comptes = async () => {
    const lignes: Record<string, number> = {};
    for (const t of TABLES) lignes[t] = Number((await db.query(`select count(*) as n from public.${t}`)).rows[0].n);
    return lignes;
  };
  const ouvertesAnon = async () => Number((await db.query("select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')")).rows[0].n);
  /** Tout ce que le lot peut changer : fonctions (texte et droits), déclencheurs, politiques, index, contraintes, droits de table. */
  async function etat() {
    const fonctions = (await db.query("select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f, md5(pg_get_functiondef(p.oid)) as d, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1) order by 1", [[...FONCTIONS, ...ANCREES]])).rows;
    const idx = (await db.query('select tablename, indexname from pg_indexes where schemaname = $1 and tablename = any($2) order by 1, 2', ['public', TABLES])).rows;
    const contraintes = (await db.query("select conname from pg_constraint where conrelid = to_regclass('public.bail_signature_circuits') order by 1")).rows;
    const droits = (await db.query("select t, r, has_table_privilege(r, 'public.' || t, 'select') as s from unnest($1::text[]) t, unnest($2::text[]) r where to_regclass('public.' || t) is not null order by 1, 2", [TABLES, ROLES])).rows;
    const colonnes = (await db.query("select grantee, table_name, column_name, privilege_type from information_schema.column_privileges where table_schema = 'public' and table_name = any($1) and grantee = any($2) order by 1, 2, 3, 4", [TABLES, ROLES])).rows;
    return { fonctions, declencheurs: await declencheurs(), politiques: await politiques(), idx, contraintes, droits, colonnes };
  }
  /** Empreinte d'une fonction créée depuis le texte exact d'une migration, dans un point de sauvegarde annulé. */
  async function empreinteDepuisMigration(fichier: string, nom: string, signature: string) {
    await db.query('savepoint texte');
    await db.query(`drop function if exists ${signature}`);
    await db.query(definitionDeMigration(fichier, nom));
    const e = (await db.query('select md5(pg_get_functiondef(to_regprocedure($1))) as e', [signature])).rows[0].e as string;
    await db.query('rollback to savepoint texte');
    return e;
  }
  const empreinte = async (signature: string) => (await db.query('select md5(pg_get_functiondef(to_regprocedure($1))) as e', [signature])).rows[0].e as string;
  async function circuit(etat: string, modele = 'bail', empreinteCircuit = 'c') {
    return id("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,prestataire,etat,modele) values($1,$2,$3,$4,'production',repeat($5,64),repeat('a',64),$6,'zoho',$7,$8) returning id", [org, bail, doc, owner, empreinteCircuit, JSON.stringify(parties), etat, modele]);
  }
  /** L'état d'où partent les huit retours : les retours du 19/10 joués d'abord, dans l'ordre de la chaîne du LISEZ-MOI. */
  const suiviOct20 = '20261020083058_signature_suivi_reprises_relances';
  const defaire1910 = async () => {
    // Défaire d'abord le complément postérieur, qui ajoute un index au circuit.
    await db.query(sql(suiviOct20,true));
    for (const f of RETOURS_1910) await db.query(retour1910(f));
  };

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query('begin'); });
  afterAll(async () => { await db?.query('rollback'); await db?.end(); });
  beforeEach(async () => {
    await db.query('savepoint cas');
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key)');
    for (const v of [...TOUTES_VERSIONS, SENTINELLE]) await db.query('insert into supabase_migrations.schema_migrations(version) values($1) on conflict(version) do nothing', [v]);
    // Jeu de données fictif : un circuit archivé avec ses preuves, un coût déclaré tracé au registre, le budget réglé.
    org = await id("insert into public.organizations(name,type,status) values('Essai retours fictif','proprietaire_direct','active') returning id");
    owner = await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [owner, org]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id", [org, bien]);
    const locataire = await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Test','Alice','alice@example.test') returning id", [org]);
    bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',public.aujourdhui_paris(),500,20) returning id", [org, lot, locataire]);
    doc = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Contrat fictif',$1::uuid::text||'/bail.pdf','application/pdf',100,repeat('a',64)) returning id", [org]);
    await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)", [org, doc, bail]);
    const signe = await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Contrat fictif — signé',$1::uuid::text||'/signature-bail/'||gen_random_uuid()||'/contrat.pdf','application/pdf',100,repeat('b',64)) returning id", [org]);
    const termine = await circuit('termine');
    await db.query("update public.bail_signature_circuits set document_signe=$2, external_request_id='demande-fictive-1' where id=$1", [termine, signe]);
    await db.query('update public.signature_budget set plafond_demi_credits=800, devis_actif=true');
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: owner, role: 'authenticated' })]);
    await db.query("insert into public.supervision_couts(fournisseur,categorie,jour,montant_cents,reference,preuve) values('Fournisseur fictif','hebergement','2026-10-01',1200,'FACTURE-FICTIVE-1','Justificatif fictif')");
    await db.query("select set_config('request.jwt.claims','',true)");
  });
  afterEach(async () => { await db.query('rollback to savepoint cas'); });

  it('la chaîne complète retire comportements et droits, conserve tables et lignes, rétablit les textes exacts et retire ses seules versions', async () => {
    await defaire1910();
    const avant = await comptes();
    expect(avant).toMatchObject({ bail_signature_circuits: 1, signature_budget: 1, supervision_couts: 1, supervision_registre: 1, supervision_identite: 1 });
    expect(Number((await db.query("select count(*) as n from information_schema.column_privileges where table_schema='public' and table_name = any($1) and grantee = any($2)", [SUPERVISION, ROLES])).rows[0].n)).toBeGreaterThan(0);
    expect(await versionsPresentes()).toEqual([...TOUTES_VERSIONS, SENTINELLE].sort());

    // 1. Accord client sur devis.
    await db.query(sql(CHAINE[0], true));
    for (const f of ['public.lire_signature_devis(uuid,uuid)', 'public.lire_signature_devis_archive(uuid,integer)', 'public.garder_devis_en_signature()', 'public.refuser_nouvelle_signature_manuelle()']) expect(await existe(f), f).toBe(false);
    expect(await declencheurs()).not.toContain('devis_signature_verrou');
    expect(await declencheurs()).not.toContain('signature_manuelle_fin_nouveaux_envois');
    expect(await politiques()).not.toContain('signature_devis_lecture');
    expect(await index('bail_signature_circuits')).not.toContain('signature_devis_une_offre');
    expect(await index('bail_signature_circuits')).not.toContain('signature_incident_org');
    expect(await contrainte('signature_devis_cible')).toBe(false);
    expect(await contrainte('signature_incident_org_fk')).toBe(true);
    const retenir = await def('public.retenir_devis(uuid,uuid)');
    expect(retenir).not.toContain('Attendez la fin des signatures');
    expect(occurrences(retenir, "update public.incident_devis\n  set statut = 'retenu'")).toBe(1);
    let reserver = await def('public.reserver_envoi_signature_bail(uuid,uuid)');
    expect(reserver).not.toContain("v.modele='devis_artisan'");
    expect(occurrences(reserver, 'perform public.reserver_budget_signature(p_circuit);')).toBe(1);
    expect((await db.query('select devis_actif from public.signature_budget')).rows[0].devis_actif).toBe(true);
    expect(await versionsPresentes()).not.toContain('20261018193308');

    // 2. Documents signés et budget.
    await db.query(sql(CHAINE[1], true));
    for (const f of ['public.lire_budget_signatures()', 'public.regler_budget_signature(integer,integer)', 'public.reserver_budget_signature(uuid)', 'public.garder_edl_en_signature()', 'public.initialiser_cible_signature()']) expect(await existe(f), f).toBe(false);
    for (const t of ['edl_circuit_verrou', 'edl_lignes_circuit_verrou', 'edl_cles_circuit_verrou', 'edl_compteurs_circuit_verrou', 'signature_cible']) expect(await declencheurs()).not.toContain(t);
    reserver = await def('public.reserver_envoi_signature_bail(uuid,uuid)');
    expect(reserver).not.toContain('reserver_budget_signature');
    expect(reserver).not.toContain('v.modele');
    expect(await empreinte('public.reserver_envoi_signature_bail(uuid,uuid)')).toBe(await empreinteDepuisMigration(CHAINE[4], 'reserver_envoi_signature_bail', 'public.reserver_envoi_signature_bail(uuid,uuid)'));
    let archiver = await def('public.archiver_signature_bail(uuid,uuid,jsonb)');
    expect(occurrences(archiver, "v.prestataire='zoho'")).toBe(4);
    expect(archiver).not.toContain('v.modele');
    expect(await empreinte('public.archiver_signature_bail(uuid,uuid,jsonb)')).toBe(await empreinteDepuisMigration(CHAINE[2], 'archiver_signature_bail', 'public.archiver_signature_bail(uuid,uuid,jsonb)'));
    const activer = await def('public.activer_bail_signature_electronique(uuid)');
    expect(activer).toContain("if v.etat<>'termine'");
    expect(activer).not.toContain('v.modele');
    expect((await db.query("select is_nullable from information_schema.columns where table_schema='public' and table_name='bail_signature_circuits' and column_name='cible_id'")).rows[0].is_nullable).toBe('YES');
    const unique = (await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='bail_signature_un_circuit_actif'")).rows[0].indexdef as string;
    expect(unique).toContain('(bail_id)');
    expect(unique).not.toContain('modele');
    for (const p of ['signature_budget_admin', 'signature_budget_serveur', 'signature_consommations_admin', 'signature_consommations_serveur']) expect(await politiques()).not.toContain(p);
    expect(await index('signature_consommations')).toEqual(['signature_consommations_pkey']);
    expect(await versionsPresentes()).not.toContain('20261018185515');

    // 3. Certificat commun Zoho.
    await db.query(sql(CHAINE[2], true));
    archiver = await def('public.archiver_signature_bail(uuid,uuid,jsonb)');
    expect(archiver).not.toContain('v.prestataire');
    expect(archiver).not.toContain('gerimmo.systeme');
    expect(await empreinte('public.archiver_signature_bail(uuid,uuid,jsonb)')).toBe(await empreinteDepuisMigration(CHAINE[4], 'archiver_signature_bail', 'public.archiver_signature_bail(uuid,uuid,jsonb)'));
    expect(await versionsPresentes()).not.toContain('20261018143644');

    // 4. Prestataire du circuit.
    await db.query(sql(CHAINE[3], true));
    expect(await index('bail_signature_circuits')).not.toContain('bail_signature_reference_prestataire');
    expect(await contrainte('bail_signature_circuits_external_request_id_key')).toBe(true);
    expect((await db.query("select count(*) as n from information_schema.columns where table_schema='public' and table_name='bail_signature_circuits' and column_name in ('prestataire','modele','cible_id','options','essai','incident_id')")).rows[0].n).toBe('6');
    expect(await versionsPresentes()).not.toContain('20261018100243');

    // 5. Circuit de signature du bail : la table reste, fermée.
    await db.query(sql(CHAINE[4], true));
    expect((await db.query("select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)", [FONCTIONS.slice(3, 11)])).rows[0].n).toBe('0');
    expect(await declencheurs()).toEqual(['supervision_cout_trace', 'supervision_identite_trace', 'supervision_prospect_trace']);
    expect(await politiques()).toEqual(expect.not.arrayContaining(['signature_bail_lecture', 'signature_bail_serveur', 'signature_bail_fichier_update', 'signature_bail_fichier_delete']));
    expect(await index('bail_signature_circuits')).toEqual(['bail_signature_circuits_external_request_id_key', 'bail_signature_circuits_pkey']);
    const garde = await def('public.refuser_ecriture_si_fermee()');
    expect(garde).not.toContain('Suivi serveur des signatures déjà engagées (18/10/2026)');
    expect(garde).toContain("Relecture du 15/10 (annuler une invitation d'artisan, abonnement suspendu)");
    expect(occurrences(garde, "  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;")).toBe(1);
    expect(await versionsPresentes()).not.toContain('20261018085521');

    // 6. Index de supervision.
    await db.query(sql(CHAINE[5], true));
    for (const t of SUPERVISION) expect((await index(t)).filter((i) => i.endsWith('_idx'))).toEqual([]);
    expect(await versionsPresentes()).toEqual(expect.not.arrayContaining(['20261018071556', '20261018071811']));

    // 7. Supervision complète : cinq tables conservées, fermées.
    await db.query(sql(CHAINE[6], true));
    for (const f of ['public.supervision_total_couts(date,date)', 'public.supervision_tracer_modification()']) expect(await existe(f), f).toBe(false);
    expect((await db.query("select to_regclass('public.supervision_utilisateurs') is null as absente")).rows[0].absente).toBe(true);
    expect(await declencheurs()).toEqual([]);
    expect(await politiques()).toEqual([]);
    for (const t of SUPERVISION) for (const i of await index(t)) expect(i, t).toMatch(/_(pkey|key)$/);
    expect(await contrainte('identite_champs_connus')).toBe(true);
    expect(await contrainte('supervision_couts_fournisseur_reference_key')).toBe(true);
    expect((await db.query("select count(*) as n from information_schema.columns where table_schema='public' and table_name='development_proposals' and column_name='preuve_publication'")).rows[0].n).toBe('1');
    expect(await versionsPresentes()).toEqual(expect.not.arrayContaining(['20261018061548', '20261018071200']));

    // 8. Finances de supervision.
    await db.query(sql(CHAINE[7], true));
    expect(await existe('public.supervision_finances()')).toBe(false);

    // Bilan : versions, fonctions, tables conservées et fermées, lignes intactes, rien d'ouvert à anon.
    expect(await versionsPresentes()).toEqual([SENTINELLE]);
    expect((await db.query("select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)", [FONCTIONS])).rows[0].n).toBe('0');
    expect(await comptes()).toEqual(avant);
    for (const t of TABLES) {
      const ligne = (await db.query("select relrowsecurity as rls, obj_description(oid) as c from pg_class where oid = to_regclass('public.' || $1)", [t])).rows[0];
      expect(ligne.rls, t).toBe(true);
      expect(String(ligne.c), t).toContain('onservée après le retour de');
      for (const r of ROLES) for (const p of ['select', 'insert', 'update', 'delete']) expect((await db.query('select has_table_privilege($1, $2, $3) as p', [r, `public.${t}`, p])).rows[0].p, `${r} ${p} ${t}`).toBe(false);
    }
    expect((await db.query("select count(*) as n from information_schema.column_privileges where table_schema='public' and table_name = any($1) and grantee = any($2)", [TABLES, ROLES])).rows[0].n).toBe('0');
    expect(await ouvertesAnon()).toBe(0);
  });

  it('chaque retour se rejoue sans effet : état et lignes identiques', async () => {
    await defaire1910();
    for (const f of CHAINE) await db.query(sql(f, true));
    const apres = await etat();
    const lignes = await comptes();
    for (const f of CHAINE) await db.query(sql(f, true));
    expect(await etat()).toEqual(apres);
    expect(await comptes()).toEqual(lignes);
    expect(await versionsPresentes()).toEqual([SENTINELLE]);
  });

  it.each([
    [[] as string[], CHAINE[1], /20261018193308/],
    [[], CHAINE[2], /20261018185515/],
    [[CHAINE[0], CHAINE[1]], CHAINE[3], /20261018143644/],
    [[CHAINE[0], CHAINE[1], CHAINE[2]], CHAINE[4], /20261018100243/],
    [[CHAINE[0]], CHAINE[4], /20261018185515/],
    [[], CHAINE[6], /20261018071556/],
  ])('garde d’ordre : après %j, le retour %s refuse en nommant la migration à défaire d’abord', async (prealables, hors_ordre, attendu) => {
    await defaire1910();
    for (const f of prealables) await db.query(sql(f, true));
    const avant = await etat();
    const versions = await versionsPresentes();
    if (hors_ordre === CHAINE[3]) {
      // Preuve de la cause (le message de 20261018100243 nomme toujours les trois migrations) : après les retours de 193308 et
      // 185515, ses deux premières conditions sont déjà fausses ; seule la colonne prestataire encore citée par
      // archiver_signature_bail (20261018143644) déclenche le refus.
      expect(await existe('public.reserver_budget_signature(uuid)')).toBe(false);
      expect(await contrainte('signature_devis_cible')).toBe(false);
      expect(await def('public.archiver_signature_bail(uuid,uuid,jsonb)')).toContain('v.prestataire');
    }
    await db.query('savepoint ordre');
    await expect(db.query(sql(hors_ordre, true))).rejects.toThrow(attendu);
    await db.query('rollback to savepoint ordre');
    expect(await etat()).toEqual(avant);
    expect(await versionsPresentes()).toEqual(versions);
  });

  it.each(GARDES_1910)('garde d’ordre du 19/10 : le retour %s refuse tant que le retour %s n’est pas joué, en le nommant, sans rien modifier ; joué, il passe', async (garde, premier, message) => {
    // Les autres retours du 19/10 sont joués ; `premier` seul manque. Pour 20261018061548, les six retours précédents du lot aussi.
    await db.query(sql(suiviOct20, true));
    for (const f of RETOURS_1910.filter((r) => r !== premier)) await db.query(retour1910(f));
    for (const f of CHAINE.slice(0, CHAINE.indexOf(garde))) await db.query(sql(f, true));
    // Cause prouvée : l'objet que `premier` défait est encore sous sa forme du 19/10.
    if (premier === RETOURS_1910[0]) {
      expect(await def('public.garder_devis_en_signature()')).toContain('B5 (19/10/2026)');
      expect((await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='signature_devis_une_offre'")).rows[0].indexdef).not.toContain('termine');
    } else if (premier === RETOURS_1910[1]) {
      expect((await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='public.supervision_identite'::regclass and conname='identite_champs_connus'")).rows[0].d).toContain("'coordonneesSupabase'");
    } else {
      expect(await def('public.supervision_tracer_modification()')).toContain('pg_trigger_depth');
    }
    const avant = await etat();
    const versions = await versionsPresentes();
    await db.query('savepoint ordre_1910');
    await expect(db.query(sql(garde, true))).rejects.toThrow(message);
    await db.query('rollback to savepoint ordre_1910');
    expect(await etat()).toEqual(avant);
    expect(await versionsPresentes()).toEqual(versions);
    await db.query(retour1910(premier));
    await db.query(sql(garde, true));
    expect(await versionsPresentes()).not.toContain(garde.slice(0, 14));
  });

  it('garde « en vol » : un circuit en cours chez le prestataire fait refuser le retour de 20261018085521', async () => {
    await defaire1910();
    await circuit('en_cours', 'bail', 'd');
    for (const f of CHAINE.slice(0, 4)) await db.query(sql(f, true));
    const avant = await etat();
    await db.query('savepoint vol');
    await expect(db.query(sql(CHAINE[4], true))).rejects.toThrow(/1 circuit\(s\) en cours/);
    await db.query('rollback to savepoint vol');
    expect(await etat()).toEqual(avant);
    expect(await versionsPresentes()).toContain('20261018085521');
    expect(await existe('public.reserver_envoi_signature_bail(uuid,uuid)')).toBe(true);
    // Annulé depuis l'application : le retour passe.
    await db.query("update public.bail_signature_circuits set etat='annule' where etat='en_cours'");
    await db.query(sql(CHAINE[4], true));
    expect(await existe('public.reserver_envoi_signature_bail(uuid,uuid)')).toBe(false);
  });

  it('garde des doublons : deux circuits actifs sur un même bail font refuser l’index unique par bail de 20261018185515', async () => {
    await defaire1910();
    await circuit('pret', 'bail', 'd');
    await circuit('pret', 'cautionnement', 'e');
    await db.query(sql(CHAINE[0], true));
    await db.query('savepoint doublons');
    await expect(db.query(sql(CHAINE[1], true))).rejects.toThrow(/1 bail\(x\) portent plusieurs circuits actifs/);
    await db.query('rollback to savepoint doublons');
    expect(await versionsPresentes()).toContain('20261018185515');
    await db.query("update public.bail_signature_circuits set etat='annule' where modele='cautionnement'");
    await db.query(sql(CHAINE[1], true));
    expect((await db.query("select indexdef from pg_indexes where indexname='bail_signature_un_circuit_actif'")).rows[0].indexdef).toContain('(bail_id)');
  });

  it('atomicité : une erreur dans le lot contrôlé annule le retour et son historique ensemble', async () => {
    await defaire1910();
    const avant = await etat();
    await db.query('savepoint panne');
    await expect(db.query(sql(CHAINE[0], true) + '\nselect 1/0;')).rejects.toThrow(/division by zero/);
    await db.query('rollback to savepoint panne');
    expect(await etat()).toEqual(avant);
    expect(await versionsPresentes()).toContain('20261018193308');
  });

  it('marche avant : après suppression manuelle des objets conservés, les huit migrations puis celles du 19/10 redonnent l’état intégré d’avant la chaîne', async () => {
    const avant = await etat();
    await defaire1910();
    for (const f of CHAINE) await db.query(sql(f, true));
    // La préparation que la marche avant exige (décision écrite) : ces tables et cette colonne existent encore.
    await db.query('savepoint sans_preparation');
    await expect(db.query(sql(CHAINE[6]))).rejects.toThrow(/already exists/);
    await db.query('rollback to savepoint sans_preparation');
    await db.query(`drop table ${TABLES.map((t) => `public.${t}`).join(', ')} cascade`);
    await db.query('alter table public.development_proposals drop column preuve_publication');
    for (const f of [...CHAINE].reverse()) {
      await db.query(sql(f));
      for (const v of versions(f)) await db.query('insert into supabase_migrations.schema_migrations(version) values($1) on conflict(version) do nothing', [v]);
    }
    // Puis les migrations du 19/10 que leurs retours avaient défaites, dans l'ordre du manifeste : l'empreinte est celle du départ.
    for (const f of MIGRATIONS_1910) await db.query(sql(f));
    await db.query(sql(suiviOct20));
    // La table d’identité recréée doit aussi retrouver sa colonne et ses droits du 22/10.
    await db.query(sql('20261022210326_reglage_blocage_souscription_identite'));
    // Le circuit recréé retrouve aussi la confirmation sur place de l'état des lieux et la garde de l'envoi du 24/10.
    await db.query(sql('20261024120000_signature_caution_mobile_et_edl_sur_place'));
    // Et la table des prospects ses colonnes, sa liste d'origines et ses droits du 24/10 (plan de conformité, R45).
    await db.query(sql('20261024140000_conservation_et_prospection'));
    expect(await etat()).toEqual(avant);
    expect(await versionsPresentes()).toEqual([...TOUTES_VERSIONS, SENTINELLE].sort());
    expect(await ouvertesAnon()).toBe(0);
  });
});
