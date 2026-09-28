/**
 * La grille du 28/09/2026 dans la base : même chiffres que src/lib/tarifs.ts,
 * comptage des biens et des lots, garde de capacité, fin d'essai, parrainage
 * suspendu, grille historique préservée.
 *
 * Nécessite SUPABASE_DB_URL. Chaque test tourne dans une transaction annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { offreAgence, offreParticulier } from "@/lib/tarifs";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;

async function un<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query(sql, params)).rows[0] as T;
}

async function refus(sql: string, params: unknown[] = []): Promise<{ message: string; code: string }> {
  await db.query("savepoint refus");
  try {
    await db.query(sql, params);
  } catch (e) {
    await db.query("rollback to savepoint refus");
    const err = e as { message: string; code: string };
    return { message: err.message, code: err.code };
  }
  await db.query("release savepoint refus");
  return { message: "", code: "" };
}

async function org(type: "agence" | "proprietaire_direct", statut = "active", grille?: string): Promise<string> {
  const { id } = await un<{ id: string }>(
    grille
      ? `insert into public.organizations (name, status, type, essai_fin, grille_tarifaire)
         values ('Grille', $1::public.organization_status, $2::public.organization_type, current_date + 7, $3) returning id`
      : `insert into public.organizations (name, status, type, essai_fin)
         values ('Grille', $1::public.organization_status, $2::public.organization_type, current_date + 7) returning id`,
    grille ? [statut, type, grille] : [statut, type]
  );
  return id;
}

async function souscrire(o: string, unites: number, formule: string | null = null) {
  await db.query(
    `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut, unites_souscrites, formule)
     values ($1, 'cus_'||gen_random_uuid(), 'sub_'||gen_random_uuid(), 'active', $2, $3)`,
    [o, unites, formule]
  );
}

async function bien(o: string, lots = 1, nom = "Bien"): Promise<{ bien: string; lots: string[] }> {
  const { id } = await un<{ id: string }>(
    `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
     values ($1, $2||' '||gen_random_uuid(), 'immeuble'::public.bien_type, '1 rue X', '75001', 'Paris') returning id`,
    [o, nom]
  );
  const ids: string[] = [];
  for (let i = 0; i < lots; i++) {
    ids.push(
      (await un<{ id: string }>(
        `insert into public.lots (organization_id, bien_id, nom, etat) values ($1, $2, 'Lot '||$3, 'disponible') returning id`,
        [o, id, i]
      )).id
    );
  }
  return { bien: id, lots: ids };
}

const aCouvrir = async (o: string) => (await un<{ n: number }>("select public.unites_a_couvrir($1) as n", [o])).n;

describe.skipIf(!DB_URL)("grille tarifaire du 28/09/2026 — base", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  describe("la base et src/lib/tarifs.ts disent les mêmes montants", () => {
    it("particuliers, mensuel et annuel, de 0 à 260 biens", async () => {
      const { rows } = await db.query<{ n: number; m: string; a: string; f: string }>(
        `select n, public.montant_offre_cents('proprietaire_direct', n, 'mensuel')::text as m,
                public.montant_offre_cents('proprietaire_direct', n, 'annuel')::text as a,
                public.formule_couvrante(n, 'mensuel') as f
           from generate_series(0, 260) n`
      );
      for (const r of rows) {
        const m = offreParticulier(r.n, "mensuel");
        expect(`${r.n}:${r.m}:${r.a}:${r.f}`).toBe(
          `${r.n}:${m.montantCents}:${offreParticulier(r.n, "annuel").montantCents}:${m.formule.code}`
        );
      }
    });

    it("agences, de 0 à 650 lots", async () => {
      const { rows } = await db.query<{ n: number; m: string }>(
        `select n, public.montant_offre_cents('agence', n)::text as m from generate_series(0, 650) n`
      );
      for (const r of rows) expect(`${r.n}:${r.m}`).toBe(`${r.n}:${offreAgence(r.n).montantCents}`);
    });

    it("la grille historique reste intacte pour ceux qui y sont", async () => {
      const m = async (t: string, n: number) =>
        Number((await un<{ m: string }>("select public.montant_abonnement_cents($1::public.organization_type, $2)::text as m", [t, n])).m);
      expect(await m("proprietaire_direct", 2)).toBe(1198); // 2 biens payants × 5,99
      expect(await m("agence", 51)).toBe(11900 + 130); // tranches du 12/09
    });
  });

  describe("la grille de chaque organisation", () => {
    it("une organisation créée aujourd'hui relève de la nouvelle grille", async () => {
      const o = await org("proprietaire_direct");
      expect((await un<{ g: string }>("select grille_tarifaire as g from public.organizations where id = $1", [o])).g).toBe("2026-09-28");
    });

    it("un utilisateur ne peut pas se remettre sur la grille historique (premier bien gratuit)", async () => {
      const o = await org("proprietaire_direct");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: "00000000-0000-0000-0000-000000000001", role: "authenticated" }),
      ]);
      const r = await refus("update public.organizations set grille_tarifaire = 'historique' where id = $1", [o]);
      await db.query(`select set_config('request.jwt.claims', '', true)`);
      expect(r.message).toMatch(/grille tarifaire/);
    });
  });

  describe("ce qu'on compte", () => {
    it("particulier : un lot loué séparément = un bien ; vacant compté ; archivé et retiré exclus", async () => {
      const o = await org("proprietaire_direct", "essai");
      expect(await aCouvrir(o)).toBe(0);
      const immeuble = await bien(o, 3, "Immeuble"); // trois logements loués séparément
      await bien(o, 1, "Parking"); // un parking loué à part
      expect(await aCouvrir(o)).toBe(4);
      await db.query("update public.lots set etat = 'archive' where id = $1", [immeuble.lots[0]]);
      expect(await aCouvrir(o)).toBe(3);
      await db.query("update public.biens set archived_at = now() where id = $1", [immeuble.bien]);
      expect(await aCouvrir(o)).toBe(1);
    });

    it("agence : lots distincts sous mandat actif, vacants compris, sans doublon ; un lot archivé sous mandat actif reste compté", async () => {
      const o = await org("agence", "essai");
      const mandant = (await un<{ id: string }>("insert into public.persons (organization_id, nom) values ($1,'Mandant') returning id", [o])).id;
      const mandat = (await un<{ id: string }>(
        `insert into public.mandats (organization_id, person_id, etat, date_debut) values ($1,$2,'brouillon',current_date - 30) returning id`,
        [o, mandant]
      )).id;
      const { lots } = await bien(o, 2);
      for (const l of lots) {
        await db.query("insert into public.detentions (organization_id, lot_id, person_id, quote_part) values ($1,$2,$3,100)", [o, l, mandant]);
        await db.query(
          "insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut) values ($1,$2,$3,7,current_date - 1)",
          [o, mandat, l]
        );
      }
      expect(await aCouvrir(o)).toBe(0); // mandat en brouillon : rien n'est confié
      await db.query("update public.mandats set etat = 'actif' where id = $1", [mandat]);
      expect(await aCouvrir(o)).toBe(2);
      await db.query("update public.lots set etat = 'archive' where id = $1", [lots[0]]);
      expect(await aCouvrir(o)).toBe(2);
    });
  });

  describe("aucune hausse payante sans confirmation", () => {
    it("formule Bailleur (3 biens) : le 4ᵉ bien est refusé, rien n'est écrit, et le message dit où confirmer", async () => {
      const o = await org("proprietaire_direct");
      await souscrire(o, 3, "bailleur");
      for (let i = 0; i < 3; i++) await bien(o);
      const avant = await aCouvrir(o);
      const r = await refus(
        `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
         values ($1, 'Quatrième', 'appartement', '1 rue X', '75001', 'Paris')`,
        [o]
      );
      expect(r.code).toBe("GRM01");
      expect(r.message).toMatch(/couvre 3 biens/);
      expect(r.message).toMatch(/Mon abonnement/);
      expect(await aCouvrir(o)).toBe(avant);
      // Capacité confirmée (formule Investisseur) : le bien passe.
      await db.query("update public.abonnements set unites_souscrites = 10 where organization_id = $1", [o]);
      await bien(o);
      expect(await aCouvrir(o)).toBe(4);
    });

    it("une restauration suit la même règle", async () => {
      const o = await org("proprietaire_direct");
      await souscrire(o, 1, "solo");
      const b1 = await bien(o);
      await db.query("update public.biens set archived_at = now() where id = $1", [b1.bien]);
      await bien(o); // le seul bien couvert, désormais
      const r = await refus("update public.biens set archived_at = null where id = $1", [b1.bien]);
      expect(r.code).toBe("GRM01");
      const { a } = await un<{ a: string | null }>("select archived_at as a from public.biens where id = $1", [b1.bien]);
      expect(a).not.toBeNull(); // données préservées, bien toujours consultable dans l'historique
    });

    it("pendant l'essai, sans abonnement, aucune garde : l'essai couvre tout", async () => {
      const o = await org("proprietaire_direct", "essai");
      for (let i = 0; i < 25; i++) await bien(o);
      expect(await aCouvrir(o)).toBe(25);
    });

    it("agence : activer un mandat au-delà des lots confirmés est refusé", async () => {
      const o = await org("agence");
      await souscrire(o, 1);
      const mandant = (await un<{ id: string }>("insert into public.persons (organization_id, nom) values ($1,'Mandant') returning id", [o])).id;
      const mandat = (await un<{ id: string }>(
        `insert into public.mandats (organization_id, person_id, etat, date_debut) values ($1,$2,'brouillon',current_date - 30) returning id`,
        [o, mandant]
      )).id;
      const { lots } = await bien(o, 2);
      for (const l of lots) {
        await db.query("insert into public.detentions (organization_id, lot_id, person_id, quote_part) values ($1,$2,$3,100)", [o, l, mandant]);
        await db.query(
          "insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut) values ($1,$2,$3,7,current_date - 1)",
          [o, mandat, l]
        );
      }
      const r = await refus("update public.mandats set etat = 'actif' where id = $1", [mandat]);
      expect(r.code).toBe("GRM01");
      expect(r.message).toMatch(/1 lot sous mandat/);
      await db.query("update public.abonnements set unites_souscrites = 2 where organization_id = $1", [o]);
      await db.query("update public.mandats set etat = 'actif' where id = $1", [mandat]);
      expect(await aCouvrir(o)).toBe(2);
    });

    it("la grille historique n'a pas de garde de capacité", async () => {
      const o = await org("proprietaire_direct", "active", "historique");
      await souscrire(o, 1);
      await bien(o);
      await bien(o);
      expect(await aCouvrir(o)).toBe(2);
    });
  });

  describe("le miroir de Stripe", () => {
    it("abonnement_details enregistre formule, périodicité, capacité, montant, et le journalise", async () => {
      const o = await org("proprietaire_direct");
      const client = (await un<{ c: string }>(
        "insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id, stripe_statut) values ($1,'cus_det_'||gen_random_uuid(),'sub_det','active') returning stripe_customer_id as c",
        [o]
      )).c;
      await db.query("select public.abonnement_details($1,'annuel','bailleur',3,9990,now())", [client]);
      const a = await un<{ p: string; f: string; u: number; m: string; mm: string }>(
        "select periodicite as p, formule as f, unites_souscrites as u, montant_periode_cents::text as m, montant_mensuel_cents::text as mm from public.abonnements where organization_id = $1",
        [o]
      );
      expect(a).toEqual({ p: "annuel", f: "bailleur", u: 3, m: "9990", mm: "833" });
      const j = await un<{ n: number }>("select count(*)::int as n from public.audit_log where organization_id = $1 and action = 'abonnement_capacite'", [o]);
      expect(j.n).toBe(1);
      // Rejouée (même événement Stripe livré deux fois) : pas de seconde trace.
      await db.query("select public.abonnement_details($1,'annuel','bailleur',3,9990,now())", [client]);
      expect((await un<{ n: number }>("select count(*)::int as n from public.audit_log where organization_id = $1 and action = 'abonnement_capacite'", [o])).n).toBe(1);
    });

    it("la synchronisation automatique de quantité ne touche que la grille historique", async () => {
      const o = await org("proprietaire_direct");
      await souscrire(o, 20, "patrimoine");
      await bien(o);
      const { rows } = await db.query("select 1 from public.abonnements_a_synchroniser(500) where organization_id = $1", [o]);
      expect(rows).toHaveLength(0);
    });

    it("l'échéance à préparer : listée dans les trois jours, une seule fois, jamais si résiliée", async () => {
      const o = await org("proprietaire_direct");
      await souscrire(o, 10, "investisseur");
      await db.query("update public.abonnements set periode_fin = now() + interval '2 days' where organization_id = $1", [o]);
      const liste = async () =>
        (await db.query("select * from public.abonnements_echeance_a_preparer(3) where organization_id = $1", [o])).rows;
      expect(await liste()).toHaveLength(1);
      await db.query("select public.abonnement_echeance_preparee($1, (select periode_fin from public.abonnements where organization_id = $1), null)", [o]);
      expect(await liste()).toHaveLength(0);
      await db.query("update public.abonnements set changement_applique_pour = null, annulation_demandee = true where organization_id = $1", [o]);
      expect(await liste()).toHaveLength(0);
    });
  });

  describe("le parrainage ne se cumule pas automatiquement avec la nouvelle grille", () => {
    it("le filleul de la nouvelle grille garde 14 jours ; l'avantage attend l'arbitrage", async () => {
      const parrain = await org("proprietaire_direct");
      const filleul = await org("proprietaire_direct", "essai");
      const avant = (await un<{ d: string }>("select essai_fin::text as d from public.organizations where id = $1", [filleul])).d;
      const p = (await un<{ id: string }>(
        "insert into public.parrainages (parrain_organization_id, filleul_organization_id, code) values ($1,$2,'ABCDEF12') returning id",
        [parrain, filleul]
      )).id;
      await db.query("select public.parrainage_avantage_filleul($1)", [p]);
      expect((await un<{ d: string }>("select essai_fin::text as d from public.organizations where id = $1", [filleul])).d).toBe(avant);
      expect((await un<{ e: string }>("select etat as e from public.avantages_parrainage where parrainage_id = $1", [p])).e).toBe("en_attente");
    });
  });
});
