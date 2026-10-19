/**
 * Lot M2 (audit du 19/10/2026) — la table public.liste_attente, créée HORS DÉPÔT le 29/09/2026 (version 20260929200141 dans
 * l'historique de production, sans fichier au dépôt), entre au dépôt et se borne : 20261019120000_liste_attente_bornee.sql.
 *
 * Sur une vraie base (SUPABASE_DB_URL, transaction annulée) :
 *  · `anon` (la clé publiable du site) inscrit une adresse valide, avec biens et source — et rien d'autre : ni id, ni
 *    created_at, ni lecture, ni modification, ni suppression ; `authenticated` n'a aucun droit ; `service_role` lit et écrit ;
 *  · une adresse de plus de 254 caractères, deux arobases, un blanc ASCII ou Unicode (espace insécable, largeur nulle, marque
 *    d'ordre des octets) ou un caractère de contrôle, un champ biens de plus de 120 caractères ou vide une fois les blancs
 *    retirés, une source de plus de 80 caractères, vide ou avec un caractère de contrôle sont refusés par la base ;
 *  · le doublon à casse différente est refusé (index unique sur lower(email)) ;
 *  · le plafond d'insertion tenu par la base (modèle demandes_devis_limiter) : 30 inscriptions par heure glissante passent,
 *    la 31e reçoit le message exact ;
 *  · le catalogue est celui attendu (contraintes, index, politique unique conservée, déclencheurs, fonction du plafond,
 *    commentaire, droits), et liste_attente est la SEULE table de public où anon détient une écriture — par colonne, INSERT
 *    seulement ;
 *  · la migration est rejouable (même empreinte, fonction et déclencheurs compris) ; son retour retire exactement ce qu'elle a
 *    ajouté, conserve la table et ses lignes, retire sa version d'historique et laisse la voisine ; la migration ré-appliquée
 *    redonne la même empreinte.
 *
 * Trois bases possibles : préparée par le manifeste (la table est née bornée) ; plus ancienne, sans la table (la migration
 * s'applique dans la transaction) ; à l'état de production du 29/09 (table présente, non bornée) — rien n'est appliqué, et
 * les cas de borne et de plafond sont alors rouges : c'est la preuve que la migration est nécessaire.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transactionsInterdites } from '../scripts/verifier-transactions-migration.mjs';
import { verifierBaseDeTest } from './garde-base';
config({ path: '.env.local' }); const url = process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);

const NOM = '20261019120000_liste_attente_bornee';
const MIGRATION = readFileSync(`supabase/migrations/${NOM}.sql`, 'utf8');
const RETOUR = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, 'utf8');
const COMMENTAIRE = "Liste d'attente du site vitrine (créée hors dépôt le 29/09/2026, intégrée et bornée le 19/10/2026)";
const REFUS_PLAFOND = "Le formulaire reçoit beaucoup d'inscriptions en ce moment : réessayez dans une heure.";
const PLAFOND = 30;
/** La fermeture générale des fonctions est testée ailleurs ; la rejouer dans la transaction d'un essai verrouillerait les autres lots. */
const sansFermeture = (sql: string) => sql.replace(/^select public\.fermer_fonctions_a_anon\(\);$/gm, '');

