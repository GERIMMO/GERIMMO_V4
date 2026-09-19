/**
 * Tests d'intégration — l'avantage du parrainage (19/09).
 *
 * « Un mois pour vous, un mois pour lui » : trente jours d'essai pour le
 * filleul au rattachement, un mois pour le parrain à la CONVERSION du filleul.
 *
 * CE QUE CES TESTS GARDENT. Que le parrain ne soit pas payé pour une simple
 * inscription (sinon on finance des organisations fictives ouvertes avec son
 * propre code), qu'on ne récompense jamais deux fois la même conversion, qu'un
 * avoir ne soit jamais promis à vide, et que le registre ne s'écrive pas à la
 * main.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  JOURS_ESSAI_FILLEUL,
  JOURS_ESSAI_ORDINAIRE,
  JOURS_OFFERTS_PARRAIN,
  PROMESSE_PARRAINAGE,
} from "@/lib/parrainage";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-av-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

type Org = { id: string; code: string };

async function organisation(
  nom: string,
  statut = "essai",
  essaiFin: string | null = "current_date + 14"
): Promise<Org> {
  await db.query("reset role");
  const {
    rows: [ligne],
  } = await db.query<Org>(
    `insert into public.organizations (name, status, type, essai_fin)
     values ($1, $2::public.organization_status, 'agence', ${essaiFin ?? "null"})
     returning id, code_parrainage as code`,
    [nom, statut]
  );
  return ligne;
}

async function membre(org: string): Promise<string> {
  const compte = await creerUtilisateur();
  await db.query("reset role");
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
    [compte, org]
  );
  return compte;
}

async function simuler(accountId: string | null) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }) : "",
  ]);
  await db.query("set local role authenticated");
}

/** Passer une organisation en client payant, comme le fait le webhook Stripe. */
async function convertir(org: string) {
  await db.query("reset role");
  await db.query("select set_config('gerimmo.systeme','on',true)");
  await db.query(
    `update public.organizations set status = 'active' where id = $1`,
    [org]
  );
  await db.query("select set_config('gerimmo.systeme','',true)");
}

async function avantages(parrainage?: string) {
  await db.query("reset role");
  const { rows } = await db.query(
    `select nature, jours, montant_cents, etat, beneficiaire_organization_id as beneficiaire
       from public.avantages_parrainage
      ${parrainage ? "where parrainage_id = $1" : ""}
      order by nature`,
    parrainage ? [parrainage] : []
  );
  return rows;
}

async function essaiDe(org: string): Promise<string | null> {
  await db.query("reset role");
  const { rows } = await db.query<{ e: string | null }>(
    "select essai_fin::text as e from public.organizations where id = $1",
    [org]
  );
  return rows[0].e;
}

async function dans(jours: number): Promise<string> {
  await db.query("reset role");
  const { rows } = await db.query<{ d: string }>(
    "select (current_date + $1::int)::text as d",
    [jours]
  );
  return rows[0].d;
}

/** Rattache un filleul à un parrain, comme l'écran d'inscription le fait. */
async function rattacher(filleul: string, compteFilleul: string, code: string): Promise<string> {
  await simuler(compteFilleul);
  const { rows } = await db.query<{ id: string }>(
    "select public.enregistrer_parrainage($1, $2) as id",
    [filleul, code]
  );
  return rows[0].id;
}

async function refus(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint refus");
  try {
    await db.query(sql, params);
    await db.query("release savepoint refus");
    return "";
  } catch (e) {
    await db.query("rollback to savepoint refus");
    return (e as Error).message;
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
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
});

describe("l'avantage du filleul : trente jours, tout de suite", () => {
  it("porte l'essai à un mois au moment où le code est accepté", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);

    expect(await essaiDe(filleul.id)).toBe(await dans(14));
    const parrainage = await rattacher(filleul.id, compte, parrain.code);
    expect(await essaiDe(filleul.id)).toBe(await dans(30));

    const lignes = await avantages(parrainage);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ nature: "essai_filleul", jours: 30, etat: "applique" });
  });

  it("ne raccourcit jamais un essai déjà plus long", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul long", "essai", "current_date + 60");
    const compte = await membre(filleul.id);
    await rattacher(filleul.id, compte, parrain.code);
    expect(await essaiDe(filleul.id)).toBe(await dans(60));
  });

  it("le dit « sans objet » plutôt que de faire semblant, si le filleul paie déjà", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul payant", "active", null);
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);
    expect(await avantages(parrainage)).toMatchObject([
      { nature: "essai_filleul", etat: "sans_objet" },
    ]);
  });
});

