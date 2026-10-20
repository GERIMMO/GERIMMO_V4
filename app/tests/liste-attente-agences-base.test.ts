/**
 * Liste d'attente des agences de gestion locative (décision du dirigeant du 20/10/2026) : la table
 * public.liste_attente_agences, distincte de liste_attente du 29/09 — 20261020120000_liste_attente_agences.sql et son retour
 * arrière atomique.
 *
 * Sans base : la migration est rejouable sans transaction interne et se termine par fermer_fonctions_a_anon ; le plafond suit
 * le modèle exact de liste_attente_limiter (message exact, P0001) ; aucune insertion n'est accordée à anon ni authenticated
 * (décision X02) ; le retour est UNE SEULE instruction `do` atomique, recensée par retours-atomicite.test.ts (première ligne
 * « -- Instruction atomique ; »), bornée par lock_timeout dès sa garde, qui refuse si la table contient une ligne ; manifeste
 * (une fois, après 20261020084651), MISSION_OCTOBRE, LISEZ-MOI (ligne du tableau), chaîne « Ordre complet » (avant
 * 20261020084651 — en tête aujourd'hui ; seul l'ordre relatif est exigé, pour survivre aux migrations suivantes).
 *
 * Sur une vraie base (SUPABASE_DB_URL, transaction annulée) :
 *  · catalogue : colonnes, onze contraintes validées, index unique sur lower(email) et index récent, deux politiques
 *    super-administrateur, deux déclencheurs, fonction du plafond (security definer, search_path vide, fermée à anon et
 *    authenticated), commentaire, RLS ;
 *  · droits : anon rien (ni table ni colonne) ; authenticated : lecture et mise à jour de statut et contactee_le seulement,
 *    aucune insertion ; service_role : lecture, insertion, modification, suppression ;
 *  · politiques : un compte connecté ordinaire (même en AAL2) ne voit aucune ligne et n'en modifie aucune ; un super-admin
 *    sans second facteur non plus ; le super-admin (adhésion active + AAL2) lit et marque « contactée », et ne peut ni insérer
 *    ni toucher une autre colonne ;
 *  · bornes de chaque champ (trop long, vide après btrim, caractère de contrôle, blanc Unicode dans l'e-mail, code postal à
 *    quatre chiffres, tranche et statut inconnus, saut de ligne ADMIS dans message et REFUSÉ dans agence) ; unicité
 *    insensible à la casse ; plafond : 30 inscriptions dans l'heure passent, la 31e reçoit le message exact ;
 *  · rejeu : empreinte identique ; le bloc de contrôle s'arrête si l'une des dix bornes CHECK manque ou n'est pas validée
 *    (table homonyme préexistante à définition divergente, que `create table if not exists` ne reposerait pas) ; retour : refusé avec une ligne (rien ne change), accepté à vide (déclencheurs, fonction,
 *    table et ligne d'historique retirés, la voisine reste), rejoué sans effet, atomique (erreur forcée dans le même message :
 *    rien ne persiste), puis la migration ré-appliquée redonne la même empreinte.
 *
 * Deux bases possibles : préparée par le manifeste (la table existe) ; plus ancienne, sans la table (la migration s'applique
 * dans la transaction). L'essai d'atomicité du retour ouvre sa propre connexion, avant la transaction principale.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transactionsInterdites } from '../scripts/verifier-transactions-migration.mjs';
import { verifierBaseDeTest } from './garde-base';
config({ path: '.env.local' }); const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);

const NOM = '20261020120000_liste_attente_agences';
const VERSION = '20261020120000';
const TABLE = 'public.liste_attente_agences';
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, 'utf8');
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, 'utf8');
const COMMENTAIRE = "Liste d'attente des agences de gestion locative, inscrites depuis le site vitrine (créée le 20/10/2026 sur décision du dirigeant ; distincte de liste_attente du 29/09). Écrite par l'action serveur (clé de service) après le pot de miel et la validation ; lue et suivie (statut, contactee_le) par le super-administrateur. Plafond : liste_attente_agences_limiter.";
const REFUS_PLAFOND = "Le formulaire reçoit beaucoup d'inscriptions en ce moment : réessayez dans une heure.";
const REFUS_RETOUR = /^Retour arrière refusé : public\.liste_attente_agences contient \d+ inscription\(s\) d'agence ; décision du dirigeant requise avant toute suppression\.$/;
const PLAFOND = 30;
const TRANCHES = ['moins_de_50', '50_a_199', '200_a_499', '500_et_plus'];
const STATUTS = ['en_attente', 'contactee', 'convertie', 'retiree'];
/** Un caractère par son code : certains blancs sont invisibles, et U+2028 termine une ligne pour le lecteur JavaScript. */
const car = (code: number) => String.fromCharCode(code);
/** La fermeture générale des fonctions est testée ailleurs ; la rejouer dans la transaction d'un essai verrouillerait les autres lots. */
const sansFermeture = (sql: string) => sql.replace(/^select public\.fermer_fonctions_a_anon\(\);$/gm, '');

