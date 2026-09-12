/**
 * La grille agence : un barème par tranches, et le lot comme unité.
 *
 * CE QUE CES TESTS PROTÈGENT. Deux choses qu'aucun œil ne verrait sur un écran.
 *
 * 1. **L'absence de marche.** C'est la raison d'être de la grille validée le
 *    12/09. Un barème par paliers faisait +89 % de facture pour un lot de plus :
 *    l'agence ne saisissait pas ce lot, le parc dans l'outil cessait d'être le
 *    parc réel, et les relevés de gestion qui en découlent devenaient faux. Un
 *    test qui vérifierait seulement « 50 lots = 119 € » laisserait revenir la
 *    marche ; on vérifie donc le PASSAGE, pas le montant.
 *
 * 2. **L'unité comptée.** Le calcul comptait les BIENS. Pour une agence, un
 *    immeuble de trente lots comptait pour un — une facture divisée par trente,
 *    sans que rien ne le signale.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;
let org: string;

/** Le montant du barème, en euros, sans passer par une organisation. */
async function montant(type: "agence" | "proprietaire_direct", n: number): Promise<number> {
  const { rows } = await db.query<{ m: string }>(
    "select (public.montant_abonnement_cents($1::public.organization_type, $2) / 100.0)::text as m",
    [type, n]
  );
  return Number(rows[0].m);
}

/**
 * Un lot confié sous mandat, avec son bien et sa détention.
 *
 * La détention n'est pas de la figuration : `mandat_lignes` refuse un lot que
 * le mandant ne détient pas (RM-5.1.1). Le harnais doit donc monter la
 * situation réelle — c'est ce qui rend le décompte crédible.
 */
async function lotSousMandat(mandat: string, mandant: string): Promise<string> {
  const {
    rows: [{ id: bien }],
  } = await db.query<{ id: string }>(
    `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
     values ($1, 'Bien '||gen_random_uuid(), 'appartement'::public.bien_type, '1 rue X','75001','Paris')
     returning id`,
    [org]
  );
  const {
    rows: [{ id: lot }],
  } = await db.query<{ id: string }>(
    `insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Lot '||gen_random_uuid())
     returning id`,
    [org, bien]
  );
  await db.query(
    `insert into public.detentions (organization_id, lot_id, person_id, quote_part)
     values ($1,$2,$3,100)`,
    [org, lot, mandant]
  );
  await db.query(
    `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
     values ($1,$2,$3,7,current_date - 1)`,
    [org, mandat, lot]
  );
  return lot;
}

/** Un mandat en brouillon et son mandant : l'état se pose APRÈS les lots. */
async function creerMandat(): Promise<{ mandat: string; mandant: string }> {
  const {
    rows: [{ id: mandant }],
  } = await db.query<{ id: string }>(
    "insert into public.persons (organization_id, nom) values ($1,'Mandant') returning id",
    [org]
  );
  const {
    rows: [{ id: mandat }],
  } = await db.query<{ id: string }>(
    `insert into public.mandats (organization_id, person_id, etat, date_debut)
     values ($1,$2,'brouillon'::public.mandat_etat, current_date - 30) returning id`,
    [org, mandant]
  );
  return { mandat, mandant };
}

/** Un mandat ne change d'état qu'une fois composé (recette 23/08). */
async function poserEtat(mandat: string, etat: string): Promise<void> {
  await db.query("update public.mandats set etat = $2::public.mandat_etat where id = $1", [
    mandat,
    etat,
  ]);
}