describe("l'avantage du parrain : à la conversion, pas à l'inscription", () => {
  it("ne donne RIEN tant que le filleul n'est pas devenu client payant", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    // C'est tout l'enjeu : une inscription récompensée, ce sont des
    // organisations fictives ouvertes avec son propre code.
    const lignes = await avantages(parrainage);
    expect(lignes.filter((l) => l.nature !== "essai_filleul")).toHaveLength(0);
    expect(await essaiDe(parrain.id)).toBe(await dans(14));
  });

  it("offre trente jours d'essai au parrain encore en essai", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    await convertir(filleul.id);

    expect(await essaiDe(parrain.id)).toBe(await dans(44)); // 14 + 30
    const ligne = (await avantages(parrainage)).find((l) => l.nature === "essai_parrain");
    expect(ligne).toMatchObject({ jours: 30, etat: "applique" });
  });

  it("offre un avoir de son mensuel courant au parrain déjà payant", async () => {
    const parrain = await organisation("Parrain payant", "active", null);
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, quantite, montant_mensuel_cents)
       values ($1, 'cus_test', 7, 4193)`,
      [parrain.id]
    );
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    await convertir(filleul.id);

    const ligne = (await avantages(parrainage)).find((l) => l.nature === "avoir_parrain");
    expect(ligne).toMatchObject({ montant_cents: "4193", etat: "a_appliquer" });
  });

  it("n'inscrit pas un avoir vide quand il n'y a rien à créditer", async () => {
    const parrain = await organisation("Parrain sans montant", "active", null);
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    await convertir(filleul.id);

    const ligne = (await avantages(parrainage)).find((l) => l.nature === "avoir_parrain");
    expect(ligne).toMatchObject({ montant_cents: "0", etat: "sans_objet" });
  });

  it("ne récompense qu'UNE fois, même si le filleul repasse par « active »", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    await convertir(filleul.id);
    const apresPremiere = await essaiDe(parrain.id);

    // Suspension, puis retour : un impayé réglé ne rapporte pas un second mois.
    await db.query("reset role");
    await db.query("select set_config('gerimmo.systeme','on',true)");
    await db.query("update public.organizations set status = 'suspendue' where id = $1", [filleul.id]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    await convertir(filleul.id);

    expect(await essaiDe(parrain.id)).toBe(apresPremiere);
    expect((await avantages(parrainage)).filter((l) => l.nature !== "essai_filleul")).toHaveLength(1);
  });

  it("ne récompense pas un parrain archivé", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    await db.query("reset role");
    await db.query("select set_config('gerimmo.systeme','on',true)");
    await db.query("update public.organizations set status = 'archivee' where id = $1", [parrain.id]);
    await db.query("select set_config('gerimmo.systeme','',true)");

    await convertir(filleul.id);
    expect((await avantages(parrainage)).filter((l) => l.nature !== "essai_filleul")).toHaveLength(0);
  });

  it("ne donne rien à une conversion sans parrain", async () => {
    const seule = await organisation("Sans parrain");
    await convertir(seule.id);
    expect(await avantages()).toHaveLength(0);
  });
});

describe("le registre ne se forge pas, et ne fuit pas", () => {
  it("n'est ouvert à l'écriture pour personne", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    const parrainage = await rattacher(filleul.id, compte, parrain.code);

    await simuler(compte);
    const message = await refus(
      `insert into public.avantages_parrainage
         (parrainage_id, beneficiaire_organization_id, nature, montant_cents, etat)
       values ($1, $2, 'avoir_parrain', 999999, 'a_appliquer')`,
      [parrainage, filleul.id]
    );
    expect(message).toMatch(/permission denied|droit|refus/i);
  });

  it("ne montre à chacun que ses propres avantages", async () => {
    const parrain = await organisation("Parrain");
    const filleul = await organisation("Filleul");
    const tiers = await organisation("Tiers");
    const compteFilleul = await membre(filleul.id);
    const compteTiers = await membre(tiers.id);
    await rattacher(filleul.id, compteFilleul, parrain.code);

    await simuler(compteFilleul);
    const sien = await db.query("select count(*)::int as n from public.avantages_parrainage");
    expect(sien.rows[0].n).toBe(1);

    await simuler(compteTiers);
    const autre = await db.query("select count(*)::int as n from public.avantages_parrainage");
    expect(autre.rows[0].n).toBe(0);
  });
});

describe("la base et l'écran annoncent le même chiffre", () => {
  it("ne laisse pas la promesse affichée diverger de la durée appliquée", async () => {
    // Deux sources : la base APPLIQUE, l'écran ANNONCE. Une page qui promet
    // trente jours pendant que la base en pose quatorze est un mensonge
    // commercial — ce test est le seul lien entre les deux.
    await db.query("reset role");
    const { rows } = await db.query<{ filleul: number; parrain: number }>(
      "select public.parrainage_jours_filleul() as filleul, public.parrainage_jours_parrain() as parrain"
    );
    expect(rows[0].filleul).toBe(JOURS_ESSAI_FILLEUL);
    expect(rows[0].parrain).toBe(JOURS_OFFERTS_PARRAIN);
    expect(PROMESSE_PARRAINAGE).toContain(String(JOURS_ESSAI_FILLEUL));
    expect(PROMESSE_PARRAINAGE).toContain(String(JOURS_ESSAI_ORDINAIRE));
  });
});

describe("ce que la tâche planifiée vient chercher", () => {
  it("ne liste que les avoirs qui attendent, et les marque une fois portés", async () => {
    const parrain = await organisation("Parrain payant", "active", null);
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, quantite, montant_mensuel_cents)
       values ($1, 'cus_avoir', 3, 1797)`,
      [parrain.id]
    );
    const filleul = await organisation("Filleul");
    const compte = await membre(filleul.id);
    await rattacher(filleul.id, compte, parrain.code);
    await convertir(filleul.id);

    await db.query("reset role");
    const { rows } = await db.query("select * from public.avantages_parrainage_a_appliquer()");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: parrain.id,
      montant_cents: "1797",
      stripe_customer_id: "cus_avoir",
    });

    await db.query("select public.avantage_parrainage_solde($1, $2)", [
      rows[0].avantage_id,
      "cbtxn_123",
    ]);
    const { rows: apres } = await db.query("select * from public.avantages_parrainage_a_appliquer()");
    expect(apres).toHaveLength(0);

    const { rows: ligne } = await db.query(
      "select etat, reference_externe from public.avantages_parrainage where id = $1",
      [rows[0].avantage_id]
    );
    expect(ligne[0]).toMatchObject({ etat: "applique", reference_externe: "cbtxn_123" });
  });
});
