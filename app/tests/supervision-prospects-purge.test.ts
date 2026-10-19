/**
 * Audit du 19/10 (lot mineurs, i, M18 ; migration 20261019121000) : les prospects ne bloquent plus les suppressions.
 *
 * Constat : les clés étrangères de `supervision_prospects` (demande d'origine, responsable, auteur) et du registre de
 * supervision (auteur) étaient sans action référentielle. La rétention quotidienne (`appliquer_retention`, demandes
 * de contact de plus de 24 mois) échouait entière dès qu'un prospect citait une demande à purger ; la suppression
 * d'un compte référencé échouerait de même. Désormais ON DELETE SET NULL vers `demandes_devis` et `accounts` ; la
 * clé vers `organizations` reste telle quelle. Le déclencheur de traçage laisse passer la mise à jour « système »
 * (aucune session, révision inchangée) et l'écrit au registre sans auteur ; une session garde la règle d'avant.
 *
 * Transaction annulée, un point de sauvegarde par cas. Rejoue la migration et son retour (DDL) : fichier en série.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);

const NOM = "20261019121000_droits_anon_contact_articles_et_prospects";
const aller = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8")
  .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
  .replace(/^begin;$/m, "")
  .replace(/^commit;$/m, "");

const CLES = [
  ["public.supervision_prospects", "supervision_prospects_demande_id_fkey"],
  ["public.supervision_prospects", "supervision_prospects_responsable_fkey"],
  ["public.supervision_prospects", "supervision_prospects_auteur_fkey"],
  ["public.supervision_registre", "supervision_registre_auteur_fkey"],
] as const;

describe.skipIf(!DB)("Prospects : purge des demandes et suppression de comptes sans blocage", () => {
  let db: Client;
  let superviseur: string, responsable: string, demande: string, prospect: string;

  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (email: string) =>
    id(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,'x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`,
      [email]
    );
  /** `auth.uid()` vaut ce compte (rôle postgres conservé : on éprouve le déclencheur, pas la RLS). */
  const session = async (qui: string) =>
    db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]);
  /** Aucune session : ce que voit une tâche planifiée ou une action référentielle. */
  const systeme = async () => db.query("select set_config('request.jwt.claims','',true)");
  const echec = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as Error).message;
    }
  };
  const fiche = async () => (await db.query("select demande_id, responsable, auteur, revision from public.supervision_prospects where id=$1", [prospect])).rows[0];
  const traces = async () =>
    (await db.query("select auteur, apres->>'demande_id' as demande, apres->>'responsable' as responsable from public.supervision_registre where objet='supervision_prospects' and objet_id=$1 order by cree_le, id", [prospect])).rows;
  const contrainte = async (table: string, nom: string) =>
    (await db.query("select pg_get_constraintdef(oid) d from pg_constraint where conrelid=$1::regclass and conname=$2", [table, nom])).rows[0]?.d as string | undefined;
  const empreinte = async () =>
    (
      await db.query(`select
        (select string_agg(conname||' '||pg_get_constraintdef(oid), ' | ' order by conname) from pg_constraint where conrelid in ('public.supervision_prospects'::regclass,'public.supervision_registre'::regclass) and contype='f') as cles,
        (select string_agg(attrelid::regclass::text||'.'||attname||':'||attnotnull, ',' order by attrelid, attname) from pg_attribute where attrelid in ('public.supervision_prospects'::regclass,'public.supervision_registre'::regclass) and attname='auteur') as auteurs,
        md5(pg_get_functiondef('public.supervision_tracer_modification()'::regprocedure)) as declencheur,
        (select proacl::text from pg_proc where oid='public.supervision_tracer_modification()'::regprocedure) as droits`)
    ).rows[0];

  beforeAll(async () => {
    db = new Client({ connectionString: DB });
    await db.connect();
    await db.query("begin");
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
    const s = Math.random().toString(36).slice(2, 10);
    superviseur = await compte(`superviseur-${s}@example.test`);
    responsable = await compte(`responsable-${s}@example.test`);
    // Une demande de contact de plus de 24 mois : la rétention quotidienne doit la purger. Le déclencheur d'insertion
    // (`demandes_devis_limiter`) date la ligne du jour : on la vieillit après coup.
    demande = await id(
      "insert into public.demandes_devis(nom,email,agence,telephone,nb_lots,message) values('Prospect fictif','prospect-'||$1||'@example.test','Agence fictive','0600000000',12,'Demande fictive de recette') returning id",
      [s]
    );
    await db.query("update public.demandes_devis set created_at=now()-interval '25 months' where id=$1", [demande]);
    await session(superviseur);
    prospect = await id(
      "insert into public.supervision_prospects(nom,email,origine,etape,responsable,prochaine_action,echeance,demande_id) values('Prospect fictif QA','prospect-'||$1||'@example.test','Formulaire du site','nouveau',$2,'Rappeler pour une démonstration',current_date+7,$3) returning id",
      [s, responsable, demande]
    );
    await systeme();
  });
  afterEach(async () => {
    await systeme();
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("les clés vers la demande d'origine et vers les comptes sont ON DELETE SET NULL ; celle vers l'organisation ne change pas", async () => {
    for (const [table, nom] of CLES) expect(await contrainte(table, nom), nom).toMatch(/ON DELETE SET NULL$/);
    expect(await contrainte("public.supervision_prospects", "supervision_prospects_organisation_id_fkey")).toBe("FOREIGN KEY (organisation_id) REFERENCES organizations(id)");
  });

  it("la rétention quotidienne purge la demande ancienne sans échouer : le prospect reste, sans sa demande, révision inchangée, trace système au registre", async () => {
    expect(await fiche()).toMatchObject({ demande_id: demande, revision: 0 });
    expect(await echec("select public.appliquer_retention()")).toBe("");
    expect((await db.query("select count(*)::int n from public.demandes_devis where id=$1", [demande])).rows[0].n).toBe(0);
    expect(await fiche()).toMatchObject({ demande_id: null, responsable, auteur: superviseur, revision: 0 });
    const t = await traces();
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ auteur: superviseur, demande });
    expect(t[1]).toMatchObject({ auteur: null, demande: null });
  });

  it("la suppression d'un compte référencé passe : responsable puis auteur mis à nul, le registre garde ses lignes sans auteur", async () => {
    expect(await echec("delete from auth.users where id=$1", [responsable])).toBe("");
    expect(await fiche()).toMatchObject({ responsable: null, auteur: superviseur, revision: 0 });
    expect(await echec("delete from auth.users where id=$1", [superviseur])).toBe("");
    expect(await fiche()).toMatchObject({ responsable: null, auteur: null, revision: 0 });
    const t = await traces();
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.every((l) => l.auteur === null)).toBe(true);
  });

  it("une session garde la règle d'avant : révision périmée refusée, révision suivante tracée à son nom", async () => {
    await session(superviseur);
    expect(await echec("update public.supervision_prospects set notes='Relu' where id=$1", [prospect])).toMatch(/Version périmée/);
    expect(await echec("update public.supervision_prospects set notes='Relu', revision=1 where id=$1", [prospect])).toBe("");
    expect(await fiche()).toMatchObject({ revision: 1 });
    expect((await traces()).at(-1)).toMatchObject({ auteur: superviseur });
  });

  it("rejeu sans effet ; retour : clés sans action, auteur obligatoire, déclencheur d'origine ; réapplication identique", async () => {
    const attendu = await empreinte();
    await db.query(aller);
    expect(await empreinte()).toEqual(attendu);
    await db.query(retour);
    for (const [table, nom] of CLES) expect(await contrainte(table, nom), nom).not.toMatch(/ON DELETE/);
    expect((await empreinte()).auteurs).toBe("supervision_prospects.auteur:true,supervision_registre.auteur:true");
    expect((await db.query("select pg_get_functiondef('public.supervision_tracer_modification()'::regprocedure) d")).rows[0].d).not.toMatch(/système/);
    // Sans la migration, la purge échoue de nouveau sur la clé : c'est l'état d'avant, rétabli.
    expect(await echec("delete from public.demandes_devis where id=$1", [demande])).toMatch(/supervision_prospects_demande_id_fkey/);
    await db.query(aller);
    expect(await empreinte()).toEqual(attendu);
  });

  it("le retour refuse, sans rien modifier, tant qu'une trace système (auteur nul) existe", async () => {
    expect(await echec("select public.appliquer_retention()")).toBe("");
    expect(await echec(retour)).toMatch(/auteur nul/);
    for (const [table, nom] of CLES) expect(await contrainte(table, nom), nom).toMatch(/ON DELETE SET NULL$/);
  });
});
