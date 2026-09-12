/**
 * Un prélèvement qui échoue : alerte, relances, lecture seule à J+15.
 *
 * DÉCISION HUMAIN DU 12/09. La règle de la veille laissait `past_due` sans
 * effet : le produit attendait que Stripe abandonne, sans échéance connue de
 * personne. Le client a tranché — quinze jours, des courriers qui préviennent,
 * puis la saisie s'arrête jusqu'à régularisation.
 *
 * CE QUE CES TESTS TIENNENT, ET QU'AUCUN ŒIL NE VERRAIT : le compte se ferme
 * PAR LA DATE, sans tâche de nuit, et se rouvre à la seconde où Stripe redit
 * « active ». Un décalage d'un jour d'un côté prive un client d'une journée de
 * travail ; de l'autre, il laisse travailler gratuitement.
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

const DELAI = 15;

let db: Client;
let org: string;
let client: string;

async function appliquer(statut: string) {
  await db.query(`select public.abonnement_appliquer($1,$2,$3,1,now(),false)`, [
    client,
    `sub_${Math.random().toString(36).slice(2, 12)}`,
    statut,
  ]);
}

/** Fait comme si le défaut datait de N jours, sans attendre N jours. */
async function defautDepuis(jours: number) {
  await db.query(
    `update public.abonnements set paiement_en_defaut_depuis = current_date - $2::integer
      where organization_id = $1`,
    [org, jours]
  );
}

async function ecritureOuverte(): Promise<boolean> {
  const { rows } = await db.query<{ o: boolean }>(
    "select public.org_ecriture_ouverte($1) as o",
    [org]
  );
  return rows[0].o;
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
    `insert into public.organizations (name, status, email_contact)
     values ('Relance', 'active'::public.organization_status, 'compta@relance.test') returning id`
  );
  org = o.id;
  client = `cus_${Math.random().toString(36).slice(2, 12)}`;
  await db.query(
    `insert into public.abonnements (organization_id, stripe_customer_id, quantite, montant_mensuel_cents)
     values ($1, $2, 3, 1797)`,
    [org, client]
  );
});

