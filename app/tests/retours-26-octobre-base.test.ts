/**
 * Audit final du 27/10 (COD-02) : les retours des trois migrations du 26/10 (PR #264), écrits après coup.
 *
 * `20261026213652` (qualifications gaz/électricité du lot), `20261026214857` (année d'installation) et `20261026232941`
 * (assurances identifiées dans le bail) sont en production depuis le 27/10 sans retour. Ici, sur la base migrée et dans une
 * transaction annulée : chaque retour refuse tant qu'une réponse du propriétaire existe ; joués dans l'ordre du LISEZ-MOI
 * (après celui de 20261027100300), ils retirent tables, fonctions, contrainte et versions, se rejouent sans effet, et le
 * rejeu des quatre migrations rend l'état exact d'avant (empreinte des colonnes, contraintes, index, politiques, déclencheurs
 * et fonctions).
 *
 * DDL tenu pendant l'essai : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url) {
  const cible = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(cible.hostname) || !/^\/gerimmo_ci_[a-z_]+$/.test(cible.pathname)) {
    throw Error("Base locale de recette requise pour rejouer les retours du 26 octobre.");
  }
}

const QUALIFICATIONS = "20261026213652_qualifications_diagnostics_lot";
const ANNEE = "20261026214857_qualification_diagnostic_annee_installation";
const PIECES = "20261026232941_pieces_attendues_bail";
const ACTIVATION = "20261027100300_bail_assurance_activation_et_libelle_colocation";
const migration = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
/** Joués tels quels : les quatre retours sont des instructions DO atomiques (celui de 20261027100300 depuis le 28/10). */
const retour = (nom: string) => readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");

