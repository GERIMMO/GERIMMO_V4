/**
 * Décisions X09 et X14 du 14/10/2026, en base.
 *
 *  · X09 (FIN-03) : contrainte de centime sur encaissements.montant, posée NOT VALID (les encaissements existants ne sont ni relus
 *    ni modifiés ; le relevé de production du dossier montre 0 encaissement au-delà du centime).
 *  · X14 (PR178-B-03) : un encaissement de 0,01 € sur un bail géré sous mandat (honoraires > 0) était accepté par l'action, puis refusé par la base
 *    parce que les honoraires arrondis (0,00 €) violaient ecritures_montant_check, avec le message générique « Gerimmo n'a pas pu terminer cette
 *    action ». La base refuse maintenant sous un plancher, qui dépend du taux d'honoraires du mandat, avec un message qui dit le montant minimal.
 *
 * Transaction annulée à la fin de chaque test. Nécessite SUPABASE_DB_URL (base locale jetable) ; sans elle, les tests se sautent.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sansJargon } from "../src/lib/erreurs";
import { couvrirParMandat } from "./fixtures/mandat";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const MIGRATION_CENTIME = readFileSync("supabase/migrations/20261014412000_encaissements_montant_au_centime.sql", "utf8");
const message = (plancher: string) =>
  `Ce montant est trop petit pour être encaissé sur ce bail : les honoraires de gestion qui s’y rattachent seraient arrondis à 0,00 €. Saisissez au moins ${plancher} €.`;

describe.skipIf(!url)("X09 et X14 : centime et plancher d'un encaissement", () => {
  let db: Client;
  let org: string;
  let utilisateur: string;
  let bail: string;
  let lot: string;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("reset role");
    org = (await db.query("insert into public.organizations(name,type,status) values ('TEST centime et plancher','proprietaire_direct','active') returning id")).rows[0].id;
    utilisateur = randomUUID();
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values ($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')", [utilisateur, `${utilisateur}@test.local`]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [utilisateur, org]);
    const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST centime','appartement','1 rue de Test','75001','Paris') returning id", [org])).rows[0].id;
    lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST centime','loue') returning id", [org, bien])).rows[0].id;
    const loc = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Locataire') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',780,60,'2026-01-01',5,$3) returning id", [org, lot, loc])).rows[0].id;
  });

  /** Joue une requête qui doit être refusée, annule son effet et rend l'erreur (code SQLSTATE, contrainte et message compris). */
  async function refus(sql: string, params: unknown[] = []) {
    await db.query("savepoint refus");
    const erreur = await db.query(sql, params).then(
      () => null,
      (e) => e as Error & { code?: string; constraint?: string }
    );
    await db.query("rollback to savepoint refus");
    await db.query("release savepoint refus");
    expect(erreur, "la requête aurait dû être refusée").not.toBeNull();
    return erreur as Error & { code?: string; constraint?: string };
  }
  const encaisser = (montant: string | number) =>
    db.query("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,$3) returning id", [org, bail, montant]);
  const honoraires = async () => (await db.query("select montant::float as m from public.ecritures where bail_id=$1 and categorie='honoraires'", [bail])).rows;

  /** Place le lot sous mandat à ce taux d'honoraires (en pourcentage). */
  async function sousMandat(taux: number | null) {
    await couvrirParMandat(db, bail);
    if (taux === null) return;
    // Écrit en administration, déclencheurs suspendus le temps de la mise à jour (la mécanique du mandat a ses propres tests).
    await db.query("set session_replication_role = replica");
    await db.query("update public.mandat_lignes set taux_honoraires=$1 where lot_id=$2", [taux, lot]);
    await db.query("set session_replication_role = origin");
  }

  describe("X09 (FIN-03) : un encaissement s'exprime au centime près", () => {
    it("la contrainte existe, posée NOT VALID, sur les encaissements seulement", async () => {
      const { rows } = await db.query(
        "select conrelid::regclass::text as table_, convalidated, pg_get_constraintdef(oid) as def from pg_constraint where conname='encaissements_montant_centime_check'"
      );
      expect(rows).toEqual([{ table_: "encaissements", convalidated: false, def: "CHECK ((montant = round(montant, 2))) NOT VALID" }]);
      const ecritures = await db.query("select conname from pg_constraint where conrelid='public.ecritures'::regclass and conname like '%centime%'");
      expect(ecritures.rows).toEqual([]);
    });

    it.each(["100.005", "0.001", "12.345", "840.0001"])("refuse %s € : trois décimales ou plus", async (montant) => {
      const e = await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,$3)", [org, bail, montant]);
      expect(e.code).toBe("23514");
      expect(e.constraint).toBe("encaissements_montant_centime_check");
    });

    it.each(["100", "100.0", "12.3", "100.01", "840.00", "0.01"])("accepte %s € : au centime près", async (montant) => {
      const { rows } = await encaisser(montant);
      expect(rows).toHaveLength(1);
    });

    it("un paiement refusé n'écrit rien : ni encaissement, ni pièce comptable", async () => {
      await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,$3)", [org, bail, "100.005"]);
      expect((await db.query("select count(*)::int as n from public.encaissements where bail_id=$1", [bail])).rows[0].n).toBe(0);
      expect((await db.query("select count(*)::int as n from public.ecritures where bail_id=$1", [bail])).rows[0].n).toBe(0);
    });

    it("la modification d'un montant vers trois décimales est refusée aussi", async () => {
      const { rows: [{ id }] } = await encaisser("100");
      const e = await refus("update public.encaissements set montant=100.005 where id=$1", [id]);
      expect(e.constraint).toBe("encaissements_montant_centime_check");
    });

    it("NOT VALID : un encaissement ancien hors centime est laissé tel quel quand la migration se rejoue", async () => {
      // État d'avant la décision : pas de contrainte, un paiement à trois décimales déjà enregistré.
      await db.query("alter table public.encaissements drop constraint encaissements_montant_centime_check");
      const { rows: [{ id }] } = await encaisser("100.005");
      await db.query(MIGRATION_CENTIME);
      expect((await db.query("select montant::text as m from public.encaissements where id=$1", [id])).rows).toEqual([{ m: "100.005" }]);
      const { rows } = await db.query("select convalidated from pg_constraint where conname='encaissements_montant_centime_check'");
      expect(rows).toEqual([{ convalidated: false }]);
      // Et la contrainte vaut de nouveau pour tout ce qui s'écrit ensuite.
      const e = await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,$3)", [org, bail, "50.005"]);
      expect(e.constraint).toBe("encaissements_montant_centime_check");
    });

    it("la migration se rejoue sans effet", async () => {
      const avant = (await db.query("select oid::int as oid, convalidated from pg_constraint where conname='encaissements_montant_centime_check'")).rows;
      await db.query(MIGRATION_CENTIME);
      await db.query(MIGRATION_CENTIME);
      expect((await db.query("select oid::int as oid, convalidated from pg_constraint where conname='encaissements_montant_centime_check'")).rows).toEqual(avant);
    });
  });

  describe("X14 (PR178-B-03) : un encaissement trop petit pour porter des honoraires est refusé, clairement", () => {
    it("0,01 € sous mandat à 7 % : refusé par la base avec le montant minimal (0,08 €), jamais par la contrainte des écritures", async () => {
      await sousMandat(7);
      const e = await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,0.01)", [org, bail]);
      expect(e.message).toBe(message("0,08"));
      expect(e.code).toBe("P0001");
      expect(e.constraint ?? null).toBeNull();
    });

    it("le message traverse sansJargon sans être remplacé par le message générique", async () => {
      await sousMandat(7);
      const e = await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,0.01)", [org, bail]);
      expect(sansJargon(e.message)).toBe(e.message);
      expect(e.message).not.toMatch(/Gerimmo n’a pas pu terminer/);
    });

    it("0,07 € est refusé et 0,08 € accepté à 7 % : les honoraires valent alors 0,01 €", async () => {
      await sousMandat(7);
      expect((await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,0.07)", [org, bail])).message).toBe(message("0,08"));
      await encaisser("0.08");
      expect(await honoraires()).toEqual([{ m: 0.01 }]);
    });

    it("un refus n'écrit rien : ni encaissement, ni pièce de loyer, ni pièce d'honoraires", async () => {
      await sousMandat(7);
      await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,0.01)", [org, bail]);
      expect((await db.query("select (select count(*) from public.encaissements where bail_id=$1)::int as e, (select count(*) from public.ecritures where bail_id=$1)::int as p", [bail])).rows[0]).toEqual({ e: 0, p: 0 });
    });

    it("sans mandat (propriétaire direct) : aucun honoraire, donc aucun plancher : 0,01 € est accepté", async () => {
      await encaisser("0.01");
      expect(await honoraires()).toEqual([]);
    });

    it("mandat à 0 % : aucun honoraire, donc aucun plancher : 0,01 € est accepté", async () => {
      await sousMandat(0);
      await encaisser("0.01");
      expect(await honoraires()).toEqual([]);
    });

    it("un montant ordinaire n'est pas touché : 840 € à 7 % donnent 58,80 € d'honoraires", async () => {
      await sousMandat(7);
      await encaisser("840");
      expect(await honoraires()).toEqual([{ m: 58.8 }]);
    });

    // Le plancher est le plus petit montant au centime dont les honoraires arrondis ne sont pas nuls : un centime de moins est refusé, lui est accepté.
    it.each([
      [0.5, "1,00"],
      [1, "0,50"],
      [2.5, "0,20"],
      [3, "0,17"],
      [7, "0,08"],
      [8, "0,07"],
      [10, "0,05"],
      [12.5, "0,04"],
      [50, "0,01"],
      [100, "0,01"],
    ])("taux de %s pour cent : plancher de %s €, exact au centime", async (taux, plancher) => {
      await sousMandat(taux);
      const centimes = Math.round(Number(plancher.replace(",", ".")) * 100);
      if (centimes > 1) {
        const dessous = ((centimes - 1) / 100).toFixed(2);
        expect((await refus("insert into public.encaissements(organization_id,bail_id,montant) values($1,$2,$3)", [org, bail, dessous])).message).toBe(message(plancher));
      }
      await encaisser((centimes / 100).toFixed(2));
      const h = await honoraires();
      expect(h).toHaveLength(1);
      expect(h[0].m).toBeGreaterThanOrEqual(0.01);
    });

    it("« Encaisser » (le reste d'un appel de 0,01 €) donne le même message clair", async () => {
      await sousMandat(7);
      const { rows: [{ id: appel }] } = await db.query(
        `insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du)
         values ($1,$2,date_trunc('month', (now() at time zone 'Europe/Paris')::date)::date,(now() at time zone 'Europe/Paris')::date - 1,0.01,0,0.01) returning id`,
        [org, bail]
      );
      await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)", [utilisateur]);
      await db.query("set local role authenticated");
      const e = await refus("select public.encaisser_reste_atomique($1,$2,$3,$4,0.01,0)", [org, bail, appel, randomUUID()]);
      expect(e.message).toBe(message("0,08"));
      await db.query("reset role");
      expect((await db.query("select count(*)::int as n from public.encaissements where bail_id=$1", [bail])).rows[0].n).toBe(0);
    });
  });
});
