/**
 * Module 8 — les quatre impasses trouvées par la vérification (11/09).
 *
 * Chacune avait la même forme : un écran propose un geste que la base refuse
 * ensuite, ou pire, l'accepte et laisse le dossier dans un état d'où l'on ne
 * sort plus. Elles ont toutes été reproduites avant d'être corrigées ; ces
 * tests sont ce qui les empêche de revenir.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque cas.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;

type Decor = {
  org: string;
  gerant: string;
  locataire: string;
  artisan: string;
  incident: string;
  intervention: string;
};

async function compte(prefixe: string): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
       $1 || '-' || gen_random_uuid() || '@test.local','x', now(),
       '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
     returning id`,
    [prefixe]
  );
  return id;
}

async function agir(accountId: string | null) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated" }) : "",
  ]);
  if (accountId) await db.query("set local role authenticated");
}

/** Tentative attendue en échec, jouée sous point de reprise. */
async function refusee(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint e");
  try {
    await db.query(sql, params);
    await db.query("release savepoint e");
    return "";
  } catch (err) {
    await db.query("rollback to savepoint e");
    return (err as Error).message;
  }
}

/** De l'organisation à une mission acceptée, par les vraies RPC. */
async function monter(): Promise<Decor> {
  await db.query("reset role");
  const {
    rows: [{ id: org }],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status) values ('M8','active') returning id`
  );
  const gerant = await compte("gerant");
  const locataire = await compte("loc");
  const cptArtisan = await compte("artisan");
  await db.query(
    `insert into public.memberships (account_id, organization_id, role)
     values ($1,$3,'admin_agence'), ($2,$3,'locataire')`,
    [gerant, locataire, org]
  );

  const {
    rows: [{ id: bien }],
  } = await db.query<{ id: string }>(
    `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
     values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
    [org]
  );
  const {
    rows: [{ id: lot }],
  } = await db.query<{ id: string }>(
    `insert into public.lots (bien_id, organization_id, nom, etat)
     values ($1,$2,'Lot 1','loue') returning id`,
    [bien, org]
  );
  const {
    rows: [{ id: personne }],
  } = await db.query<{ id: string }>(
    `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
     values ($1,$2,'Martin','Léa','0600000000') returning id`,
    [org, locataire]
  );
  const {
    rows: [{ id: bail }],
  } = await db.query<{ id: string }>(
    `insert into public.baux (organization_id, lot_id, locataire_principal, etat,
       date_debut, loyer_hc, charges)
     values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
    [org, lot, personne]
  );
  const {
    rows: [{ id: incident }],
  } = await db.query<{ id: string }>(
    `insert into public.incidents (organization_id, numero, lot_id, bail_id,
       declarant_person_id, canal, categorie, description, etat, imputation,
       imputation_justification)
     values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
       'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire',
       'Joint usé par le temps') returning id`,
    [org, lot, bail, personne]
  );

  // L'artisan : validé, SIRET vérifié, du bon métier et de la bonne zone.
  const {
    rows: [{ id: artisan }],
  } = await db.query<{ id: string }>(
    `insert into public.artisans (raison_sociale, siret, telephone, account_id,
       statut_plateforme, siret_etat)
     values ('Plomberie M8', lpad((floor(random()*89999999999999)+10000000000000)::bigint::text, 14, '0'),
             '0611111111', $1, 'valide','verifie')
     returning id`,
    [cptArtisan]
  );
  await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [artisan]);
  await db.query(`insert into public.artisan_zones values ($1,'75011')`, [artisan]);
  await db.query(
    `insert into public.artisan_agences (organization_id, artisan_id) values ($1,$2)`,
    [org, artisan]
  );

  // La chaîne, par les gestes réels.
  await agir(gerant);
  const {
    rows: [{ ouvrir_consultation: consultation }],
  } = await db.query<{ ouvrir_consultation: string }>(
    `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant', true, 30)`,
    [org, incident]
  );
  const {
    rows: [{ solliciter_artisan: sollicitation }],
  } = await db.query<{ solliciter_artisan: string }>(
    `select public.solliciter_artisan($1,$2,$3)`,
    [org, consultation, artisan]
  );
  await agir(cptArtisan);
  const {
    rows: [{ deposer_devis: devis }],
  } = await db.query<{ deposer_devis: string }>(
    `select public.deposer_devis($1, 34000, 'Remplacement du flexible', current_date + 20)`,
    [sollicitation]
  );
  await agir(gerant);
  const {
    rows: [{ retenir_devis: intervention }],
  } = await db.query<{ retenir_devis: string }>(`select public.retenir_devis($1,$2)`, [org, devis]);
  await agir(cptArtisan);
  await db.query(`select public.accepter_mission($1)`, [intervention]);

  return { org, gerant, locataire, artisan: cptArtisan, incident, intervention };
}

