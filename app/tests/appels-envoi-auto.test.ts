/**
 * Tests d'intégration — l'avis d'échéance part au locataire (18/09).
 *
 * Le cycle mensuel crée l'appel ; jusqu'ici il restait muet dans l'espace du
 * locataire, qui découvrait sa dette à la relance. La tâche d'envoi ferme ce
 * dernier maillon, mais seulement pour les agences qui ont donné leur accord.
 *
 * Ces tests gardent surtout ce que la tâche NE DOIT PAS faire : écrire au nom
 * d'une agence qui n'a rien demandé, déverser l'arriéré le jour où la case est
 * cochée, et — la faute qu'aucune explication ne rattrape — RÉCLAMER UN LOYER
 * DÉJÀ PAYÉ.
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
let gerant: string;
let bail: string;

type LigneAvis = {
  appel_id: string;
  organization_id: string;
  destinataire: string;
  prenom: string | null;
  emetteur: string;
  loyer_hc: string;
  charges: string;
  montant_du: string;
  reste_du: string;
  date_echeance: string;
  prorata: boolean;
  arriere: string;
};

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-ae-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }) : "",
  ]);
  await db.query(`set local role ${role}`);
}

async function aEnvoyer(): Promise<LigneAvis[]> {
  await simuler(null, "postgres");
  const { rows } = await db.query<LigneAvis>(`select * from public.appels_a_envoyer(200)`);
  return rows;
}

/** L'accord permanent de l'agence — le geste qui débloque tout le reste. */
async function donnerLAccord() {
  await db.query("reset role");
  await db.query(`update public.organizations set appels_envoi_auto = true where id=$1`, [org]);
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
  await db.query("reset role");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status) values ('Avis','active') returning id`
  );
  org = id;
  gerant = await creerUtilisateur();
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
    [gerant, org]
  );

  await simuler(gerant);
  const {
    rows: [{ id: bien }],
  } = await db.query<{ id: string }>(
    `select public.creer_bien_avec_lot($1,'7 rue AE','appartement'::public.bien_type,'7 rue AE',null,'75003','Paris',1990,false,42,2) as id`,
    [org]
  );
  const {
    rows: [{ id: lot }],
  } = await db.query<{ id: string }>(`select id from public.lots where bien_id=$1`, [bien]);
  await db.query("reset role");
  const {
    rows: [{ id: loc }],
  } = await db.query<{ id: string }>(
    `insert into public.persons (organization_id, nom, prenom, email)
     values ($1,'Bernard','Julie','julie.bernard@exemple.fr') returning id`,
    [org]
  );
  const {
    rows: [{ id: b }],
  } = await db.query<{ id: string }>(
    `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges,
                              etat, date_debut, jour_echeance)
     values ($1,$2,$3,700,50,'actif', date_trunc('month', current_date)::date, 1) returning id`,
    [org, lot, loc]
  );
  bail = b;

  // Un mois appelé, RIEN d'encaissé : c'est exactement la situation que l'avis
  // d'échéance sert à annoncer.
  await simuler(gerant);
  await db.query(`select public.generer_appels_loyer($1)`, [bail]);
  await db.query("reset role");
});

describe.skipIf(!DB_URL)("qui reçoit, et qui ne reçoit pas", () => {
  it("n'écrit à personne tant que l'agence n'a pas donné son accord", async () => {
    const {
      rows: [{ appels_envoi_auto: defaut }],
    } = await db.query<{ appels_envoi_auto: boolean }>(
      `select appels_envoi_auto from public.organizations where id=$1`,
      [org]
    );
    expect(defaut).toBe(false);
    expect(await aEnvoyer()).toEqual([]);
  });

  it("annonce le terme au bon locataire, avec son détail", async () => {
    await donnerLAccord();
    const lignes = await aEnvoyer();
    expect(lignes.length).toBe(1);
    expect(lignes[0].destinataire).toBe("julie.bernard@exemple.fr");
    expect(lignes[0].prenom).toBe("Julie");
    expect(lignes[0].emetteur).toBe("Avis");
    // Loyer et charges restent séparés jusque dans l'e-mail (quittance conforme).
    expect(Number(lignes[0].loyer_hc)).toBe(700);
    expect(Number(lignes[0].charges)).toBe(50);
    expect(Number(lignes[0].reste_du)).toBe(750);
    // Rien derrière : le locataire est à jour.
    expect(Number(lignes[0].arriere)).toBe(0);
  });

  it("ne réclame jamais un terme déjà réglé", async () => {
    // La faute qu'aucune explication ne rattrape. C'est l'échéancier qui
    // tranche — la même vue que l'écran et que l'alerte d'impayé.
    await donnerLAccord();
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,750, current_date)`,
      [org, bail]
    );
    expect(await aEnvoyer()).toEqual([]);
  });

  it("annonce le reste dû, pas le montant appelé, sur un terme partiellement réglé", async () => {
    await donnerLAccord();
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,200, current_date)`,
      [org, bail]
    );
    const [ligne] = await aEnvoyer();
    expect(Number(ligne.montant_du)).toBe(750);
    expect(Number(ligne.reste_du)).toBe(550);
  });

  it("dit le solde antérieur au lieu de le taire", async () => {
    // Un avis qui ignore une dette en cours laisse croire au locataire qu'il
    // sera à jour dès qu'il aura payé le mois.
    await donnerLAccord();
    // Le mois suivant est appelé à son tour, le premier restant impayé.
    await db.query("reset role");
    await db.query(
      `update public.appels_loyer
          set periode = periode - interval '1 month',
              date_echeance = date_echeance - interval '1 month',
              email_envoye_at = now()
        where bail_id = $1`,
      [bail]
    );
    await simuler(gerant);
    await db.query(`select public.generer_appels_loyer($1)`, [bail]);
    await db.query("reset role");

    const lignes = await aEnvoyer();
    expect(lignes.length).toBe(1);
    expect(Number(lignes[0].arriere)).toBe(750);
  });

  it("ne déverse pas l'arriéré le jour où la case est cochée", async () => {
    await donnerLAccord();
    await db.query(
      `update public.appels_loyer set created_at = now() - interval '60 days' where bail_id=$1`,
      [bail]
    );
    expect(await aEnvoyer()).toEqual([]);
  });

  it("n'écrit plus rien pour une agence suspendue", async () => {
    await donnerLAccord();
    const sa = await creerUtilisateur();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`,
      [sa]
    );
    await simuler(sa);
    await db.query(
      `update public.organizations set status='suspendue'::public.organization_status where id=$1`,
      [org]
    );
    expect(await aEnvoyer()).toEqual([]);
  });

  it("saute le locataire sans adresse au lieu d'échouer", async () => {
    await donnerLAccord();
    await db.query(
      `update public.persons set email = null
        where id = (select locataire_principal from public.baux where id=$1)`,
      [bail]
    );
    expect(await aEnvoyer()).toEqual([]);
  });
});