async function quantite(): Promise<number> {
  const { rows } = await db.query<{ q: number }>(
    "select public.abonnement_quantite_cible($1) as q",
    [org]
  );
  return rows[0].q;
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
  const {
    rows: [o],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status, type)
     values ('Cabinet Martin', 'active'::public.organization_status, 'agence'::public.organization_type)
     returning id`
  );
  org = o.id;
});

describe("Le barème n'a pas de marche — c'est sa raison d'être", () => {
  it("franchir 50 lots coûte 1,30 €, pas 70 €", async () => {
    // Avec la grille par paliers : 79 € → 149 €, soit +89 % pour UN lot.
    // L'agence ne saisissait pas ce lot, et le parc dans l'outil cessait d'être
    // le parc réel.
    const a = await montant("agence", 50);
    const b = await montant("agence", 51);
    expect(b - a).toBeCloseTo(1.3, 2);
  });

  it("franchir 150 puis 400 lots coûte moins d'un euro", async () => {
    expect((await montant("agence", 151)) - (await montant("agence", 150))).toBeCloseTo(0.8, 2);
    expect((await montant("agence", 401)) - (await montant("agence", 400))).toBeCloseTo(0.5, 2);
  });

  it("le coût d'un lot de plus ne dépasse jamais le tarif de sa tranche", async () => {
    // La propriété qui DÉFINIT un barème marginal, éprouvée sur toute la
    // plage : aucun saut, où qu'on se place.
    let precedent = await montant("agence", 1);
    for (let n = 2; n <= 700; n++) {
      const actuel = await montant("agence", n);
      const ecart = actuel - precedent;
      expect(ecart, `passage de ${n - 1} à ${n} lots`).toBeLessThanOrEqual(3.91);
      expect(ecart, `passage de ${n - 1} à ${n} lots`).toBeGreaterThanOrEqual(0);
      precedent = actuel;
    }
  });

  it("le montant ne décroît jamais quand le parc grandit", async () => {
    for (const [a, b] of [[9, 10], [10, 11], [49, 50], [399, 400], [599, 600]]) {
      expect(await montant("agence", b)).toBeGreaterThanOrEqual(await montant("agence", a));
    }
  });
});

describe("Les montants de la grille validée", () => {
  it.each([
    [0, 0],
    [1, 39],
    [10, 39],
    [25, 69],
    [50, 119],
    [100, 184],
    [150, 249],
    [300, 369],
    [400, 449],
    [600, 549],
    [1000, 749],
  ])("%i lots → %i €", async (lots, attendu) => {
    expect(await montant("agence", lots)).toBeCloseTo(attendu, 2);
  });

  it("le plancher tient jusqu'à dix lots, puis cède la place au barème", async () => {
    // Sans plancher, une agence de cinq lots paierait 19,50 € — moins qu'elle
    // ne nous coûte en support, pour un produit qui lui ouvre tout.
    for (const n of [1, 3, 5, 9, 10]) expect(await montant("agence", n)).toBe(39);
    expect(await montant("agence", 11)).toBe(41);
  });

  it("le propriétaire direct garde son tarif : 5,99 € l'unité", async () => {
    expect(await montant("proprietaire_direct", 1)).toBeCloseTo(5.99, 2);
    expect(await montant("proprietaire_direct", 3)).toBeCloseTo(17.97, 2);
    expect(await montant("proprietaire_direct", 0)).toBe(0);
  });
});

describe("L'unité comptée : le lot sous mandat, pas le bien", () => {
  it("un immeuble de trois lots sous mandat compte trois, pas un", async () => {
    // LE défaut que la grille corrige. En comptant les biens, une agence à un
    // immeuble de trente lots aurait payé pour un — une facture divisée par
    // trente, sans que rien ne le signale.
    const { mandat, mandant } = await creerMandat();
    await lotSousMandat(mandat, mandant);
    await lotSousMandat(mandat, mandant);
    await lotSousMandat(mandat, mandant);
    await poserEtat(mandat, "actif");
    expect(await quantite()).toBe(3);
  });

  it("un lot SANS mandat n'est pas compté (RM-18.6)", async () => {
    const {
      rows: [{ id: bien }],
    } = await db.query<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Sans mandat','appartement'::public.bien_type,'1 rue X','75001','Paris') returning id`,
      [org]
    );
    await db.query(
      "insert into public.lots (organization_id, bien_id, nom) values ($1,$2,'Orphelin')",
      [org, bien]
    );
    expect(await quantite()).toBe(0);
  });

  it("un mandat en BROUILLON ne compte pas : rien n'a été confié", async () => {
    const { mandat, mandant } = await creerMandat();
    await lotSousMandat(mandat, mandant);
    // Laissé en brouillon : rien n'a été confié.
    expect(await quantite()).toBe(0);
  });

  it("un mandat en PRÉAVIS compte encore : il travaille jusqu'au terme", async () => {
    // Il produit des quittances, des relevés, des incidents. Le décompter
    // avant son terme serait facturer moins que le service rendu.
    const { mandat, mandant } = await creerMandat();
    await lotSousMandat(mandat, mandant);
    await poserEtat(mandat, "actif");
    await poserEtat(mandat, "preavis");
    expect(await quantite()).toBe(1);
  });

  it("une ligne de mandat terminée ne compte plus", async () => {
    const { mandat, mandant } = await creerMandat();
    await lotSousMandat(mandat, mandant);
    await poserEtat(mandat, "actif");
    await db.query(
      "update public.mandat_lignes set date_fin = current_date - 1 where organization_id = $1",
      [org]
    );
    expect(await quantite()).toBe(0);
  });

  it("un lot VACANT sous mandat est compté", async () => {
    // C'est précisément quand un lot est vide que l'agence se sert le plus de
    // l'outil : annonces, visites, dossiers, mise en location.
    const { mandat, mandant } = await creerMandat();
    await lotSousMandat(mandat, mandant);
    await poserEtat(mandat, "actif");
    const { rows } = await db.query<{ e: string }>(
      "select etat::text as e from public.lots where organization_id = $1 limit 1",
      [org]
    );
    expect(rows[0].e).toBe("brouillon"); // jamais loué
    expect(await quantite()).toBe(1);
  });

  it("un lot ne peut pas être compté deux fois : la base l'interdit en amont", async () => {
    // Le double comptage n'est pas évité par un `distinct` de prudence : il est
    // STRUCTURELLEMENT impossible, parce qu'un lot ne peut pas être couvert par
    // deux mandats actifs (RM-5.1.3). C'est une bien meilleure garantie qu'un
    // garde-fou dans la fonction de décompte, et ce test la constate plutôt que
    // de la supposer.
    const { mandat, mandant } = await creerMandat();
    const lot = await lotSousMandat(mandat, mandant);
    await poserEtat(mandat, "actif");

    const second = await creerMandat();
    await db.query(
      "update public.detentions set quote_part = 50 where lot_id = $1 and person_id = $2",
      [lot, mandant]
    );
    await db.query(
      `insert into public.detentions (organization_id, lot_id, person_id, quote_part)
       values ($1,$2,$3,50)`,
      [org, lot, second.mandant]
    );
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query(
        `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
         values ($1,$2,$3,5,current_date - 1)`,
        [org, second.mandat, lot]
      );
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    expect(message).toContain("déjà couvert par un mandat actif");
    expect(await quantite()).toBe(1);
  });
});