describe('liste d’attente des agences — les fichiers du lot (sans base)', () => {
  it('la migration est rejouable sans transaction interne, pose le verrou borné, ne cite pas le jour de Paris et ferme les fonctions à anon en fin', () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    expect(MIGRATION).not.toContain('aujourdhui_paris');
    expect(MIGRATION).toContain("do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;");
    expect(MIGRATION).toContain(`create table if not exists ${TABLE} (`);
    expect(MIGRATION).toContain(`create unique index if not exists liste_attente_agences_email_lower_idx on ${TABLE} (lower(email));`);
    expect(MIGRATION).toContain(`create index if not exists liste_attente_agences_recent_idx on ${TABLE} (created_at desc);`);
    expect(MIGRATION).toContain(`drop trigger if exists diagnostic_artisan_lecture on ${TABLE};`);
    expect(MIGRATION).toMatch(/create trigger diagnostic_artisan_lecture before insert or update or delete on public\.liste_attente_agences\s+for each row execute function public\.refuser_mutation_diagnostic_artisan\(\);/);
    expect(MIGRATION).toContain('do $controle$');
    expect(MIGRATION).toContain('créée le 20/10/2026'); // le commentaire de table date l'origine
    expect(MIGRATION).toContain('distincte de liste_attente du 29/09');
    // Aucune règle de conservation inventée (le code, commentaires retirés, ne touche pas retention_rules) : la durée est à décider
    // par le dirigeant et le DPO, et l'en-tête le dit.
    expect(MIGRATION.replace(/^\s*--.*$/gm, '')).not.toContain('retention_rules');
    expect(MIGRATION).toContain('Pas de règle retention_rules');
    expect(MIGRATION.trimEnd().endsWith('select public.fermer_fonctions_a_anon();')).toBe(true);
  });

  it("le plafond d'insertion suit le modèle exact de liste_attente_limiter : security definer, search_path vide, verrou, droits retirés, message exact", () => {
    expect(MIGRATION).toContain('create or replace function public.liste_attente_agences_limiter()');
    expect(MIGRATION).toMatch(/liste_attente_agences_limiter\(\)\s+returns trigger\s+language plpgsql\s+security definer\s+set search_path = ''/);
    expect(MIGRATION).toContain("pg_advisory_xact_lock(hashtext('public.liste_attente_agences'))");
    expect(MIGRATION).toContain(`if v_total >= ${PLAFOND} then`);
    expect(MIGRATION).toContain(`raise exception '${REFUS_PLAFOND.replace("'", "''")}'`);
    expect(MIGRATION).toContain("using errcode = 'P0001'");
    expect(MIGRATION).toContain('revoke execute on function public.liste_attente_agences_limiter() from public, anon, authenticated;');
    expect(MIGRATION).toMatch(/create trigger liste_attente_agences_limiter\s+before insert on public\.liste_attente_agences\s+for each row execute function public\.liste_attente_agences_limiter\(\);/);
  });

  it("droits et politiques du contrat : anon rien, authenticated lecture et update (statut, contactee_le) sous politiques super-admin, service_role tout, aucune insertion pour anon ni authenticated (décision X02)", () => {
    expect(MIGRATION).toContain(`alter table ${TABLE} enable row level security;`);
    expect(MIGRATION).toContain(`revoke all on table ${TABLE} from public, anon, authenticated;`);
    expect(MIGRATION).toContain(`grant select on table ${TABLE} to authenticated;`);
    expect(MIGRATION).toContain(`grant update (statut, contactee_le) on table ${TABLE} to authenticated;`);
    expect(MIGRATION).toContain(`grant select, insert, update, delete on table ${TABLE} to service_role;`);
    expect(MIGRATION).not.toMatch(/grant[^;]*insert[^;]*to (public|anon|authenticated)/i);
    expect(MIGRATION).not.toMatch(/to anon\b/);
    expect(MIGRATION).toMatch(/create policy liste_attente_agences_select_sa on public\.liste_attente_agences\s+for select to authenticated using \(\(select public\.is_super_admin\(\)\)\);/);
    expect(MIGRATION).toMatch(/create policy liste_attente_agences_update_sa on public\.liste_attente_agences\s+for update to authenticated using \(\(select public\.is_super_admin\(\)\)\) with check \(\(select public\.is_super_admin\(\)\)\);/);
    expect(MIGRATION).not.toMatch(/create policy[^;]*for (insert|all|delete)/i);
    // Les bornes du contrat, telles qu'écrites.
    expect(MIGRATION).toContain("constraint liste_attente_agences_email_format check (email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$')");
    expect(MIGRATION).toContain("constraint liste_attente_agences_code_postal_format check (code_postal ~ '^[0-9]{5}$')");
    expect(MIGRATION).toContain(`constraint liste_attente_agences_nb_lots_check check (nb_lots in (${TRANCHES.map((t) => `'${t}'`).join(', ')}))`);
    expect(MIGRATION).toContain(`constraint liste_attente_agences_statut_check check (statut in (${STATUTS.map((s) => `'${s}'`).join(', ')}))`);
    // Le saut de ligne n'est admis que dans le message : la classe de contrôle y est écrite en E'…', sans U+000A.
    expect(MIGRATION).toContain("message !~ E'[\\x01-\\x09\\x0B-\\x1F\\x7F]'");
    expect(MIGRATION).toContain("statut text not null default 'en_attente'");
    // Le bloc de contrôle compte les dix bornes CHECK validées : `create table if not exists` ne reposerait pas une borne manquante
    // sur une table homonyme préexistante.
    expect(MIGRATION).toContain("where conrelid = 'public.liste_attente_agences'::regclass and contype = 'c' and convalidated) <> 10 then");
    expect(MIGRATION).toContain("raise exception 'liste_attente_agences : dix contraintes CHECK validées attendues';");
  });

  it("le retour est une seule instruction `do` atomique (forme des retours du 20/10), refuse si la table contient une ligne, retire déclencheurs, fonction, table et sa seule version", () => {
    const [premiere, ...reste] = RETOUR.trimEnd().split('\n');
    // Recensé par retours-atomicite.test.ts, qui ne lit que les fichiers ouvrant par « -- Instruction atomique ; » ; la décision du
    // dirigeant reste nommée en première ligne.
    expect(premiere).toMatch(/^-- Instruction atomique ; participe à une transaction externe sans la valider\. .*décision du dirigeant/);
    expect(reste.join('\n')).toMatch(/^do \$retour_atomique\$[\s\S]*end \$retour_atomique\$;$/);
    expect(RETOUR.match(/\$retour_atomique\$/g)).toHaveLength(2);
    expect(transactionsInterdites(RETOUR)).toEqual([]);
    expect(RETOUR).toContain("execute 'select count(*) from public.liste_attente_agences' into n;");
    expect(RETOUR).toMatch(/if n > 0 then\s+raise exception 'Retour arrière refusé : public\.liste_attente_agences contient % inscription\(s\) d''agence ; décision du dirigeant requise avant toute suppression\.', n using errcode = 'P0001';/);
    expect(RETOUR).toContain("set local lock_timeout='10s';");
    // Le verrou est borné dès la garde : le comptage n'attend pas sans limite derrière un verrou exclusif d'une autre session.
    expect(RETOUR).toMatch(/^begin\s+perform set_config\('lock_timeout', '10s', true\);\s+if to_regclass\('public\.liste_attente_agences'\) is not null then/m);
    expect(RETOUR).toContain(`drop trigger if exists liste_attente_agences_limiter on ${TABLE};`);
    expect(RETOUR).toContain(`drop trigger if exists diagnostic_artisan_lecture on ${TABLE};`);
    expect(RETOUR).toContain(`drop table if exists ${TABLE};`);
    expect(RETOUR).toContain('drop function if exists public.liste_attente_agences_limiter();');
    expect(RETOUR).toContain(`delete from supabase_migrations.schema_migrations where version='${VERSION}';`);
    expect(RETOUR).not.toMatch(/truncate|delete from public\./i);
    expect(RETOUR).not.toContain('aujourdhui_paris');
    // Il ne touche qu'à ses objets : aucune autre table ni fonction nommée.
    expect([...RETOUR.matchAll(/public\.(\w+)/g)].map((m) => m[1]).every((o) => o.startsWith('liste_attente_agences'))).toBe(true);
  });

  it('manifeste (une fois, après 20261020084651), MISSION_OCTOBRE, LISEZ-MOI (ligne du tableau) et chaîne « Ordre complet » (avant 20261020084651)', () => {
    const manifeste = readFileSync('e2e/local/ordre-migrations.txt', 'utf8').trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    // Ordre relatif seulement : la prochaine migration du dépôt prendra la fin du manifeste sans que rien ne régresse ici.
    expect(manifeste).toContain('20261020084651_depots_directs_temporaires.sql');
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf('20261020084651_depots_directs_temporaires.sql'));
    expect(readFileSync('tests/relais-migrations-manifeste.test.ts', 'utf8')).toContain(`"${NOM}.sql",`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync('supabase/retours-arriere/LISEZ-MOI.md', 'utf8');
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi).toContain('`liste_attente_agences_limiter`');
    expect(lisezMoi).toContain('décision du dirigeant requise avant toute suppression');
    const chaines = [...lisezMoi.matchAll(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/g)];
    expect(chaines, 'une seule chaîne complète').toHaveLength(1);
    const codes = [...chaines[0][1].matchAll(/`(\d{14}|\d{6})`/g)].map((m) => m[1]);
    // Avant 20261020084651 (en tête aujourd'hui) : l'ordre relatif survit au prochain retour placé en tête de chaîne.
    expect(codes).toContain('20261020084651');
    expect(codes.filter((c) => c === VERSION)).toHaveLength(1);
    expect(codes.indexOf(VERSION)).toBeLessThan(codes.indexOf('20261020084651'));
    // La parenthèse qui suit ne cite aucune version (le test du jour de Paris lit tous les codes de la chaîne).
    const parenthese = chaines[0][1].match(/`20261020120000` \(([^)]*)\)/)?.[1] ?? '';
    expect(parenthese).toMatch(/liste d'attente des agences/);
    expect(parenthese).not.toMatch(/\d{6}/);
  });
});