describe.skipIf(!DB_URL)("la liste est réservée à la tâche", () => {
  // Deux barrières, et c'est la PREMIÈRE qui parle ici : le droit d'exécution
  // est retiré à `authenticated`, si bien qu'un compte d'agence est refusé
  // avant même d'entrer dans la fonction (« permission denied »). La garde
  // écrite dans le corps sert au cran d'après — un rôle qui aurait le droit
  // d'exécuter mais porterait une identité d'agence. On vérifie donc le refus,
  // pas sa formulation.
  const refuse = /permission denied|reserve a la tache/i;

  it("un compte d'agence ne peut pas la lire : elle traverse toutes les organisations", async () => {
    await donnerLAccord();
    await simuler(gerant);
    await expect(db.query(`select * from public.appels_a_envoyer(200)`)).rejects.toThrow(refuse);
  });

  it("ni marquer un avis comme parti", async () => {
    await donnerLAccord();
    const [ligne] = await aEnvoyer();
    await simuler(gerant);
    await expect(
      db.query(`select public.marquer_appel_envoye($1)`, [ligne.appel_id])
    ).rejects.toThrow(refuse);
  });

  it("et le locataire lui-même ne peut pas les appeler", async () => {
    // Il verrait les adresses et les dettes de tous les locataires de toutes
    // les organisations.
    await donnerLAccord();
    await simuler(await creerUtilisateur());
    await expect(db.query(`select * from public.appels_a_envoyer(200)`)).rejects.toThrow(refuse);
  });
});

describe.skipIf(!DB_URL)("le marquage d'envoi", () => {
  it("ne se pose qu'une fois : deux passes ne réécrivent pas la date", async () => {
    await donnerLAccord();
    const [ligne] = await aEnvoyer();

    await simuler(null, "postgres");
    const {
      rows: [{ marquer_appel_envoye: premier }],
    } = await db.query<{ marquer_appel_envoye: boolean }>(
      `select public.marquer_appel_envoye($1)`,
      [ligne.appel_id]
    );
    expect(premier).toBe(true);
    const {
      rows: [{ marquer_appel_envoye: second }],
    } = await db.query<{ marquer_appel_envoye: boolean }>(
      `select public.marquer_appel_envoye($1)`,
      [ligne.appel_id]
    );
    expect(second).toBe(false);
  });

  it("une fois marqué, l'avis sort de la liste", async () => {
    await donnerLAccord();
    const [ligne] = await aEnvoyer();
    await simuler(null, "postgres");
    await db.query(`select public.marquer_appel_envoye($1)`, [ligne.appel_id]);
    expect(await aEnvoyer()).toEqual([]);
  });
});