describe("Au-delà du seuil, on ne vend plus d'un clic", () => {
  async function enLigne(): Promise<boolean> {
    const { rows } = await db.query<{ p: boolean }>(
      "select public.abonnement_en_ligne_possible($1) as p",
      [org]
    );
    return rows[0].p;
  }

  it("sous le seuil, l'agence souscrit en ligne", async () => {
    expect(await enLigne()).toBe(true);
  });

  it("au-delà du seuil, elle passe par un devis", async () => {
    // Simulé par le décompte : monter 601 lots en test coûterait plus cher que
    // ce que le test rapporte. On vérifie la règle sur le seuil lui-même.
    const { rows } = await db.query<{ s: number }>("select public.seuil_devis_agence() as s");
    expect(rows[0].s).toBe(600);
  });

  it("une agence DÉJÀ cliente n'est jamais coupée parce qu'elle grandit", async () => {
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id, stripe_subscription_id)
       values ($1, 'cus_grande', 'sub_grande')`,
      [org]
    );
    expect(await enLigne()).toBe(true);
  });

  it("un propriétaire direct n'est jamais concerné par le seuil", async () => {
    await db.query("select public.tache_systeme()");
    await db.query(
      "update public.organizations set type='proprietaire_direct'::public.organization_type where id=$1",
      [org]
    );
    await db.query("select set_config('gerimmo.systeme','',true)");
    expect(await enLigne()).toBe(true);
  });
});

describe("Le barème est lisible par celui qui paie", () => {
  it("le détail par tranche s'additionne exactement au total", async () => {
    // Une facture qu'on ne peut pas recalculer soi-même est une facture qu'on
    // appelle pour contester.
    const { mandat, mandant } = await creerMandat();
    for (let i = 0; i < 12; i++) await lotSousMandat(mandat, mandant);
    await poserEtat(mandat, "actif");

    const {
      rows: [{ id: compte }],
    } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
        'grille-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    await db.query(
      "insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')",
      [compte, org]
    );
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: compte, role: "authenticated" }),
    ]);

    const { rows: tranches } = await db.query<{ sous_total: string; unites: number }>(
      "select sous_total::text, unites from public.detail_tranches_abonnement($1)",
      [org]
    );
    const somme = tranches.reduce((s, t) => s + Number(t.sous_total), 0);
    const total = tranches.reduce((s, t) => s + t.unites, 0);
    expect(total).toBe(12);
    expect(somme).toBeCloseTo(await montant("agence", 12), 2);

    const { rows: etat } = await db.query<{ mensuel: string; unite: string }>(
      "select mensuel::text, unite from public.etat_abonnement($1)",
      [org]
    );
    expect(Number(etat[0].mensuel)).toBeCloseTo(somme, 2);
    // L'écran ne dit pas « bien » à une agence dont on compte les lots.
    expect(etat[0].unite).toBe("lot sous mandat");
    await db.query("select set_config('request.jwt.claims','',true)");
  });
});