type Ligne = Record<string, unknown>;

describe.skipIf(!url)('liste d’attente des agences — atomicité du retour (connexion propre, autocommit)', () => {
  it("le fichier exact, joué avec une erreur forcée dans le même message, ne laisse rien : ni la suppression de la table, ni le témoin", async () => {
    const db = new Client({ connectionString: url }); await db.connect();
    try {
      const etat = async () => (await db.query("select to_regclass('public.liste_attente_agences')::text as table, to_regprocedure('public.liste_attente_agences_limiter()')::text as fonction")).rows[0];
      await db.query('create temporary table temoin_atomicite_liste_attente_agences(v integer)');
      // La migration d'abord (sans effet si la table existe déjà, pose la table sur une base plus ancienne), le témoin, le retour, puis l'erreur.
      const avant = await etat();
      const tentative = db.query(`begin; ${sansFermeture(MIGRATION)} insert into temoin_atomicite_liste_attente_agences values (1); ${RETOUR} select 1/0; commit;`);
      await expect(tentative).rejects.toMatchObject({ code: '22012' });
      await db.query('rollback');
      expect((await db.query('select count(*)::int as n from temoin_atomicite_liste_attente_agences')).rows[0].n).toBe(0);
      expect(await etat()).toEqual(avant);
    } finally { await db.query('rollback').catch(() => undefined); await db.end(); }
  });
});