/** Trois dates par l'artisan, à J+2, J+3, J+4. */
async function proposerTrois(d: Decor) {
  await agir(d.artisan);
  await db.query(
    `select public.proposer_creneaux($1, jsonb_build_array(
       jsonb_build_object('debut', (current_date + 2 + time '08:00')::timestamptz, 'fin', (current_date + 2 + time '10:00')::timestamptz),
       jsonb_build_object('debut', (current_date + 3 + time '08:00')::timestamptz, 'fin', (current_date + 3 + time '10:00')::timestamptz),
       jsonb_build_object('debut', (current_date + 4 + time '08:00')::timestamptz, 'fin', (current_date + 4 + time '10:00')::timestamptz)))`,
    [d.intervention]
  );
}

async function creneaux(intervention: string, statut?: string) {
  // Lecture d'inspection, hors RLS : le portail artisan ne lit aucune table
  // (tout passe par ses RPC) et la politique de `intervention_creneaux` est
  // réservée aux gestionnaires de l'organisation.
  await db.query("reset role");
  const { rows } = await db.query<{ id: string; statut: string; propose_par: string }>(
    `select id, statut, propose_par from public.intervention_creneaux
      where intervention_id=$1 ${statut ? "and statut=$2" : ""} order by debut`,
    statut ? [intervention, statut] : [intervention]
  );
  return rows;
}

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

