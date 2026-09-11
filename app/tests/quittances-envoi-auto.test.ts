/**
 * Tests d'intégration — les quittances partent sans qu'on clique (11/09).
 *
 * Le cycle mensuel crée les appels, l'encaissement émet la quittance — et
 * jusqu'ici elle attendait qu'un gérant ouvre la comptabilité et clique. La
 * tâche d'envoi ferme la boucle, mais seulement pour les agences qui ont donné
 * leur accord permanent : le référentiel veut la quittance « validée par
 * l'agence », et l'envoyer d'office contredirait cette règle.
 *
 * Ces tests gardent surtout ce que la tâche NE DOIT PAS faire : envoyer chez
 * qui n'a rien demandé, envoyer pour une agence suspendue, ou déverser
 * l'arriéré le jour où la case est cochée.
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

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-qe-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  await db.query(
    `select set_config('request.jwt.claims', $1, true)`,
    [accountId ? JSON.stringify({ sub: accountId, role: "authenticated" }) : ""]
  );
  await db.query(`set local role ${role}`);
}

async function aEnvoyer(): Promise<{ quittance_id: string; destinataire: string; est_quittance: boolean }[]> {
  await simuler(null, "postgres");
  const { rows } = await db.query(`select * from public.quittances_a_envoyer(200)`);
  return rows;
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
    `insert into public.organizations (name, status) values ('Envoi','active') returning id`
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
    `select public.creer_bien_avec_lot($1,'2 rue QE','appartement'::public.bien_type,'2 rue QE',null,'75002','Paris',1990,false,40,2) as id`,
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
     values ($1,'Martin','Claire','claire.martin@exemple.fr') returning id`,
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

  // Un mois appelé, encaissé intégralement : la quittance existe et n'est pas
  // partie (email_envoye_at null).
  await simuler(gerant);
  await db.query(`select public.generer_appels_loyer($1)`, [bail]);
  await db.query(
    `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
     values ($1,$2,750, current_date)`,
    [org, bail]
  );
  await db.query("reset role");
});

describe.skipIf(!DB_URL)("qui reçoit, et qui ne reçoit pas", () => {
  it("n'envoie rien tant que l'agence n'a pas donné son accord", async () => {
    // La colonne vaut faux à l'installation : le référentiel veut la quittance
    // « validée par l'agence », et cocher la case EST cette validation.
    const {
      rows: [{ quittances_envoi_auto: defaut }],
    } = await db.query<{ quittances_envoi_auto: boolean }>(
      `select quittances_envoi_auto from public.organizations where id=$1`,
      [org]
    );
    expect(defaut).toBe(false);
    expect(await aEnvoyer()).toEqual([]);
  });

  it("envoie dès que l'accord est donné, au bon locataire", async () => {
    await db.query("reset role");
    await db.query(`update public.organizations set quittances_envoi_auto = true where id=$1`, [org]);
    const lignes = await aEnvoyer();
    expect(lignes.length).toBe(1);
    expect(lignes[0].destinataire).toBe("claire.martin@exemple.fr");
    // Encaissement intégral : c'est une quittance, pas un reçu (RM-3.4.1).
    expect(lignes[0].est_quittance).toBe(true);
  });

  it("ne déverse pas l'arriéré le jour où la case est cochée", async () => {
    // Sans cette borne, cocher une case enverrait d'un coup deux ans de
    // courrier — à des locataires qui, pour certains, sont partis depuis.
    await db.query("reset role");
    await db.query(`update public.organizations set quittances_envoi_auto = true where id=$1`, [org]);
    await db.query(
      `update public.quittances set date_emission = current_date - 60 where bail_id=$1`,
      [bail]
    );
    expect(await aEnvoyer()).toEqual([]);
  });

  it("n'envoie plus rien pour une agence suspendue", async () => {
    await db.query("reset role");
    await db.query(`update public.organizations set quittances_envoi_auto = true where id=$1`, [org]);
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
    await db.query("reset role");
    await db.query(`update public.organizations set quittances_envoi_auto = true where id=$1`, [org]);
    await db.query(
      `update public.persons set email = null
        where id = (select locataire_principal from public.baux where id=$1)`,
      [bail]
    );
    expect(await aEnvoyer()).toEqual([]);
  });
});

describe.skipIf(!DB_URL)("le marquage d'envoi", () => {
  it("ne se pose qu'une fois : deux passes ne réécrivent pas la date", async () => {
    await db.query("reset role");
    await db.query(`update public.organizations set quittances_envoi_auto = true where id=$1`, [org]);
    const [ligne] = await aEnvoyer();

    await simuler(null, "postgres");
    const {
      rows: [{ marquer_quittance_envoyee: premier }],
    } = await db.query<{ marquer_quittance_envoyee: boolean }>(
      `select public.marquer_quittance_envoyee($1)`,
      [ligne.quittance_id]
    );
    expect(premier).toBe(true);

    const {
      rows: [{ marquer_quittance_envoyee: second }],
    } = await db.query<{ marquer_quittance_envoyee: boolean }>(
      `select public.marquer_quittance_envoyee($1)`,
      [ligne.quittance_id]
    );
    expect(second).toBe(false);

    // Et elle sort de la file.
    expect(await aEnvoyer()).toEqual([]);
  });
});

describe.skipIf(!DB_URL)("qui a le droit d'appeler", () => {
  it("les deux fonctions sont réservées au service_role", async () => {
    // Elles traversent TOUTES les organisations : un compte d'agence qui les
    // appellerait lirait les quittances des autres.
    const {
      rows: [r],
    } = await db.query<Record<string, boolean>>(`
      select has_function_privilege('authenticated','public.quittances_a_envoyer(integer)','execute') as lecture_auth,
             has_function_privilege('anon','public.quittances_a_envoyer(integer)','execute') as lecture_anon,
             has_function_privilege('service_role','public.quittances_a_envoyer(integer)','execute') as lecture_service,
             has_function_privilege('authenticated','public.marquer_quittance_envoyee(uuid)','execute') as marque_auth,
             has_function_privilege('anon','public.marquer_quittance_envoyee(uuid)','execute') as marque_anon,
             has_function_privilege('service_role','public.marquer_quittance_envoyee(uuid)','execute') as marque_service`);
    expect(r).toEqual({
      lecture_auth: false,
      lecture_anon: false,
      lecture_service: true,
      marque_auth: false,
      marque_anon: false,
      marque_service: true,
    });
  });

  it("un compte identifié se fait refuser, même depuis un rôle qui peut appeler", async () => {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: gerant, role: "authenticated" })]
    );
    await db.query("savepoint e");
    await expect(db.query(`select * from public.quittances_a_envoyer(10)`)).rejects.toThrow(
      /reserve a la tache d'envoi/
    );
    await db.query("rollback to savepoint e");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  });
});