describe.skipIf(!url)('liste d’attente des agences — public.liste_attente_agences (base)', () => {
  let db: Client;
  async function role(r: 'anon' | 'authenticated' | 'service_role' | 'postgres') {
    await db.query('reset role');
    if (r === 'postgres') return;
    // Un compte connecté ORDINAIRE, même au second facteur : aucune adhésion de super-administrateur.
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(r === 'authenticated' ? { sub: randomUUID(), role: r, aal: 'aal2' } : { role: r })]);
    await db.query(`set local role ${r}`);
  }
  /** Un super-administrateur (adhésion active), connecté au niveau de session demandé (AAL2 = second facteur vérifié). */
  async function superAdmin(aal: 'aal2' | 'aal1' = 'aal2') {
    await db.query('reset role');
    const { rows: [{ id }] } = await db.query("insert into auth.users (id, email) values (gen_random_uuid(), gen_random_uuid() || '@exemple.test') returning id");
    await db.query("insert into public.memberships (account_id, role, status) values ($1, 'super_admin', 'active')", [id]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: 'authenticated', aal })]);
    await db.query('set local role authenticated');
  }
  async function essayer(sql: string, args: unknown[] = []) {
    await db.query('savepoint essai');
    try { const r = await db.query(sql, args); await db.query('release savepoint essai'); return r; }
    catch (e) { await db.query('rollback to savepoint essai'); throw e; }
  }
  type Inscription = { email: string; agence?: string; contact?: string; telephone?: string | null; code_postal?: string; nb_lots?: string; message?: string | null; source?: string | null };
  const inscrire = ({ email, agence = 'Agence Exemple', contact = 'Camille Exemple', telephone = null, code_postal = '75001', nb_lots = '50_a_199', message = null, source = '/agences' }: Inscription) =>
    essayer('insert into public.liste_attente_agences (email, agence, contact, telephone, code_postal, nb_lots, message, source) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [email, agence, contact, telephone, code_postal, nb_lots, message, source]);
  const refus = (contrainte: string) => new RegExp(`violates check constraint "${contrainte}"`);
  const lignes = async (sql: string, args: unknown[] = []): Promise<Ligne[]> => (await db.query(sql, args)).rows;
  const un = async <T extends Ligne>(sql: string, args: unknown[] = []): Promise<T> => (await db.query(sql, args)).rows[0] as T;

  /** Tout ce que la migration et son retour peuvent changer — fonction du plafond et déclencheurs compris. Vide quand la table est absente. */
  async function empreinte() {
    return {
      colonnes: await lignes("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'liste_attente_agences' order by ordinal_position"),
      contraintes: await lignes("select conname, pg_get_constraintdef(oid) as def, convalidated from pg_constraint where conrelid = to_regclass('public.liste_attente_agences') and contype <> 'n' order by conname"),
      index: await lignes("select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'liste_attente_agences' order by indexname"),
      politiques: await lignes("select policyname, permissive, roles::text as roles, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'liste_attente_agences' order by policyname"),
      classe: await lignes("select relrowsecurity, relforcerowsecurity, relacl::text as droits, obj_description(oid, 'pg_class') as commentaire from pg_class where oid = to_regclass('public.liste_attente_agences')"),
      colonnesDroits: await lignes("select attname, attacl::text as droits from pg_attribute where attrelid = to_regclass('public.liste_attente_agences') and attnum > 0 and not attisdropped order by attnum"),
      declencheurs: await lignes("select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = to_regclass('public.liste_attente_agences') and not tgisinternal order by tgname"),
      fonctions: await lignes("select oid::regprocedure::text as signature, md5(pg_get_functiondef(oid)) as definition, proacl::text as droits, prosecdef, proconfig::text as config from pg_proc where oid = to_regprocedure('public.liste_attente_agences_limiter()')"),
    };
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query('begin');
    // Base préparée par le manifeste : la table est là. Base plus ancienne, sans la table : la migration s'applique dans la transaction.
    if (!(await un<{ t: string | null }>("select to_regclass('public.liste_attente_agences')::text as t")).t) await db.query(sansFermeture(MIGRATION));
  });
  afterAll(async () => { await db?.query('rollback'); await db?.end(); });
  beforeEach(async () => { await db.query('reset role'); await db.query('savepoint cas'); });
  afterEach(async () => { await db.query('rollback to savepoint cas'); });

  it("service_role (la clé de service de l'action serveur) inscrit une agence : une ligne, en attente, horodatée par la base", async () => {
    await role('service_role');
    expect((await inscrire({ email: 'Contact@Agence-Exemple.test', telephone: '01 23 45 67 89', message: 'Nous gérons deux copropriétés.\nRappel le matin de préférence.' })).rowCount).toBe(1);
    expect((await inscrire({ email: 'minimum@agence-exemple.test', nb_lots: 'moins_de_50' })).rowCount).toBe(1);
    const l = await un<Ligne>("select email, agence, contact, telephone, code_postal, nb_lots, message, source, statut, contactee_le, created_at > now() - interval '1 minute' as recente, id is not null as id_present from public.liste_attente_agences where email = 'Contact@Agence-Exemple.test'");
    expect(l).toEqual({ email: 'Contact@Agence-Exemple.test', agence: 'Agence Exemple', contact: 'Camille Exemple', telephone: '01 23 45 67 89', code_postal: '75001', nb_lots: '50_a_199', message: 'Nous gérons deux copropriétés.\nRappel le matin de préférence.', source: '/agences', statut: 'en_attente', contactee_le: null, recente: true, id_present: true });
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente_agences where lower(email) like '%@agence-exemple.test'")).n).toBe(2);
  });

  it('anon (la clé publiable du site) ne fait rien : ni insertion, ni lecture, ni modification, ni suppression', async () => {
    await role('service_role');
    await inscrire({ email: 'lue@agence-exemple.test' });
    await role('anon');
    await expect(inscrire({ email: 'anonyme@agence-exemple.test' })).rejects.toThrow(/permission denied for table liste_attente_agences/);
    await expect(essayer('select count(*) from public.liste_attente_agences')).rejects.toThrow(/permission denied for table liste_attente_agences/);
    await expect(essayer("update public.liste_attente_agences set statut = 'contactee' where email = 'lue@agence-exemple.test'")).rejects.toThrow(/permission denied for table liste_attente_agences/);
    await expect(essayer("delete from public.liste_attente_agences where email = 'lue@agence-exemple.test'")).rejects.toThrow(/permission denied for table liste_attente_agences/);
  });

  it("authenticated ordinaire (un compte connecté, même au second facteur) : aucune insertion, aucune ligne lue, aucune ligne modifiée, aucune suppression", async () => {
    await role('service_role');
    await inscrire({ email: 'cachee@agence-exemple.test' });
    await role('authenticated');
    await expect(inscrire({ email: 'connecte@agence-exemple.test' })).rejects.toThrow(/permission denied for table liste_attente_agences/);
    // Le droit de lecture existe (console du super-administrateur) ; la politique ne rend aucune ligne à un autre compte.
    expect((await un<{ n: number }>('select count(*)::int as n from public.liste_attente_agences')).n).toBe(0);
    expect((await essayer("update public.liste_attente_agences set statut = 'contactee', contactee_le = now() where email = 'cachee@agence-exemple.test'")).rowCount).toBe(0);
    // Une colonne hors du suivi : refusée par le droit avant même la politique.
    await expect(essayer("update public.liste_attente_agences set agence = 'Autre' where email = 'cachee@agence-exemple.test'")).rejects.toThrow(/permission denied for table liste_attente_agences/);
    await expect(essayer("delete from public.liste_attente_agences where email = 'cachee@agence-exemple.test'")).rejects.toThrow(/permission denied for table liste_attente_agences/);
    await role('postgres');
    expect(await un<Ligne>("select statut, contactee_le from public.liste_attente_agences where email = 'cachee@agence-exemple.test'")).toEqual({ statut: 'en_attente', contactee_le: null });
  });

  it('super-administrateur au second facteur : lit, marque « contactée » puis « remet en attente » ; ne peut ni insérer, ni toucher une autre colonne, ni supprimer', async () => {
    await role('service_role');
    await inscrire({ email: 'suivie@agence-exemple.test' });
    await superAdmin('aal2');
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente_agences where email = 'suivie@agence-exemple.test'")).n).toBe(1);
    const marquee = await essayer("update public.liste_attente_agences set statut = 'contactee', contactee_le = now() where email = 'suivie@agence-exemple.test' returning statut, contactee_le is not null as datee");
    expect(marquee.rowCount).toBe(1);
    expect(marquee.rows[0]).toEqual({ statut: 'contactee', datee: true });
    const remise = await essayer("update public.liste_attente_agences set statut = 'en_attente', contactee_le = null where email = 'suivie@agence-exemple.test' returning statut, contactee_le");
    expect(remise.rows[0]).toEqual({ statut: 'en_attente', contactee_le: null });
    for (const statut of ['convertie', 'retiree']) expect((await essayer('update public.liste_attente_agences set statut = $1 where email = $2', [statut, 'suivie@agence-exemple.test'])).rowCount, statut).toBe(1);
    await expect(essayer("update public.liste_attente_agences set statut = 'inconnu' where email = 'suivie@agence-exemple.test'")).rejects.toThrow(refus('liste_attente_agences_statut_check'));
    await expect(inscrire({ email: 'par-le-dirigeant@agence-exemple.test' })).rejects.toThrow(/permission denied for table liste_attente_agences/);
    for (const colonne of ['email', 'agence', 'contact', 'telephone', 'code_postal', 'nb_lots', 'message', 'source', 'created_at'])
      await expect(essayer(`update public.liste_attente_agences set ${colonne} = null where email = 'suivie@agence-exemple.test'`), colonne).rejects.toThrow(/permission denied for table liste_attente_agences/);
    await expect(essayer("delete from public.liste_attente_agences where email = 'suivie@agence-exemple.test'")).rejects.toThrow(/permission denied for table liste_attente_agences/);
  });

  it('super-administrateur SANS second facteur (AAL1) : aucune ligne lue ni modifiée', async () => {
    await role('service_role');
    await inscrire({ email: 'aal1@agence-exemple.test' });
    await superAdmin('aal1');
    expect((await un<{ n: number }>('select count(*)::int as n from public.liste_attente_agences')).n).toBe(0);
    expect((await essayer("update public.liste_attente_agences set statut = 'contactee' where email = 'aal1@agence-exemple.test'")).rowCount).toBe(0);
  });

  it('e-mail trop long : 254 caractères passent, 255 sont refusés', async () => {
    await role('service_role');
    expect((await inscrire({ email: 'a'.repeat(234) + '@agence-exemple.test' })).rowCount).toBe(1); // 254 caractères
    await expect(inscrire({ email: 'b'.repeat(235) + '@agence-exemple.test' })).rejects.toThrow(refus('liste_attente_agences_email_borne')); // 255
  });

  it("e-mail mal formé : deux arobases, un blanc, une tabulation, pas d'arobase, domaine sans point, un caractère de contrôle", async () => {
    await role('service_role');
    for (const email of ['a@b@agence-exemple.test', 'avec espace@agence-exemple.test', 'tab\t@agence-exemple.test', 'sans-arobase.agence-exemple.test', 'sans-point@localhost'])
      await expect(inscrire({ email }), email).rejects.toThrow(/violates check constraint "liste_attente_agences_email_(borne|format)"/);
    await expect(inscrire({ email: `controle${car(1)}@agence-exemple.test` })).rejects.toThrow(refus('liste_attente_agences_email_borne'));
  });

  it("e-mail avec un blanc Unicode (U+00A0, U+1680, U+2003, U+200B, U+2028, U+202F, U+3000, U+FEFF) : refusé par la borne, que le format seul laisserait passer", async () => {
    await role('service_role');
    // [[:space:]] et \s ne couvrent que les blancs ASCII en C.UTF-8 : seule liste_attente_agences_email_borne arrête ces adresses.
    for (const code of [0x00a0, 0x1680, 0x2003, 0x200b, 0x2028, 0x202f, 0x3000, 0xfeff])
      await expect(inscrire({ email: `blanc${car(code)}@agence-exemple.test` }), `U+${code.toString(16)}`).rejects.toThrow(refus('liste_attente_agences_email_borne'));
    // Une lettre accentuée n'est pas un blanc : elle passe.
    expect((await inscrire({ email: 'éléonore@agence-exemple.test' })).rowCount).toBe(1);
  });

  it("doublon : la même adresse, à casse différente ou identique, est refusée (index unique sur lower(email), code 23505 — l'action serveur y répond par le message de succès)", async () => {
    await role('service_role');
    expect((await inscrire({ email: 'Doublon@Agence-Exemple.test' })).rowCount).toBe(1);
    for (const email of ['doublon@agence-exemple.test', 'DOUBLON@AGENCE-EXEMPLE.TEST', 'Doublon@Agence-Exemple.test']) {
      const erreur = await inscrire({ email, agence: 'Autre agence' }).then(() => null, (e: unknown) => e as { message: string; code?: string });
      expect(erreur?.code, email).toBe('23505');
      expect(erreur?.message, email).toMatch(/duplicate key value violates unique constraint "liste_attente_agences_email_lower_idx"/);
    }
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente_agences where lower(email) = 'doublon@agence-exemple.test'")).n).toBe(1);
  });

  it('agence et contact : 120 caractères passent, 121 sont refusés ; vides ou faits de blancs refusés ; les blancs comptent dans la longueur ; tout caractère de contrôle refusé, le saut de ligne compris', async () => {
    await role('service_role');
    expect((await inscrire({ email: 'bornes-ok@agence-exemple.test', agence: 'a'.repeat(120), contact: 'c'.repeat(120) })).rowCount).toBe(1);
    expect((await inscrire({ email: 'entoure@agence-exemple.test', agence: ' Agence ', contact: ' Camille ' })).rowCount).toBe(1);
    for (const [champ, contrainte] of [['agence', 'liste_attente_agences_agence_borne'], ['contact', 'liste_attente_agences_contact_borne']] as const) {
      for (const [nom, valeur] of [['121', 'x'.repeat(121)], ['vide', ''], ['blancs', '   '], ['blanc + 120', ' ' + 'x'.repeat(120)], ['saut de ligne', 'deux\nlignes'], ['tabulation', 'tab\tulation'], ['échappement', `fin${car(0x1b)}`], ['suppression', `fin${car(0x7f)}`]])
        await expect(inscrire({ email: `${champ}-${nom.replace(/\W/g, '')}@agence-exemple.test`, [champ]: valeur }), `${champ} : ${nom}`).rejects.toThrow(refus(contrainte));
    }
  });

  it('téléphone : absent admis ; 40 caractères passent, 41 refusés ; vide, blancs ou caractère de contrôle refusés', async () => {
    await role('service_role');
    expect((await inscrire({ email: 'tel-absent@agence-exemple.test', telephone: null })).rowCount).toBe(1);
    expect((await inscrire({ email: 'tel-40@agence-exemple.test', telephone: '+'.padEnd(40, '0') })).rowCount).toBe(1);
    for (const [nom, telephone] of [['41', '0'.repeat(41)], ['vide', ''], ['blancs', '  '], ['saut de ligne', '01\n02'], ['contrôle', `01${car(1)}`]])
      await expect(inscrire({ email: `tel-${nom.replace(/\W/g, '')}@agence-exemple.test`, telephone }), nom).rejects.toThrow(refus('liste_attente_agences_telephone_borne'));
  });

  it('code postal : cinq chiffres exactement (7501, 750010, 7500A, 75 001, vide refusés)', async () => {
    await role('service_role');
    for (const code_postal of ['75001', '01000', '97400']) expect((await inscrire({ email: `cp-${code_postal}@agence-exemple.test`, code_postal })).rowCount, code_postal).toBe(1);
    for (const [nom, code_postal] of [['7501', '7501'], ['750010', '750010'], ['7500A', '7500A'], ['75 001', '75 001'], ['vide', '']])
      await expect(inscrire({ email: `cp-${nom.replace(/\W/g, '')}@agence-exemple.test`, code_postal }), nom).rejects.toThrow(refus('liste_attente_agences_code_postal_format'));
  });

  it("nb_lots : les quatre tranches passent, rien d'autre", async () => {
    await role('service_role');
    for (const nb_lots of TRANCHES) expect((await inscrire({ email: `lots-${nb_lots}@agence-exemple.test`, nb_lots })).rowCount, nb_lots).toBe(1);
    for (const [nom, nb_lots] of [['inconnu', 'inconnu'], ['vide', ''], ['libellé', 'De 50 à 199 lots'], ['casse', 'MOINS_DE_50']])
      await expect(inscrire({ email: `lots-${nom.replace(/\W/g, '')}@agence-exemple.test`, nb_lots }), nom).rejects.toThrow(refus('liste_attente_agences_nb_lots_check'));
  });

  it('message : absent admis ; 1000 caractères passent, 1001 refusés ; le saut de ligne est ADMIS ; vide ou blancs seuls (sauts de ligne compris) refusés ; tout autre caractère de contrôle refusé', async () => {
    await role('service_role');
    expect((await inscrire({ email: 'msg-absent@agence-exemple.test', message: null })).rowCount).toBe(1);
    expect((await inscrire({ email: 'msg-1000@agence-exemple.test', message: 'm'.repeat(1000) })).rowCount).toBe(1);
    expect((await inscrire({ email: 'msg-lignes@agence-exemple.test', message: 'Première ligne.\n\nTroisième ligne, après une ligne vide.\n' })).rowCount).toBe(1);
    for (const [nom, message] of [['1001', 'm'.repeat(1001)], ['vide', ''], ['blancs', '   '], ['sauts seuls', '\n \n'], ['tabulation', 'avec\ttabulation'], ['retour chariot', 'avec\rretour'], ['contrôle 1', `avec${car(1)}`], ['contrôle 1F', `avec${car(0x1f)}`], ['suppression', `avec${car(0x7f)}`]])
      await expect(inscrire({ email: `msg-${nom.replace(/\W/g, '')}@agence-exemple.test`, message }), nom).rejects.toThrow(refus('liste_attente_agences_message_borne'));
  });

  it('source : absente admise ; 80 caractères passent, 81 refusés ; vide, blancs ou caractère de contrôle refusés', async () => {
    await role('service_role');
    expect((await inscrire({ email: 'src-absente@agence-exemple.test', source: null })).rowCount).toBe(1);
    expect((await inscrire({ email: 'src-80@agence-exemple.test', source: '/'.padEnd(80, 'a') })).rowCount).toBe(1);
    for (const [nom, source] of [['81', 's'.repeat(81)], ['vide', ''], ['blancs', ' \t '], ['contrôle', `/agences${car(0x1b)}`]])
      await expect(inscrire({ email: `src-${nom.replace(/\W/g, '')}@agence-exemple.test`, source }), nom).rejects.toThrow(refus('liste_attente_agences_source_borne'));
  });

  it("statut : en_attente par défaut ; les quatre états passent, un état inconnu est refusé", async () => {
    await role('service_role');
    for (const statut of STATUTS) expect((await essayer("insert into public.liste_attente_agences (email, agence, contact, code_postal, nb_lots, statut) values ($1, 'Agence', 'Contact', '75001', 'moins_de_50', $2)", [`statut-${statut}@agence-exemple.test`, statut])).rowCount, statut).toBe(1);
    await expect(essayer("insert into public.liste_attente_agences (email, agence, contact, code_postal, nb_lots, statut) values ('statut-inconnu@agence-exemple.test', 'Agence', 'Contact', '75001', 'moins_de_50', 'inconnu')")).rejects.toThrow(refus('liste_attente_agences_statut_check'));
  });

  it(`plafond tenu par la base : ${PLAFOND} inscriptions dans l'heure passent, la suivante reçoit le message exact (P0001), rien n'est écrit de plus ; la fenêtre glisse`, async () => {
    await role('postgres');
    const { n: deja } = await un<{ n: number }>("select count(*)::int as n from public.liste_attente_agences where created_at > now() - interval '1 hour'");
    await role('service_role');
    for (let i = deja; i < PLAFOND; i++) expect((await inscrire({ email: `crue-${i}@agence-exemple.test`, source: 'robot' })).rowCount, `inscription n° ${i + 1}`).toBe(1);
    const refuse = await inscrire({ email: `crue-${PLAFOND}@agence-exemple.test`, source: 'robot' }).then(() => null, (e: unknown) => e as { message: string; code?: string });
    expect(refuse?.message).toBe(REFUS_PLAFOND);
    expect(refuse?.code).toBe('P0001');
    // Le plafond est global : une autre adresse est refusée de la même façon, même par la clé de service.
    await expect(inscrire({ email: 'autre-robot@agence-exemple.test', source: 'robot' })).rejects.toThrow(REFUS_PLAFOND);
    await role('postgres');
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente_agences where created_at > now() - interval '1 hour'")).n).toBe(PLAFOND);
    // Une inscription vieille d'une heure et une minute ne compte plus : la fenêtre glisse.
    // La première inscription CRÉÉE PAR CE CAS, pas un nom fixe : la table peut déjà porter des lignes de l'heure.
    expect((await db.query("update public.liste_attente_agences set created_at = now() - interval '61 minutes' where email = $1", [`crue-${deja}@agence-exemple.test`])).rowCount).toBe(1);
    await role('service_role');
    expect((await inscrire({ email: 'apres-la-crue@agence-exemple.test' })).rowCount).toBe(1);
  });

  it('catalogue : colonnes, onze contraintes validées, index, deux politiques super-admin, déclencheurs, fonction du plafond, commentaire, RLS et droits', async () => {
    const e = await empreinte();
    expect(e.colonnes.map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default])).toEqual([
      ['id', 'uuid', 'NO', 'gen_random_uuid()'],
      ['email', 'text', 'NO', null],
      ['agence', 'text', 'NO', null],
      ['contact', 'text', 'NO', null],
      ['telephone', 'text', 'YES', null],
      ['code_postal', 'text', 'NO', null],
      ['nb_lots', 'text', 'NO', null],
      ['message', 'text', 'YES', null],
      ['source', 'text', 'YES', null],
      ['statut', 'text', 'NO', "'en_attente'::text"],
      ['contactee_le', 'timestamp with time zone', 'YES', null],
      ['created_at', 'timestamp with time zone', 'NO', 'now()'],
    ]);
    expect(e.contraintes.map((c) => c.conname)).toEqual([
      'liste_attente_agences_agence_borne', 'liste_attente_agences_code_postal_format', 'liste_attente_agences_contact_borne',
      'liste_attente_agences_email_borne', 'liste_attente_agences_email_format', 'liste_attente_agences_message_borne',
      'liste_attente_agences_nb_lots_check', 'liste_attente_agences_pkey', 'liste_attente_agences_source_borne',
      'liste_attente_agences_statut_check', 'liste_attente_agences_telephone_borne',
    ]);
    expect(e.contraintes.every((c) => c.convalidated === true)).toBe(true);
    expect(e.index.map((i) => i.indexname)).toEqual(['liste_attente_agences_email_lower_idx', 'liste_attente_agences_pkey', 'liste_attente_agences_recent_idx']);
    expect(e.index.find((i) => i.indexname === 'liste_attente_agences_email_lower_idx')?.indexdef).toBe('CREATE UNIQUE INDEX liste_attente_agences_email_lower_idx ON public.liste_attente_agences USING btree (lower(email))');
    expect(e.index.find((i) => i.indexname === 'liste_attente_agences_recent_idx')?.indexdef).toBe('CREATE INDEX liste_attente_agences_recent_idx ON public.liste_attente_agences USING btree (created_at DESC)');
    const superAdminSeul = '( SELECT is_super_admin() AS is_super_admin)';
    expect(e.politiques).toEqual([
      { policyname: 'liste_attente_agences_select_sa', permissive: 'PERMISSIVE', roles: '{authenticated}', cmd: 'SELECT', qual: superAdminSeul, with_check: null },
      { policyname: 'liste_attente_agences_update_sa', permissive: 'PERMISSIVE', roles: '{authenticated}', cmd: 'UPDATE', qual: superAdminSeul, with_check: superAdminSeul },
    ]);
    expect(e.declencheurs.map((d) => d.tgname)).toEqual(['diagnostic_artisan_lecture', 'liste_attente_agences_limiter']);
    expect(e.declencheurs[0].def).toBe('CREATE TRIGGER diagnostic_artisan_lecture BEFORE INSERT OR DELETE OR UPDATE ON public.liste_attente_agences FOR EACH ROW EXECUTE FUNCTION refuser_mutation_diagnostic_artisan()');
    expect(e.declencheurs[1].def).toBe('CREATE TRIGGER liste_attente_agences_limiter BEFORE INSERT ON public.liste_attente_agences FOR EACH ROW EXECUTE FUNCTION liste_attente_agences_limiter()');
    expect(e.fonctions).toHaveLength(1);
    // security definer, search_path vide (proconfig = {"search_path=\"\""}), exécutable par le propriétaire et service_role seulement.
    expect(e.fonctions[0]).toMatchObject({ signature: 'liste_attente_agences_limiter()', prosecdef: true, config: '{"search_path=\\"\\""}' });
    expect(e.fonctions[0].droits).not.toMatch(/anon|authenticated|^\{=/);
    expect(e.classe[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: false, commentaire: COMMENTAIRE });
    const d = await un<Record<string, boolean>>(`select
      has_any_column_privilege('anon', 'public.liste_attente_agences', 'SELECT, INSERT, UPDATE, REFERENCES') as anon_colonnes,
      has_table_privilege('anon', 'public.liste_attente_agences', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as anon_table,
      has_table_privilege('authenticated', 'public.liste_attente_agences', 'SELECT') as auth_select,
      has_any_column_privilege('authenticated', 'public.liste_attente_agences', 'INSERT') as auth_insert,
      has_any_column_privilege('authenticated', 'public.liste_attente_agences', 'REFERENCES') as auth_references,
      has_table_privilege('authenticated', 'public.liste_attente_agences', 'UPDATE') as auth_update_table,
      has_column_privilege('authenticated', 'public.liste_attente_agences', 'statut', 'UPDATE') as auth_update_statut,
      has_column_privilege('authenticated', 'public.liste_attente_agences', 'contactee_le', 'UPDATE') as auth_update_contactee_le,
      has_column_privilege('authenticated', 'public.liste_attente_agences', 'email', 'UPDATE') as auth_update_email,
      has_column_privilege('authenticated', 'public.liste_attente_agences', 'message', 'UPDATE') as auth_update_message,
      has_table_privilege('authenticated', 'public.liste_attente_agences', 'INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER') as auth_autres,
      has_table_privilege('service_role', 'public.liste_attente_agences', 'SELECT') and has_table_privilege('service_role', 'public.liste_attente_agences', 'INSERT')
        and has_table_privilege('service_role', 'public.liste_attente_agences', 'UPDATE') and has_table_privilege('service_role', 'public.liste_attente_agences', 'DELETE') as service,
      has_function_privilege('anon', 'public.liste_attente_agences_limiter()', 'EXECUTE') as anon_limiter,
      has_function_privilege('authenticated', 'public.liste_attente_agences_limiter()', 'EXECUTE') as auth_limiter`);
    expect(d).toEqual({ anon_colonnes: false, anon_table: false, auth_select: true, auth_insert: false, auth_references: false, auth_update_table: false, auth_update_statut: true, auth_update_contactee_le: true, auth_update_email: false, auth_update_message: false, auth_autres: false, service: true, anon_limiter: false, auth_limiter: false });
    // Les colonnes que authenticated peut modifier, nommément : statut et contactee_le, rien d'autre.
    expect((await lignes("select attname from pg_attribute a where a.attrelid = 'public.liste_attente_agences'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE') order by attname")).map((r) => r.attname)).toEqual(['contactee_le', 'statut']);
  });

  it("invariants du dépôt tenus avec la nouvelle table : anon n'écrit nulle part (hors l'exception nommée liste_attente/INSERT), aucun TRUNCATE client, RLS active avec politique", async () => {
    // Mêmes requêtes que socle, durcissement, devis-vitrine (écritures d'anon, table ET colonnes) et truncate-clients.
    const restes = await lignes(`select c.relname || '/' || p.priv as reste
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         cross join lateral (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as p(priv)
        where n.nspname = 'public' and c.relkind in ('r','p')
          and (has_table_privilege('anon', c.oid, p.priv)
               or (p.priv in ('INSERT','UPDATE','REFERENCES') and has_any_column_privilege('anon', c.oid, p.priv)))
        order by 1`);
    expect(restes).toEqual([{ reste: 'liste_attente/INSERT' }]);
    expect(await lignes("select r.nom from (values ('anon'),('authenticated')) r(nom) where has_table_privilege(r.nom, 'public.liste_attente_agences', 'TRUNCATE')")).toEqual([]);
    expect(await un<Ligne>("select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = 'liste_attente_agences') as politiques from pg_class c where c.oid = 'public.liste_attente_agences'::regclass")).toEqual({ rls: true, politiques: 2 });
  });

  it('la migration est rejouable : deux applications de plus laissent une empreinte identique (fonction et déclencheurs compris), et les bornes tiennent toujours', async () => {
    const avant = await empreinte();
    await db.query(sansFermeture(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    await db.query(sansFermeture(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    await role('service_role');
    await expect(inscrire({ email: 'rejeu@agence-exemple.test', code_postal: '7501' })).rejects.toThrow(refus('liste_attente_agences_code_postal_format'));
  });

  it("le bloc de contrôle s'arrête si une borne CHECK manque ou n'est pas validée : une table homonyme préexistante à définition divergente ne passe pas (`create table if not exists` ne la reposerait pas)", async () => {
    await role('postgres');
    await db.query('alter table public.liste_attente_agences drop constraint liste_attente_agences_code_postal_format');
    await expect(essayer(sansFermeture(MIGRATION))).rejects.toThrow(/^liste_attente_agences : dix contraintes CHECK validées attendues$/);
    // Reposée mais non validée : refusée aussi ; validée : la migration passe de nouveau et les dix bornes sont là.
    await db.query("alter table public.liste_attente_agences add constraint liste_attente_agences_code_postal_format check (code_postal ~ '^[0-9]{5}$') not valid");
    await expect(essayer(sansFermeture(MIGRATION))).rejects.toThrow(/^liste_attente_agences : dix contraintes CHECK validées attendues$/);
    await db.query('alter table public.liste_attente_agences validate constraint liste_attente_agences_code_postal_format');
    await db.query(sansFermeture(MIGRATION));
    expect((await lignes("select conname from pg_constraint where conrelid = 'public.liste_attente_agences'::regclass and contype = 'c' and convalidated"))).toHaveLength(10);
  });

  it("le retour REFUSE, sans rien modifier, tant que la table contient une inscription : message exact (P0001), empreinte, ligne et historique intacts", async () => {
    await role('service_role');
    await inscrire({ email: 'inscrite@agence-exemple.test' });
    await role('postgres');
    const avant = await empreinte();
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key)');
    await db.query("insert into supabase_migrations.schema_migrations(version) values ($1), ('test_liste_attente_agences_voisine') on conflict do nothing", [VERSION]);
    const erreur = await essayer(RETOUR).then(() => null, (e: unknown) => e as { message: string; code?: string });
    expect(erreur?.code).toBe('P0001');
    expect(erreur?.message).toMatch(REFUS_RETOUR);
    expect(erreur?.message).toContain('contient 1 inscription(s)');
    expect(await empreinte()).toEqual(avant);
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente_agences where email = 'inscrite@agence-exemple.test'")).n).toBe(1);
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ($1, 'test_liste_attente_agences_voisine') order by 1", [VERSION])).rows.map((r) => r.version)).toEqual([VERSION, 'test_liste_attente_agences_voisine']);
  });

  it('le retour, table vide, retire déclencheurs, fonction, table et sa version (la voisine reste) ; rejoué sans effet ; la migration ré-appliquée redonne la même empreinte', async () => {
    await role('postgres');
    await db.query('delete from public.liste_attente_agences');
    const avant = await empreinte();
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key)');
    await db.query("insert into supabase_migrations.schema_migrations(version) values ($1), ('test_liste_attente_agences_voisine') on conflict do nothing", [VERSION]);
    await db.query(RETOUR);
    const apres = await empreinte();
    expect(apres).toEqual({ colonnes: [], contraintes: [], index: [], politiques: [], classe: [], colonnesDroits: [], declencheurs: [], fonctions: [] });
    expect(await un<Ligne>("select to_regclass('public.liste_attente_agences')::text as table, to_regprocedure('public.liste_attente_agences_limiter()')::text as fonction")).toEqual({ table: null, fonction: null });
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ($1, 'test_liste_attente_agences_voisine') order by 1", [VERSION])).rows).toEqual([{ version: 'test_liste_attente_agences_voisine' }]);
    // Les autres objets du dépôt ne bougent pas : la fonction de diagnostic et la liste d'attente du 29/09 restent.
    expect(await un<Ligne>("select to_regprocedure('public.refuser_mutation_diagnostic_artisan()') is not null as diagnostic, to_regclass('public.liste_attente') is not null as liste_attente")).toEqual({ diagnostic: true, liste_attente: true });
    await db.query(RETOUR); // Un second retour est sans effet.
    expect(await empreinte()).toEqual(apres);
    await db.query(sansFermeture(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    await role('service_role');
    expect((await inscrire({ email: 'reapparue@agence-exemple.test' })).rowCount).toBe(1);
  });
});
