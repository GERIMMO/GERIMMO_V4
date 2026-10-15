/**
 * Décision D31 (PR178-A-03) : migration 20261014330000, clé d'idempotence de la création d'une fiche personne.
 * Sur Postgres réel (base locale jetable) :
 *  · la colonne `persons.creation_cle` est facultative et l'index unique est PARTIEL (rien n'est exigé des fiches sans clé) ;
 *  · une même clé ne peut pas créer deux fiches d'une organisation, mais deux organisations peuvent avoir la même valeur ;
 *  · deux envois simultanés de la même clé : le second attend le premier, puis l'index le refuse (rejeu) ; si le premier
 *    est annulé, le second réussit — il n'y a jamais deux fiches ;
 *  · la migration se rejoue sans effet.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const MIGRATION = readFileSync("supabase/migrations/20261014330000_creation_fiche_personne_cle.sql", "utf8");

describe.skipIf(!url)("Création de fiche personne : clé d'idempotence (D31), fixtures locales nettoyées", () => {
  let admin: Client, premier: Client, second: Client;
  const orgs: string[] = [];

  const organisation = async (nom: string) => {
    const { rows } = await admin.query(
      "insert into organizations(name,status,type,address_line1,postal_code,city,email_contact) values($1,'active','proprietaire_direct','1 rue TEST','75001','Paris','test@example.invalid') returning id",
      [nom]
    );
    orgs.push(rows[0].id);
    return rows[0].id as string;
  };
  const fiche = (db: Client, org: string, email: string, cle: string | null) =>
    db.query(
      "insert into public.persons(organization_id,nom,prenom,email,address_line1,postal_code,city,qualite,creation_cle) values($1,'TEST D31','Camille',$2,'1 rue TEST','75001','Paris','Personne physique',$3) returning id",
      [org, email, cle]
    );

  beforeAll(async () => {
    if (!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url)) throw Error("Base locale dediee requise");
    admin = new Client({ connectionString: url }); premier = new Client({ connectionString: url }); second = new Client({ connectionString: url });
    await Promise.all([admin.connect(), premier.connect(), second.connect()]);
  });
  afterAll(async () => {
    await premier?.query("rollback").catch(() => undefined);
    await second?.query("rollback").catch(() => undefined);
    if (orgs.length) {
      await admin.query("begin");
      await admin.query("select public.tache_systeme()");
      for (const table of ["persons", "audit_log"]) await admin.query(`delete from public.${table} where organization_id = any($1::uuid[])`, [orgs]);
      await admin.query("delete from organizations where id = any($1::uuid[])", [orgs]);
      await admin.query("commit");
    }
    await Promise.all([admin?.end(), premier?.end(), second?.end()]);
  });

  it("la colonne est facultative et sans valeur par défaut ; l'index est unique et partiel", async () => {
    const colonne = (await admin.query(
      "select data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='persons' and column_name='creation_cle'"
    )).rows[0];
    expect(colonne).toEqual({ data_type: "uuid", is_nullable: "YES", column_default: null });
    const index = (await admin.query("select indexdef from pg_indexes where schemaname='public' and indexname='persons_creation_cle_unique'")).rows[0]?.indexdef as string;
    expect(index).toMatch(/UNIQUE INDEX persons_creation_cle_unique ON public\.persons USING btree \(organization_id, creation_cle\) WHERE \(creation_cle IS NOT NULL\)/);
  });

  it("aucune fiche existante n'a reçu de clé : la migration n'a rien écrit", async () => {
    const org = await organisation("TEST D31 Sans cle");
    await fiche(admin, org, `a-${randomUUID()}@example.invalid`, null);
    const { rows } = await admin.query("select count(*)::int n from public.persons where creation_cle is null");
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("des fiches sans clé n'entrent pas dans l'index : plusieurs sont permises", async () => {
    const org = await organisation("TEST D31 Plusieurs sans cle");
    await fiche(admin, org, `b-${randomUUID()}@example.invalid`, null);
    await fiche(admin, org, `c-${randomUUID()}@example.invalid`, null);
    expect((await admin.query("select count(*)::int n from public.persons where organization_id=$1", [org])).rows[0].n).toBe(2);
  });

  it("une même clé ne crée qu'une fiche par organisation, mais deux organisations peuvent partager la valeur", async () => {
    const cle = randomUUID();
    const a = await organisation("TEST D31 A"), b = await organisation("TEST D31 B");
    await fiche(admin, a, `d-${randomUUID()}@example.invalid`, cle);
    await expect(fiche(admin, a, `e-${randomUUID()}@example.invalid`, cle)).rejects.toMatchObject({ code: "23505", constraint: "persons_creation_cle_unique" });
    await fiche(admin, b, `f-${randomUUID()}@example.invalid`, cle);
  });

  const course = async (annulerPremier: boolean) => {
    const org = await organisation(`TEST D31 Course ${annulerPremier ? "annulee" : "validee"}`);
    const cle = randomUUID();
    await premier.query("begin"); await second.query("begin");
    const a = await fiche(premier, org, `g-${randomUUID()}@example.invalid`, cle);
    const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
    // Le second envoi de la MÊME clé (autre adresse, pour que seule la clé le arrête) attend le premier.
    const attente = fiche(second, org, `h-${randomUUID()}@example.invalid`, cle).then((r) => ({ r }), (erreur) => ({ erreur }));
    try {
      await expect.poll(async () => (await admin.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type, { timeout: 3000, interval: 20 }).toBe("Lock");
      await premier.query(annulerPremier ? "rollback" : "commit");
      const issue = await attente;
      await second.query(annulerPremier ? "commit" : "rollback");
      const lignes = (await admin.query("select id from public.persons where organization_id=$1 and creation_cle=$2", [org, cle])).rows;
      expect(lignes).toHaveLength(1);
      if (annulerPremier) {
        expect("r" in issue).toBe(true);
      } else {
        // Le second est refusé par l'index : l'action y lit un rejeu et reprend la fiche du premier.
        expect(issue).toMatchObject({ erreur: { code: "23505" } });
        expect(lignes[0].id).toBe(a.rows[0].id);
      }
    } finally {
      await premier.query("rollback").catch(() => undefined); await attente.catch(() => undefined); await second.query("rollback").catch(() => undefined);
    }
  };
  it("deux envois simultanés de la même clé : le second attend puis est refusé, une seule fiche", () => course(false));
  it("si le premier envoi est annulé, le second réussit : une seule fiche", () => course(true));

  it("la migration se rejoue sans effet (deux fois de suite) et refuse un index du même nom d'une autre définition", async () => {
    const empreinte = async () => (await admin.query(
      `select (select indexdef from pg_indexes where indexname='persons_creation_cle_unique') as indexe,
              (select format_type(atttypid, atttypmod) || attnotnull::text from pg_attribute where attrelid='public.persons'::regclass and attname='creation_cle') as colonne`
    )).rows[0];
    const avant = await empreinte();
    await admin.query("begin");
    try {
      await admin.query("set local lock_timeout = '10s'");
      await admin.query(MIGRATION);
      await admin.query(MIGRATION);
      expect(await empreinte()).toEqual(avant);
      // Un index du même nom mais sans prédicat partiel serait pris pour le bon par `if not exists` : la migration s'arrête.
      await admin.query("drop index public.persons_creation_cle_unique");
      await admin.query("create unique index persons_creation_cle_unique on public.persons(organization_id, creation_cle)");
      await expect(admin.query(MIGRATION)).rejects.toThrow(/définition inattendue/);
    } finally {
      await admin.query("rollback");
    }
    expect(await empreinte()).toEqual(avant);
  });
});