describe('lot M2 — liste_attente : les fichiers du lot (sans base)', () => {
  it('la migration est rejouable sans transaction interne, ne cite pas le jour de Paris et ferme les fonctions à anon en fin', () => {
    expect(transactionsInterdites(MIGRATION)).toEqual([]);
    expect(MIGRATION).not.toContain('aujourdhui_paris');
    expect(MIGRATION).toContain('create table if not exists public.liste_attente');
    expect(MIGRATION.trimEnd().endsWith('select public.fermer_fonctions_a_anon();')).toBe(true);
  });

  it("le plafond d'insertion suit le modèle de demandes_devis_limiter : security definer, search_path vide, verrou, droits retirés, message exact", () => {
    expect(MIGRATION).toContain('create or replace function public.liste_attente_limiter()');
    expect(MIGRATION).toMatch(/liste_attente_limiter\(\)\s+returns trigger\s+language plpgsql\s+security definer\s+set search_path = ''/);
    expect(MIGRATION).toContain("pg_advisory_xact_lock(hashtext('public.liste_attente'))");
    expect(MIGRATION).toContain(`if v_total >= ${PLAFOND} then`);
    expect(MIGRATION).toContain(`raise exception '${REFUS_PLAFOND.replace("'", "''")}'`);
    expect(MIGRATION).toContain("using errcode = 'P0001'");
    expect(MIGRATION).toContain('revoke execute on function public.liste_attente_limiter() from public, anon, authenticated;');
    expect(MIGRATION).toMatch(/create trigger liste_attente_limiter\s+before insert on public\.liste_attente\s+for each row execute function public\.liste_attente_limiter\(\);/);
    expect(MIGRATION).toContain('create index if not exists liste_attente_recent_idx on public.liste_attente (created_at desc);');
    // La vérification préalable (table vide, aucun doublon de casse) est écrite en en-tête : les CHECK sont validés à la pose.
    expect(MIGRATION).toContain('select count(*) from public.liste_attente ;');
    expect(MIGRATION).toContain('select lower(email), count(*) from public.liste_attente group by 1 having count(*) > 1 ;');
    expect(MIGRATION).not.toMatch(/\)\s*not valid\s*;/i); // aucune contrainte posée « not valid » (l'en-tête, lui, explique ce choix)
  });

  it('le retour se joue dans une transaction externe, ne supprime ni la table ni ses lignes, retire le plafond et ne retire que sa version', () => {
    expect(RETOUR).toMatch(/^-- RETOUR ARRIÈRE de /);
    expect(transactionsInterdites(RETOUR)).toEqual([]);
    expect(RETOUR).not.toMatch(/drop table|truncate|delete from public\./i);
    expect(RETOUR).toContain('drop trigger liste_attente_limiter on public.liste_attente;');
    expect(RETOUR).toContain('drop function public.liste_attente_limiter();');
    expect(RETOUR).toContain('drop index public.liste_attente_recent_idx;');
    expect(RETOUR).toContain("where version = '20261019120000'");
    expect(RETOUR).not.toContain('aujourdhui_paris');
  });

  it('manifeste (une fois, après 20261018231827), LISEZ-MOI (ligne du tableau) et chaîne « Ordre complet » (avant 20261018231827)', () => {
    const manifeste = readFileSync('e2e/local/ordre-migrations.txt', 'utf8').trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf('20261018231827_abonnement_jour_paris.sql'));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const lisezMoi = readFileSync('supabase/retours-arriere/LISEZ-MOI.md', 'utf8');
    expect(lisezMoi).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lisezMoi).toContain('`liste_attente_limiter`');
    const chaine = lisezMoi.match(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/)?.[1] ?? '';
    const codes = [...chaine.matchAll(/`(\d{14}|\d{6})`/g)].map((m) => m[1]);
    expect(codes.indexOf('20261019120000')).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf('20261019120000')).toBeLessThan(codes.indexOf('20261018231827'));
  });
});

type Ligne = Record<string, unknown>;