describe("La fermeture tient à la date, pas à une tâche de nuit", () => {
  it("le jour de l'échec, tout reste ouvert", async () => {
    await appliquer("past_due");
    expect(await ecritureOuverte()).toBe(true);
  });

  it("au quatorzième jour, tout reste ouvert", async () => {
    // La veille de l'échéance, le client travaille encore : c'est ce que le
    // dernier courrier lui promet.
    await appliquer("past_due");
    await defautDepuis(DELAI - 1);
    expect(await ecritureOuverte()).toBe(true);
  });

  it("au quinzième jour, la saisie s'arrête", async () => {
    await appliquer("past_due");
    await defautDepuis(DELAI);
    expect(await ecritureOuverte()).toBe(false);
  });

  it("le statut de l'organisation ne bouge PAS : ce client paie", async () => {
    // Sa carte a échoué. Le marquer « suspendue » laisserait dans le journal la
    // même trace qu'une résiliation, et obligerait à redresser un statut au
    // moment de la régularisation.
    await appliquer("past_due");
    await defautDepuis(DELAI + 5);
    const { rows } = await db.query<{ s: string }>(
      "select status::text as s from public.organizations where id=$1",
      [org]
    );
    expect(rows[0].s).toBe("active");
    expect(await ecritureOuverte()).toBe(false);
  });

  it("l'écriture est RÉELLEMENT refusée, pas seulement annoncée", async () => {
    // `org_ecriture_ouverte` n'est qu'une lecture : ce qui compte est le
    // déclencheur posé sur les 56 tables d'organisation.
    await appliquer("past_due");
    await defautDepuis(DELAI + 1);
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query("insert into public.persons (organization_id, nom) values ($1,'Refusé')", [
        org,
      ]);
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    expect(message).toMatch(/Abonnement suspendu|n'enregistre plus de nouvelles saisies/);
  });
});

describe("Régulariser rouvre à la seconde", () => {
  it("« active » efface le défaut et rouvre l'écriture", async () => {
    await appliquer("past_due");
    await defautDepuis(DELAI + 30);
    expect(await ecritureOuverte()).toBe(false);

    await appliquer("active");
    // Aucune tâche de nuit entre les deux : la même transaction suffit. Un
    // client qui vient de mettre sa carte à jour ne doit pas attendre la nuit.
    expect(await ecritureOuverte()).toBe(true);
  });

  it("régulariser remet le compteur de relances à zéro", async () => {
    await appliquer("past_due");
    await db.query("select public.abonnement_relance_envoyee($1)", [org]);
    await appliquer("active");
    const { rows } = await db.query<{ r: number; d: string | null; j: string | null }>(
      `select relances_paiement as r, derniere_relance_le::text as d,
              paiement_en_defaut_depuis::text as j
         from public.abonnements where organization_id=$1`,
      [org]
    );
    expect(rows[0].r).toBe(0);
    expect(rows[0].d).toBeNull();
    expect(rows[0].j).toBeNull();
  });

  it("le passage en défaut et la régularisation sont tracés", async () => {
    await appliquer("past_due");
    await appliquer("active");
    const { rows } = await db.query<{ action: string }>(
      `select action from public.audit_log where organization_id=$1
        and action in ('paiement_en_defaut','paiement_regularise') order by action`,
      [org]
    );
    expect(rows.map((r) => r.action)).toEqual(["paiement_en_defaut", "paiement_regularise"]);
  });
});

describe("La date de défaut se pose une fois, pas à chaque tentative", () => {
  it("Stripe réémet past_due sans repousser l'échéance", async () => {
    // LE piège de cette règle. Stripe signale chaque tentative ratée ; réécrire
    // la date à chaque fois repousserait l'échéance indéfiniment, et les quinze
    // jours ne viendraient JAMAIS. Le compte resterait ouvert pour toujours.
    await appliquer("past_due");
    await defautDepuis(DELAI - 2);
    await appliquer("past_due");
    await appliquer("past_due");
    const { rows } = await db.query<{ j: number }>(
      `select (current_date - paiement_en_defaut_depuis) as j
         from public.abonnements where organization_id=$1`,
      [org]
    );
    expect(rows[0].j).toBe(DELAI - 2);
  });
});

describe("Les quatre courriers, et quand ils partent", () => {
  async function dues(): Promise<{ palier: number; jours_restants: number; destinataire: string }[]> {
    const { rows } = await db.query(
      "select palier, jours_restants, destinataire from public.abonnements_a_relancer(50) where organization_id=$1",
      [org]
    );
    return rows;
  }

  it("l'alerte est due le jour même", async () => {
    await appliquer("past_due");
    const r = await dues();
    expect(r).toHaveLength(1);
    expect(r[0].palier).toBe(0);
    expect(r[0].jours_restants).toBe(DELAI);
    expect(r[0].destinataire).toBe("compta@relance.test");
  });

  it("le rappel n'est dû qu'au septième jour, pas avant", async () => {
    await appliquer("past_due");
    await db.query("select public.abonnement_relance_envoyee($1)", [org]);
    await defautDepuis(6);
    // La relance du jour même a été marquée : rien n'est dû aujourd'hui.
    await db.query("update public.abonnements set derniere_relance_le = current_date - 1 where organization_id=$1", [org]);
    expect(await dues()).toHaveLength(0);

    await defautDepuis(7);
    const r = await dues();
    expect(r).toHaveLength(1);
    expect(r[0].palier).toBe(1);
  });

  it("l'avis part la veille de la fermeture, le constat le jour même", async () => {
    await appliquer("past_due");
    await db.query(
      "update public.abonnements set relances_paiement = 2, derniere_relance_le = current_date - 1 where organization_id=$1",
      [org]
    );
    await defautDepuis(DELAI - 1);
    expect((await dues())[0].palier).toBe(2);

    await db.query(
      "update public.abonnements set relances_paiement = 3, derniere_relance_le = current_date - 1 where organization_id=$1",
      [org]
    );
    await defautDepuis(DELAI);
    const r = await dues();
    expect(r[0].palier).toBe(3);
    expect(r[0].jours_restants).toBe(0);
  });

  it("après le quatrième, on n'écrit plus : quatre courriers, pas une campagne", async () => {
    await appliquer("past_due");
    await db.query(
      "update public.abonnements set relances_paiement = 4, derniere_relance_le = current_date - 1 where organization_id=$1",
      [org]
    );
    await defautDepuis(DELAI + 60);
    expect(await dues()).toHaveLength(0);
  });

  it("jamais deux courriers le même jour, même si la tâche est rejouée", async () => {
    await appliquer("past_due");
    expect(await dues()).toHaveLength(1);
    await db.query("select public.abonnement_relance_envoyee($1)", [org]);
    expect(await dues()).toHaveLength(0);
    // Et un second marquage le même jour ne brûle pas un palier de plus.
    await db.query("select public.abonnement_relance_envoyee($1)", [org]);
    const { rows } = await db.query<{ r: number }>(
      "select relances_paiement as r from public.abonnements where organization_id=$1",
      [org]
    );
    expect(rows[0].r).toBe(1);
  });

  it("sans adresse de contact, on écrit au responsable de l'organisation", async () => {
    await db.query("update public.organizations set email_contact = null where id=$1", [org]);
    const {
      rows: [{ id: compte }],
    } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
        'patron-'||gen_random_uuid()||'@relance.test','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    await db.query("select public.tache_systeme()");
    await db.query(
      "insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')",
      [compte, org]
    );
    await db.query("select set_config('gerimmo.systeme','',true)");

    await appliquer("past_due");
    const r = await dues();
    expect(r[0].destinataire).toMatch(/@relance\.test$/);
  });

  it("une organisation archivée n'est pas relancée", async () => {
    await appliquer("past_due");
    await db.query("select public.tache_systeme()");
    await db.query(
      "update public.organizations set status='archivee'::public.organization_status where id=$1",
      [org]
    );
    await db.query("select set_config('gerimmo.systeme','',true)");
    expect(await dues()).toHaveLength(0);
  });
});

describe("Ce que l'écran a le droit de dire", () => {
  it("« Mon abonnement » rend la date de fermeture et le décompte", async () => {
    await appliquer("past_due");
    await defautDepuis(10);
    // La fonction est réservée au responsable : on se donne l'identité.
    const {
      rows: [{ id: compte }],
    } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
        'vue-'||gen_random_uuid()||'@relance.test','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    await db.query("select public.tache_systeme()");
    await db.query(
      "insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct')",
      [compte, org]
    );
    await db.query("select set_config('gerimmo.systeme','',true)");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: compte, role: "authenticated" }),
    ]);

    const { rows } = await db.query<{
      paiement_en_retard: boolean;
      jours_avant_lecture_seule: number;
      lecture_seule_le: string;
    }>("select * from public.mon_abonnement($1)", [org]);
    expect(rows[0].paiement_en_retard).toBe(true);
    expect(rows[0].jours_avant_lecture_seule).toBe(DELAI - 10);
    expect(rows[0].lecture_seule_le).not.toBeNull();
    await db.query("select set_config('request.jwt.claims','',true)");
  });
});