describe.skipIf(!url)("retours des migrations du 26 octobre 2026 (base)", () => {
  let db: Client, org: string, lot: string, compte: string;

  const empreinte = async () =>
    (await db.query(`
      select md5(coalesce((select string_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, '|' order by c.relname, a.attnum)
          from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname in ('pieces_attendues_bail','qualifications_diagnostics_lot') and a.attnum > 0 and not a.attisdropped), ''))
        || md5(coalesce((select string_agg(conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid), '|' order by conrelid::regclass::text, conname)
          from pg_constraint where conrelid in (select oid from pg_class where relname in ('pieces_attendues_bail','qualifications_diagnostics_lot','baux'))), ''))
        || md5(coalesce((select string_agg(indexdef, '|' order by indexname) from pg_indexes where schemaname = 'public'
          and tablename in ('pieces_attendues_bail','qualifications_diagnostics_lot')), ''))
        || md5(coalesce((select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)
          from pg_policies where tablename in ('pieces_attendues_bail','qualifications_diagnostics_lot')), ''))
        || md5(coalesce((select string_agg(tgrelid::regclass::text || '.' || tgname || ':' || pg_get_triggerdef(oid), '|' order by tgrelid::regclass::text, tgname)
          from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relname in ('pieces_attendues_bail','qualifications_diagnostics_lot','baux'))), ''))
        || md5(coalesce((select string_agg(p.oid::regprocedure::text || pg_get_functiondef(p.oid) || coalesce(p.proacl::text, ''), '|' order by p.oid::regprocedure::text)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
          and p.proname in ('controler_piece_attendue_bail','affecter_piece_attendue_bail','tracer_qualification_diagnostic','rattacher_assurance_locataire_activation','choisir_personne_bail')), '')) as e`)).rows[0].e as string;
  const versions = async () =>
    (await db.query("select version from supabase_migrations.schema_migrations where version = any($1::text[]) order by 1",
      [["20261026213652", "20261026214857", "20261026232941", "20261027100300"]])).rows.map((r) => r.version as string);
  const objets = async () =>
    (await db.query(`select to_regclass('public.pieces_attendues_bail') is not null as pieces,
      to_regclass('public.qualifications_diagnostics_lot') is not null as qualifications,
      to_regprocedure('public.affecter_piece_attendue_bail(uuid,uuid,text,uuid,uuid)') is not null as affecter,
      to_regprocedure('public.controler_piece_attendue_bail()') is not null as controler,
      to_regprocedure('public.tracer_qualification_diagnostic()') is not null as tracer,
      exists (select 1 from pg_constraint where conname = 'baux_id_lot_org_pieces_unique') as contrainte`)).rows[0];
  async function refus(sql: string) {
    await db.query("savepoint refus");
    try { await db.query(sql); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
    finally { await db.query("release savepoint refus"); }
  }

  beforeEach(async () => {
    db = new Client({ connectionString: url }); await db.connect();
    await db.query("begin");
    compte = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [compte, `${compte}@test.local`]);
    org = (await db.query("insert into organizations(name,type,status) values('TEST retours 26/10','proprietaire_direct','active') returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Retours','immeuble','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Lot','disponible') returning id", [org, bien])).rows[0].id;
    // Les versions sont enregistrées sur la base de test comme en production.
    await db.query("insert into supabase_migrations.schema_migrations(version, name) select v, v from unnest($1::text[]) v on conflict do nothing",
      [["20261026213652", "20261026214857", "20261026232941", "20261027100300"]]);
  });
  afterEach(async () => { await db.query("rollback"); await db.end(); });

  it("le retour de 20261027100300, premier de la séquence, ne valide jamais la transaction qui le contient", async () => {
    expect(retour(ACTIVATION)).toMatch(/^do \$retour_atomique\$/m);
    expect(retour(ACTIVATION)).not.toMatch(/^(begin|commit);$/m);
    await db.query(retour(ACTIVATION));
    expect((await db.query("select now() = statement_timestamp() as nouvelle")).rows[0].nouvelle).toBe(false);
  });

  it("la base de test porte les trois migrations : leur rejeu direct échoue (fichiers non rejouables, déjà appliqués)", async () => {
    expect(await objets()).toEqual({ pieces: true, qualifications: true, affecter: true, controler: true, tracer: true, contrainte: true });
    for (const nom of [QUALIFICATIONS, ANNEE, PIECES]) expect(await refus(migration(nom))).toMatch(/already exists/);
  });

  it("le retour des assurances refuse tant que le déclencheur de l'activation (20261027100300) existe", async () => {
    expect(await refus(retour(PIECES))).toMatch(/baux_assurance_locataire_activation .*20261027100300/);
    expect((await objets()).pieces).toBe(true);
  });

  it("chaque retour refuse de perdre une réponse du propriétaire ou une assurance classée", async () => {
    await db.query(retour(ACTIVATION));
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query(`insert into qualifications_diagnostics_lot(organization_id,lot_id,type,situation,annee_installation,updated_by) values($1,$2,'gaz','annee_connue',2015,$3)`, [org, lot, compte]);
    const document = (await db.query(`insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by)
      values($1,'attestation_assurance','TEST assurance',$2,'application/pdf',1234,$3,$4) returning id`, [org, `${org}/${randomUUID()}.pdf`, "a".repeat(64), compte])).rows[0].id;
    await db.query("insert into pieces_attendues_bail(organization_id,lot_id,bail_id,nature,document_id,updated_by) values($1,$2,null,'assurance_proprietaire',$3,$4)", [org, lot, document, compte]);
    expect(await refus(retour(PIECES))).toMatch(/des assurances sont classées/);
    expect(await refus(retour(ANNEE))).toMatch(/portent une année d'installation/);
    await db.query("delete from pieces_attendues_bail");
    await db.query("update qualifications_diagnostics_lot set situation = 'inconnue', annee_installation = null");
    await db.query(retour(ANNEE));
    expect(await refus(retour(QUALIFICATIONS))).toMatch(/des qualifications de diagnostics existent/);
    expect(await objets()).toMatchObject({ pieces: true, qualifications: true });
    // La réponse conservée est intacte, sous les contraintes d'avant 214857.
    expect((await db.query("select situation from qualifications_diagnostics_lot")).rows).toEqual([{ situation: "inconnue" }]);
  });

  it("dans l'ordre du LISEZ-MOI : tout est retiré, les versions aussi ; rejeu sans effet ; aller, retour, aller redonne l'état exact", async () => {
    const migre = await empreinte();
    expect(await versions()).toHaveLength(4);
    for (const nom of [ACTIVATION, PIECES, ANNEE, QUALIFICATIONS]) await db.query(retour(nom));
    expect(await objets()).toEqual({ pieces: false, qualifications: false, affecter: false, controler: false, tracer: false, contrainte: false });
    expect(await versions()).toEqual([]);
    expect(await empreinte()).not.toBe(migre);
    // Rejeu : « rien à faire », aucune erreur.
    for (const nom of [PIECES, ANNEE, QUALIFICATIONS]) await db.query(retour(nom));
    for (const nom of [QUALIFICATIONS, ANNEE, PIECES, ACTIVATION]) await db.query(migration(nom));
    expect(await empreinte()).toBe(migre);
    expect(await objets()).toEqual({ pieces: true, qualifications: true, affecter: true, controler: true, tracer: true, contrainte: true });
  });
});