describe.skipIf(!url)('lot M2 — public.liste_attente bornée (base)', () => {
  let db: Client;
  async function role(r: 'anon' | 'authenticated' | 'service_role' | 'postgres') {
    await db.query('reset role');
    if (r === 'postgres') return;
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(r === 'authenticated' ? { sub: randomUUID(), role: r } : { role: r })]);
    await db.query(`set local role ${r}`);
  }
  async function essayer(sql: string, args: unknown[] = []) {
    await db.query('savepoint essai');
    try { const r = await db.query(sql, args); await db.query('release savepoint essai'); return r; }
    catch (e) { await db.query('rollback to savepoint essai'); throw e; }
  }
  const inscrire = (email: string, biens: string | null = '2 lots', source: string | null = 'site vitrine') =>
    essayer('insert into public.liste_attente (email, biens, source) values ($1, $2, $3)', [email, biens, source]);
  const lignes = async (sql: string): Promise<Ligne[]> => (await db.query(sql)).rows;
  const un = async <T extends Ligne>(sql: string): Promise<T> => (await db.query(sql)).rows[0] as T;

  /** Tout ce que la migration et son retour peuvent changer sur la table — fonction du plafond et déclencheurs compris. */
  async function empreinte() {
    return {
      colonnes: await lignes("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'liste_attente' order by ordinal_position"),
      contraintes: await lignes("select conname, pg_get_constraintdef(oid) as def, convalidated from pg_constraint where conrelid = 'public.liste_attente'::regclass order by conname"),
      index: await lignes("select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'liste_attente' order by indexname"),
      politiques: await lignes("select policyname, permissive, roles::text as roles, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'liste_attente' order by policyname"),
      classe: await lignes("select relrowsecurity, relforcerowsecurity, relacl::text as droits, obj_description(oid, 'pg_class') as commentaire from pg_class where oid = 'public.liste_attente'::regclass"),
      colonnesDroits: await lignes("select attname, attacl::text as droits from pg_attribute where attrelid = 'public.liste_attente'::regclass and attnum > 0 and not attisdropped order by attnum"),
      declencheurs: await lignes("select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'public.liste_attente'::regclass and not tgisinternal order by tgname"),
      // Zéro ligne quand la fonction est absente (avant la migration, après le retour).
      fonctions: await lignes("select oid::regprocedure::text as signature, md5(pg_get_functiondef(oid)) as definition, proacl::text as droits, prosecdef, proconfig::text as config from pg_proc where oid = to_regprocedure('public.liste_attente_limiter()')"),
    };
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query('begin');
    // Base préparée par le manifeste : la table est là, bornée. Base plus ancienne, sans la table : la migration s'applique dans
    // la transaction. Base à l'état de production du 29/09 (table présente, non bornée) : rien n'est appliqué — cas rouge voulu.
    if (!(await un<{ t: string | null }>("select to_regclass('public.liste_attente')::text as t")).t) await db.query(sansFermeture(MIGRATION));
  });
  afterAll(async () => { await db?.query('rollback'); await db?.end(); });
  beforeEach(async () => { await db.query('reset role'); await db.query('savepoint cas'); });
  afterEach(async () => { await db.query('rollback to savepoint cas'); });

  it('anon (la clé publiable du site) inscrit une adresse valide, avec biens et source : une ligne, horodatée par la base', async () => {
    await role('anon');
    expect((await inscrire('Inscrit@Exemple.test', '3 lots', 'page attente')).rowCount).toBe(1);
    expect((await inscrire('seule-adresse@exemple.test', null, null)).rowCount).toBe(1);
    await role('postgres');
    const l = await un<Ligne>("select email, biens, source, created_at > now() - interval '1 minute' as recente, id is not null as id_present from public.liste_attente where email = 'Inscrit@Exemple.test'");
    expect(l).toEqual({ email: 'Inscrit@Exemple.test', biens: '3 lots', source: 'page attente', recente: true, id_present: true });
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente where email like '%@exemple.test' or email like '%@Exemple.test'")).n).toBe(2);
  });

  it("anon ne fournit ni id ni created_at, et n'obtient rien en retour (returning exige la lecture)", async () => {
    await role('anon');
    await expect(essayer("insert into public.liste_attente (id, email) values (gen_random_uuid(), 'id@exemple.test')")).rejects.toThrow(/permission denied for table liste_attente/);
    await expect(essayer("insert into public.liste_attente (email, created_at) values ('date@exemple.test', now() - interval '1 day')")).rejects.toThrow(/permission denied for table liste_attente/);
    await expect(essayer("insert into public.liste_attente (email) values ('retour@exemple.test') returning id")).rejects.toThrow(/permission denied for table liste_attente/);
  });

  it('e-mail trop long : 254 caractères passent, 255 sont refusés', async () => {
    await role('anon');
    expect((await inscrire('a'.repeat(241) + '@exemple.test')).rowCount).toBe(1); // 254 caractères
    await expect(inscrire('b'.repeat(242) + '@exemple.test')).rejects.toThrow(/violates check constraint "liste_attente_email_borne"/); // 255
  });

  it("e-mail mal formé : deux arobases, un blanc, une tabulation, pas d'arobase, un caractère de contrôle", async () => {
    await role('anon');
    for (const email of ['a@b@exemple.test', 'avec espace@exemple.test', 'tab\t@exemple.test', 'sans-arobase.exemple.test'])
      await expect(inscrire(email), email).rejects.toThrow(/violates check constraint "liste_attente_email_(borne|format)"/);
    // Un caractère de contrôle qui n'est pas un blanc n'est arrêté que par la borne nouvelle (le format d'origine le laissait passer).
    await expect(inscrire('controle\u0001@exemple.test')).rejects.toThrow(/violates check constraint "liste_attente_email_borne"/);
  });

  it("e-mail avec un blanc Unicode (espace insécable U+00A0, largeur nulle U+200B, espace idéographique U+3000, marque d'ordre des octets U+FEFF) : refusé par la borne nouvelle, que le format d'origine laissait passer", async () => {
    await role('anon');
    // [[:space:]] et \s ne couvrent que les blancs ASCII en C.UTF-8 : seule liste_attente_email_borne arrête ces adresses.
    for (const [nom, email] of [
      ['U+00A0', 'insecable @exemple.test'],
      ['U+200B', 'largeur​nulle@exemple.test'],
      ['U+2003', 'cadratin @exemple.test'],
      ['U+3000', 'ideographique　@exemple.test'],
      ['U+FEFF', '﻿bom@exemple.test'],
    ] as const)
      await expect(inscrire(email), nom).rejects.toThrow(/violates check constraint "liste_attente_email_borne"/);
    // Une lettre accentuée n'est pas un blanc : elle passe.
    expect((await inscrire('éléonore@exemple.test')).rowCount).toBe(1);
  });

  it('doublon : la même adresse, à casse différente ou identique, est refusée (index unique sur lower(email))', async () => {
    await role('anon');
    expect((await inscrire('Doublon@Exemple.test')).rowCount).toBe(1);
    await expect(inscrire('doublon@exemple.test')).rejects.toThrow(/duplicate key value violates unique constraint "liste_attente_email_lower_idx"/);
    await expect(inscrire('DOUBLON@EXEMPLE.TEST')).rejects.toThrow(/duplicate key value violates unique constraint "liste_attente_email_lower_idx"/);
    await expect(inscrire('Doublon@Exemple.test')).rejects.toThrow(/duplicate key value violates unique constraint "liste_attente_email_(key|lower_idx)"/);
    await role('postgres');
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente where lower(email) = 'doublon@exemple.test'")).n).toBe(1);
  });

  it('biens ≤ 120 et source ≤ 80 caractères, sans caractère de contrôle', async () => {
    await role('anon');
    expect((await inscrire('bornes-ok@exemple.test', 'b'.repeat(120), 's'.repeat(80))).rowCount).toBe(1);
    await expect(inscrire('biens-long@exemple.test', 'b'.repeat(121), 'site')).rejects.toThrow(/violates check constraint "liste_attente_biens_borne"/);
    await expect(inscrire('biens-controle@exemple.test', 'deux\nlignes', 'site')).rejects.toThrow(/violates check constraint "liste_attente_biens_borne"/);
    await expect(inscrire('source-longue@exemple.test', '2 lots', 's'.repeat(81))).rejects.toThrow(/violates check constraint "liste_attente_source_borne"/);
    await expect(inscrire('source-controle@exemple.test', '2 lots', 'site\u001b')).rejects.toThrow(/violates check constraint "liste_attente_source_borne"/);
  });

  it("biens et source vides, ou faits de blancs seulement, sont refusés (length(btrim(…)) between 1 and …) ; l'absence reste null", async () => {
    await role('anon');
    await expect(inscrire('biens-vide@exemple.test', '', 'site')).rejects.toThrow(/violates check constraint "liste_attente_biens_borne"/);
    await expect(inscrire('biens-blancs@exemple.test', '   ', 'site')).rejects.toThrow(/violates check constraint "liste_attente_biens_borne"/);
    await expect(inscrire('source-vide@exemple.test', '2 lots', '')).rejects.toThrow(/violates check constraint "liste_attente_source_borne"/);
    await expect(inscrire('source-blancs@exemple.test', '2 lots', ' \t ')).rejects.toThrow(/violates check constraint "liste_attente_source_borne"/);
    // Les blancs qui entourent une valeur réelle ne la disqualifient pas, mais comptent dans la longueur totale.
    expect((await inscrire('biens-entoure@exemple.test', ' 2 lots ', ' site ')).rowCount).toBe(1);
    await expect(inscrire('biens-entoure-long@exemple.test', ' ' + 'b'.repeat(120), 'site')).rejects.toThrow(/violates check constraint "liste_attente_biens_borne"/);
    expect((await inscrire('sans-rien@exemple.test', null, null)).rowCount).toBe(1);
  });

  it(`plafond tenu par la base : ${PLAFOND} inscriptions dans l'heure passent, la suivante reçoit le message exact (P0001), rien n'est écrit de plus`, async () => {
    await role('postgres');
    const { n: deja } = await un<{ n: number }>("select count(*)::int as n from public.liste_attente where created_at > now() - interval '1 hour'");
    await role('anon');
    for (let i = deja; i < PLAFOND; i++) expect((await inscrire(`crue-${i}@exemple.test`, null, 'robot')).rowCount, `inscription n° ${i + 1}`).toBe(1);
    const refus = await inscrire(`crue-${PLAFOND}@exemple.test`, null, 'robot').then(() => null, (e: unknown) => e as { message: string; code?: string });
    expect(refus?.message).toBe(REFUS_PLAFOND);
    expect(refus?.code).toBe('P0001');
    // Le refus vaut pour toute adresse, le plafond est global : une autre adresse est refusée de la même façon.
    await expect(inscrire('autre-robot@exemple.test', null, 'robot')).rejects.toThrow(REFUS_PLAFOND);
    await role('postgres');
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente where created_at > now() - interval '1 hour'")).n).toBe(PLAFOND);
    // Une inscription vieille d'une heure et une minute ne compte plus : la fenêtre glisse.
    await db.query("update public.liste_attente set created_at = now() - interval '61 minutes' where email = 'crue-0@exemple.test'");
    await role('anon');
    expect((await inscrire('apres-la-crue@exemple.test', null, 'site')).rowCount).toBe(1);
  });

  it('anon ne lit, ne modifie ni ne supprime rien', async () => {
    await role('service_role');
    await inscrire('lue@exemple.test');
    await role('anon');
    await expect(essayer('select count(*) from public.liste_attente')).rejects.toThrow(/permission denied for table liste_attente/);
    await expect(essayer("select email from public.liste_attente where email = 'lue@exemple.test'")).rejects.toThrow(/permission denied for table liste_attente/);
    await expect(essayer("update public.liste_attente set biens = 'x' where email = 'lue@exemple.test'")).rejects.toThrow(/permission denied for table liste_attente/);
    await expect(essayer("delete from public.liste_attente where email = 'lue@exemple.test'")).rejects.toThrow(/permission denied for table liste_attente/);
  });

  it("authenticated (un compte connecté) n'a aucun droit : ni insertion, ni lecture", async () => {
    await role('authenticated');
    await expect(inscrire('connecte@exemple.test')).rejects.toThrow(/permission denied for table liste_attente/);
    await expect(essayer('select count(*) from public.liste_attente')).rejects.toThrow(/permission denied for table liste_attente/);
  });

  it('service_role (la clé de service, le tableau de bord) écrit et lit', async () => {
    await role('service_role');
    expect((await inscrire('service@exemple.test')).rowCount).toBe(1);
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente where email = 'service@exemple.test'")).n).toBe(1);
  });

  it('catalogue : contraintes, index, politique unique conservée, déclencheurs (diagnostic, plafond), fonction du plafond, commentaire, RLS et droits', async () => {
    const e = await empreinte();
    expect(e.contraintes.map((c) => c.conname)).toEqual(['liste_attente_biens_borne', 'liste_attente_email_borne', 'liste_attente_email_format', 'liste_attente_email_key', 'liste_attente_pkey', 'liste_attente_source_borne']);
    expect(e.contraintes.every((c) => c.convalidated === true)).toBe(true);
    expect(e.index.map((i) => i.indexname)).toEqual(['liste_attente_email_key', 'liste_attente_email_lower_idx', 'liste_attente_pkey', 'liste_attente_recent_idx']);
    expect(e.index.find((i) => i.indexname === 'liste_attente_email_lower_idx')?.indexdef).toBe('CREATE UNIQUE INDEX liste_attente_email_lower_idx ON public.liste_attente USING btree (lower(email))');
    expect(e.index.find((i) => i.indexname === 'liste_attente_recent_idx')?.indexdef).toBe('CREATE INDEX liste_attente_recent_idx ON public.liste_attente USING btree (created_at DESC)');
    expect(e.politiques).toEqual([{ policyname: 'inscription anonyme', permissive: 'PERMISSIVE', roles: '{anon}', cmd: 'INSERT', qual: null, with_check: 'true' }]);
    expect(e.declencheurs.map((d) => d.tgname)).toEqual(['diagnostic_artisan_lecture', 'liste_attente_limiter']);
    expect(e.declencheurs[1].def).toBe('CREATE TRIGGER liste_attente_limiter BEFORE INSERT ON public.liste_attente FOR EACH ROW EXECUTE FUNCTION liste_attente_limiter()');
    expect(e.fonctions).toHaveLength(1);
    // security definer, search_path vide (proconfig = {"search_path=\"\""}), exécutable par le propriétaire et service_role seulement.
    expect(e.fonctions[0]).toMatchObject({ signature: 'liste_attente_limiter()', prosecdef: true, config: '{"search_path=\\"\\""}' });
    expect(e.fonctions[0].droits).not.toMatch(/anon|authenticated|^\{=/);
    expect(e.classe[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: false, commentaire: COMMENTAIRE });
    const d = await un<Record<string, boolean>>(`select
      has_table_privilege('anon', 'public.liste_attente', 'INSERT') as anon_table_insert,
      has_column_privilege('anon', 'public.liste_attente', 'email', 'INSERT') as anon_email,
      has_column_privilege('anon', 'public.liste_attente', 'biens', 'INSERT') as anon_biens,
      has_column_privilege('anon', 'public.liste_attente', 'source', 'INSERT') as anon_source,
      has_column_privilege('anon', 'public.liste_attente', 'id', 'INSERT') as anon_id,
      has_column_privilege('anon', 'public.liste_attente', 'created_at', 'INSERT') as anon_created_at,
      has_any_column_privilege('anon', 'public.liste_attente', 'SELECT') as anon_select,
      has_any_column_privilege('anon', 'public.liste_attente', 'UPDATE') as anon_update,
      has_table_privilege('anon', 'public.liste_attente', 'DELETE, TRUNCATE, REFERENCES, TRIGGER') as anon_autres,
      has_any_column_privilege('authenticated', 'public.liste_attente', 'SELECT, INSERT, UPDATE, REFERENCES') as auth_colonnes,
      has_table_privilege('authenticated', 'public.liste_attente', 'DELETE, TRUNCATE, TRIGGER') as auth_autres,
      has_table_privilege('service_role', 'public.liste_attente', 'SELECT') and has_table_privilege('service_role', 'public.liste_attente', 'INSERT') as service,
      has_function_privilege('anon', 'public.liste_attente_limiter()', 'EXECUTE') as anon_limiter,
      has_function_privilege('authenticated', 'public.liste_attente_limiter()', 'EXECUTE') as auth_limiter`);
    expect(d).toEqual({ anon_table_insert: false, anon_email: true, anon_biens: true, anon_source: true, anon_id: false, anon_created_at: false, anon_select: false, anon_update: false, anon_autres: false, auth_colonnes: false, auth_autres: false, service: true, anon_limiter: false, auth_limiter: false });
  });

  it("invariant élargi aux droits par colonne : liste_attente est la seule table de public où anon détient une écriture, et seulement l'insertion", async () => {
    // Même requête que les trois tests d'invariant (socle, durcissement, devis-vitrine), qui regardent depuis le 19/10 les
    // droits par colonne et attendent nommément cette exception (décision du 19/10 « conserver et borner ») ; répétée ici
    // pour que le lot la porte lui-même.
    const restes = await lignes(`select c.relname || '/' || p.priv as reste
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         cross join lateral (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as p(priv)
        where n.nspname = 'public' and c.relkind in ('r','p')
          and (has_table_privilege('anon', c.oid, p.priv)
               or (p.priv in ('INSERT','UPDATE','REFERENCES') and has_any_column_privilege('anon', c.oid, p.priv)))
        order by 1`);
    expect(restes).toEqual([{ reste: 'liste_attente/INSERT' }]);
  });

  it('la migration est rejouable : deux applications de plus laissent une empreinte identique (fonction et déclencheurs compris)', async () => {
    const avant = await empreinte();
    await db.query(sansFermeture(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    await db.query(sansFermeture(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    await role('anon');
    await expect(inscrire('c'.repeat(242) + '@exemple.test')).rejects.toThrow(/liste_attente_email_borne/);
  });

  it("le retour retire bornes, index, plafond (déclencheur, fonction, index) et commentaire, rend ses droits hérités à authenticated, conserve table, lignes, politique, droit anonyme et déclencheur de diagnostic, retire sa version et garde la voisine ; rejoué sans effet ; la migration ré-appliquée redonne la même empreinte", async () => {
    await role('service_role');
    await inscrire('conservee@exemple.test');
    await role('postgres');
    const avant = await empreinte();
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key)');
    await db.query("insert into supabase_migrations.schema_migrations(version) values ('20261019120000'), ('test_liste_attente_voisine') on conflict do nothing");
    await db.query(sansFermeture(RETOUR));
    const apres = await empreinte();
    expect(apres.contraintes.map((c) => c.conname)).toEqual(['liste_attente_email_format', 'liste_attente_email_key', 'liste_attente_pkey']);
    expect(apres.index.map((i) => i.indexname)).toEqual(['liste_attente_email_key', 'liste_attente_pkey']);
    expect(apres.declencheurs.map((d) => d.tgname)).toEqual(['diagnostic_artisan_lecture']);
    expect(apres.declencheurs).toEqual(avant.declencheurs.filter((d) => d.tgname === 'diagnostic_artisan_lecture'));
    expect(apres.fonctions).toEqual([]);
    expect(apres.classe[0]).toMatchObject({ relrowsecurity: true, commentaire: null });
    expect(apres.colonnes).toEqual(avant.colonnes);
    expect(apres.politiques).toEqual(avant.politiques);
    expect(apres.colonnesDroits).toEqual(avant.colonnesDroits);
    const droits = await un<Record<string, boolean>>("select has_table_privilege('authenticated', 'public.liste_attente', 'SELECT') as s, has_table_privilege('authenticated', 'public.liste_attente', 'INSERT') as i, has_table_privilege('authenticated', 'public.liste_attente', 'TRUNCATE') as t, has_any_column_privilege('anon', 'public.liste_attente', 'INSERT') as a, has_any_column_privilege('anon', 'public.liste_attente', 'SELECT') as l");
    expect(droits).toEqual({ s: true, i: true, t: false, a: true, l: false });
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente where email = 'conservee@exemple.test'")).n).toBe(1);
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ('20261019120000', 'test_liste_attente_voisine') order by 1")).rows).toEqual([{ version: 'test_liste_attente_voisine' }]);
    // L'état antérieur : le doublon à casse différente passe de nouveau, et plus aucun plafond (les défauts que la migration corrige).
    await role('anon');
    expect((await inscrire('Conservee@Exemple.test')).rowCount).toBe(1);
    for (let i = 0; i < PLAFOND; i++) await inscrire(`sans-plafond-${i}@exemple.test`, null, null);
    expect((await inscrire('sans-plafond-de-trop@exemple.test', null, null)).rowCount).toBe(1);
    await role('postgres');
    await db.query("delete from public.liste_attente where email like 'sans-plafond-%@exemple.test'");
    await db.query(sansFermeture(RETOUR)); // Un second retour est sans effet.
    expect(await empreinte()).toEqual(apres);
    // Tant que deux adresses à casse différente coexistent, la migration s'arrête en nommant l'index : aucune donnée réécrite.
    await expect(essayer(sansFermeture(MIGRATION))).rejects.toThrow(/liste_attente_email_lower_idx/);
    expect(await empreinte()).toEqual(apres);
    await db.query("delete from public.liste_attente where email = 'Conservee@Exemple.test'");
    await db.query(sansFermeture(MIGRATION));
    expect(await empreinte()).toEqual(avant);
    expect((await un<{ n: number }>("select count(*)::int as n from public.liste_attente where email = 'conservee@exemple.test'")).n).toBe(1);
  });
});