describe.skipIf(!DB_URL)("le locataire ne fixe pas le rendez-vous tout seul", () => {
  it("refuse de retenir la date que le locataire a lui-même proposée", async () => {
    // Avant correction : accepté. La mission passait « planifiee » à une date
    // que l'artisan n'a jamais acceptée, entrait dans son agenda — et son
    // absence lui était comptée comme un rendez-vous manqué (RM-10.5.3).
    const d = await monter();
    await proposerTrois(d);

    // Le locataire refuse tout et contre-propose (RM-10.2.2).
    await agir(d.locataire);
    await db.query(
      `select public.contre_proposer_creneaux($1, $2, jsonb_build_array(
         jsonb_build_object('debut', (current_date + 8 + time '14:00')::timestamptz, 'fin', (current_date + 8 + time '16:00')::timestamptz),
         jsonb_build_object('debut', (current_date + 9 + time '14:00')::timestamptz, 'fin', (current_date + 9 + time '16:00')::timestamptz),
         jsonb_build_object('debut', (current_date + 10 + time '14:00')::timestamptz, 'fin', (current_date + 10 + time '16:00')::timestamptz)))`,
      [d.org, d.intervention]
    );

    const siens = (await creneaux(d.intervention, "propose")).filter(
      (c) => c.propose_par === "locataire"
    );
    expect(siens.length).toBe(3);

    const erreur = await refusee(`select public.choisir_creneau($1,$2)`, [d.org, siens[0].id]);
    expect(erreur).toMatch(/vous ne pouvez pas la retenir vous-même|accord de l'artisan/);

    // La mission n'a pas bougé : personne n'a de rendez-vous imposé.
    await db.query("reset role");
    const {
      rows: [m],
    } = await db.query<{ statut: string; debut_prevu: string | null }>(
      `select statut, debut_prevu from public.incident_interventions where id=$1`,
      [d.intervention]
    );
    expect(m.statut).toBe("acceptee");
    expect(m.debut_prevu).toBeNull();
  });

  it("laisse retenir une date proposée par l'artisan", async () => {
    // La garde ne doit pas déborder sur le cas normal.
    const d = await monter();
    await proposerTrois(d);
    const [premier] = await creneaux(d.intervention, "propose");
    await agir(d.locataire);
    await db.query(`select public.choisir_creneau($1,$2)`, [d.org, premier.id]);

    await db.query("reset role");
    const {
      rows: [m],
    } = await db.query<{ statut: string; debut_prevu: string | null }>(
      `select statut, debut_prevu from public.incident_interventions where id=$1`,
      [d.intervention]
    );
    expect(m.statut).toBe("planifiee");
    expect(m.debut_prevu).not.toBeNull();
  });
});

describe.skipIf(!DB_URL)("déplacer un rendez-vous reste possible", () => {
  it("reproposer libère la date retenue, et le locataire peut rechoisir", async () => {
    // Avant correction : `proposer_creneaux` laissait l'ancien créneau
    // « retenu » ; le choix suivant heurtait l'unicité « un seul retenu » et
    // l'intervention n'était plus planifiable, jamais.
    const d = await monter();
    await proposerTrois(d);
    const [premier] = await creneaux(d.intervention, "propose");
    await agir(d.locataire);
    await db.query(`select public.choisir_creneau($1,$2)`, [d.org, premier.id]);

    // L'artisan ne peut plus l'honorer : il repropose.
    await proposerTrois(d);
    await db.query("reset role");
    const {
      rows: [m],
    } = await db.query<{ statut: string; debut_prevu: string | null }>(
      `select statut, debut_prevu from public.incident_interventions where id=$1`,
      [d.intervention]
    );
    // Le rendez-vous est défait, pas « conservé jusqu'à un nouveau choix ».
    expect(m.statut).toBe("acceptee");
    expect(m.debut_prevu).toBeNull();
    expect((await creneaux(d.intervention, "retenu")).length).toBe(0);

    // Et le nouveau choix aboutit — c'est tout l'enjeu.
    const nouveaux = await creneaux(d.intervention, "propose");
    expect(nouveaux.length).toBe(3);
    await agir(d.locataire);
    await db.query(`select public.choisir_creneau($1,$2)`, [d.org, nouveaux[0].id]);
    await db.query("reset role");
    const {
      rows: [apres],
    } = await db.query<{ statut: string }>(
      `select statut from public.incident_interventions where id=$1`,
      [d.intervention]
    );
    expect(apres.statut).toBe("planifiee");
  });
});

describe.skipIf(!DB_URL)("retirer une mission n'enterre pas l'incident", () => {
  it("l'annulation libère le devis : un autre peut être retenu", async () => {
    // Avant correction : le devis restait « retenu », l'index unique
    // `incident_devis_un_retenu` interdisait tout nouveau choix, et l'écran
    // promettait pourtant « l'incident revient en attente d'affectation ».
    const d = await monter();
    await agir(d.gerant);
    await db.query(`select public.annuler_mission($1,$2,'Erreur d''affectation')`, [
      d.org,
      d.intervention,
    ]);

    await db.query("reset role");
    const {
      rows: [devis],
    } = await db.query<{ statut: string }>(
      `select statut from public.incident_devis where incident_id=$1 order by depose_le desc limit 1`,
      [d.incident]
    );
    expect(devis.statut).toBe("annule");
    const {
      rows: [inc],
    } = await db.query<{ etat: string }>(`select etat from public.incidents where id=$1`, [
      d.incident,
    ]);
    expect(inc.etat).toBe("qualifie");

    // Le parcours de réaffectation va jusqu'au bout, sans message de contrainte.
    await agir(d.gerant);
    const {
      rows: [{ ouvrir_consultation: c2 }],
    } = await db.query<{ ouvrir_consultation: string }>(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant', true, 30)`,
      [d.org, d.incident]
    );
    const {
      rows: [{ artisan_id }],
    } = await db.query<{ artisan_id: string }>(
      `select id as artisan_id from public.artisans where account_id=$1`,
      [d.artisan]
    );
    const {
      rows: [{ solliciter_artisan: s2 }],
    } = await db.query<{ solliciter_artisan: string }>(
      `select public.solliciter_artisan($1,$2,$3)`,
      [d.org, c2, artisan_id]
    );
    await agir(d.artisan);
    const {
      rows: [{ deposer_devis: dv2 }],
    } = await db.query<{ deposer_devis: string }>(
      `select public.deposer_devis($1, 29000, 'Seconde entreprise', current_date + 20)`,
      [s2]
    );
    await agir(d.gerant);
    const {
      rows: [{ retenir_devis: iv2 }],
    } = await db.query<{ retenir_devis: string }>(`select public.retenir_devis($1,$2)`, [
      d.org,
      dv2,
    ]);
    expect(iv2).toBeTruthy();
  });
});

describe.skipIf(!DB_URL)("la file « à noter » peut se vider", () => {
  it("une note retirée ne remet pas l'intervention dans la file", async () => {
    // Avant correction : la file excluait les notes `retiree_le is null`, donc
    // une note retirée après contestation y réinscrivait l'intervention — que
    // l'unicité en base interdit pourtant de remplacer. Bandeau permanent,
    // menant à un dossier où il n'y a rien à faire.
    const d = await monter();
    await db.query("reset role");
    const {
      rows: [{ artisan_id }],
    } = await db.query<{ artisan_id: string }>(
      `select id as artisan_id from public.artisans where account_id=$1`,
      [d.artisan]
    );
    // Terminer exige le compte rendu ET la photo du travail réalisé
    // (RM-7.5.1, RM-7.5.2) : le déclencheur de clôture les vérifie.
    await db.query(
      `insert into public.intervention_comptes_rendus (organization_id, intervention_id,
         artisan_id, travaux_realises)
       values ($1,$2,$3,'Flexible remplacé')`,
      [d.org, d.intervention, artisan_id]
    );
    const {
      rows: [{ id: doc }],
    } = await db.query<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type,
         taille_octets, empreinte)
       values ($1::uuid,'photo_incident','Après', $1::uuid::text||'/'||gen_random_uuid()||'.jpg',
               'image/jpeg', 10, 'm8-'||gen_random_uuid()) returning id`,
      [d.org]
    );
    await db.query(
      `insert into public.intervention_photos (organization_id, intervention_id, document_id, moment)
       values ($1,$2,$3,'apres')`,
      [d.org, d.intervention, doc]
    );
    await db.query(
      `update public.incident_interventions set statut='terminee', terminee_le=now() where id=$1`,
      [d.intervention]
    );
    await db.query(
      `insert into public.artisan_evaluations (organization_id, intervention_id, artisan_id,
         source, note_globale, note_qualite, note_delai, note_prix, evaluateur_account_id)
       values ($1,$2,$3,'gerant',4,4,4,4,$4)`,
      [d.org, d.intervention, artisan_id, d.gerant]
    );

    const file = async () => {
      await agir(d.gerant);
      const { rows } = await db.query(`select * from public.interventions_a_evaluer($1)`, [d.org]);
      return rows.length;
    };
    expect(await file()).toBe(0);

    // La plateforme retire la note après contestation.
    await db.query("reset role");
    await db.query(
      `update public.artisan_evaluations set retiree_le = now(), retrait_motif = 'Contestation fondée'
        where intervention_id = $1 and source='gerant'`,
      [d.intervention]
    );
    // La file reste vide : le gérant ne peut pas en redéposer une.
    expect(await file()).toBe(0);
  });
});
