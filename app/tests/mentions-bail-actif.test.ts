/**
 * Un bail ne devient actif qu'avec ses MENTIONS OBLIGATOIRES — audit 2026-09-11.
 *
 * Wiki « Mentions obligatoires du bail » (modèle-type du décret n° 2015-587) :
 * la date de prise d'effet (rubriques 1 et 4) et le loyer hors charges
 * (rubrique 5) sont des mentions du contrat. Wiki « Bail », callout du
 * 2026-08-30 : le dépôt du PDF signé active le bail, et les contrôles de mise
 * en location passent AVANT le dépôt (`controler_mise_en_location`).
 *
 * Avant correction : un bail sans loyer ni date d'entrée passait les deux
 * fonctions, `activer_bail` posait lui-même `date_debut = current_date` (la
 * date d'effet devenait le jour du clic) et le premier appel de loyer sortait
 * à 0,00 € — `generer_appels_loyer` lit `coalesce(loyer_hc, 0)`.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { mentionsObligatoiresManquantes } from "../src/lib/baux";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-mentions-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Mentions obligatoires exigées à l'activation du bail", () => {
  let db: Client;
  let org: string;
  let admin: string;
  let proprietaire: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Mentions Bail','active') returning id`
    );
    org = o.id;
    admin = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [admin, org]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur'),($1,'Locataire') returning id, nom`,
      [org]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Bailleur")!.id;
    locataire = pers.rows.find((p) => p.nom === "Locataire")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Un lot prêt à louer : détention 100 %, diagnostics valides, disponible —
  // pour qu'aucun autre blocage ne masque ce que ce test mesure.
  async function lotLouable(): Promise<string> {
    await simuler(db, admin);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'9 rue des Mentions','appartement'::public.bien_type,
         '9 rue des Mentions', null, '75011','Paris',1985,false,42,2) as id`,
      [org]
    );
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims','',true)`);
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, org, proprietaire]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'dpe',current_date,current_date+365)`,
      [org, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1,$2,'erp',current_date,current_date+180)`,
      [org, bien]
    );
    await db.query(`update public.lots set etat='disponible' where id=$1`, [lot]);
    await simuler(db, admin);
    return lot;
  }

  async function docBail(): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid(),$2)
       returning id`,
      [org, admin]
    );
    return id;
  }

  // Le brouillon tel qu'il sort du formulaire : les champs facultatifs le
  // restent, seul ce qui est passé est renseigné.
  async function creerBrouillon(
    lot: string,
    champs: { loyer?: number | null; dateDebut?: string | null; locataire?: string | null } = {}
  ): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, document_signe,
                                loyer_hc, charges, jour_echeance, date_debut)
       values ($1,$2,$3,$4,$5,50,5,$6) returning id`,
      [
        org,
        lot,
        champs.locataire === undefined ? locataire : champs.locataire,
        await docBail(),
        champs.loyer === undefined ? 750 : champs.loyer,
        champs.dateDebut === undefined ? new Date().toISOString().slice(0, 10) : champs.dateDebut,
      ]
    );
    return id;
  }

  it("le brouillon incomplet reste légitime : c'est le bail qu'on prépare", async () => {
    const lot = await lotLouable();
    // Ni loyer ni date : aucun refus à la saisie — l'exigence est à l'activation
    const bail = await creerBrouillon(lot, { loyer: null, dateDebut: null });
    const { rows } = await db.query(`select etat, loyer_hc, date_debut from public.baux where id=$1`, [
      bail,
    ]);
    expect(rows[0]).toMatchObject({ etat: "brouillon", loyer_hc: null, date_debut: null });
  });

  it("la fiche sait dire, AVANT le geste, quelles mentions manquent", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: null, dateDebut: null });
    const { rows } = await db.query(
      `select unnest(public.bail_mentions_manquantes($1)) as mention`,
      [bail]
    );
    const mentions = rows.map((r) => r.mention);
    expect(mentions).toContain("Date de prise d'effet non renseignée");
    expect(mentions).toContain("Loyer hors charges non fixé");
    expect(mentions).not.toContain("Locataire principal non désigné");

    // Complété, il n'en manque plus aucune
    await db.query(`update public.baux set loyer_hc=750, date_debut=current_date where id=$1`, [bail]);
    const { rows: apres } = await db.query(
      `select coalesce(array_length(public.bail_mentions_manquantes($1),1),0) as n`,
      [bail]
    );
    expect(apres[0].n).toBe(0);
  });

  // L'écran ANNONCE (lib/baux.ts, dérivé du bail déjà chargé), la base REFUSE.
  // Deux listes, donc deux chances de diverger : ce test les épingle l'une à
  // l'autre, sur les quatre combinaisons de mentions absentes.
  it("écran et base disent exactement la même chose", async () => {
    const lot = await lotLouable();
    const cas = [
      { loyer: null, dateDebut: null },
      { loyer: null, dateDebut: "2026-10-01" },
      { loyer: 700, dateDebut: null },
      { loyer: 700, dateDebut: "2026-10-01" },
    ];
    for (const c of cas) {
      const bail = await creerBrouillon(lot, c);
      const { rows } = await db.query(
        `select coalesce(public.bail_mentions_manquantes($1), '{}') as base,
                b.locataire_principal, b.date_debut::text, b.loyer_hc
           from public.baux b where b.id = $1`,
        [bail]
      );
      const ecran = mentionsObligatoiresManquantes({
        locataire_principal: rows[0].locataire_principal,
        date_debut: rows[0].date_debut,
        loyer_hc: rows[0].loyer_hc,
      });
      expect(ecran).toEqual(rows[0].base);
      // Les brouillons s'empilent sans se gêner : un seul bail VIVANT par lot.
    }
  });

  it("sans loyer hors charges : le contrôle de mise en location et l'activation refusent", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: null });
    await attendreEchec(db, /Loyer hors charges non fixé/, `select public.controler_mise_en_location($1)`, [bail]);
    await attendreEchec(db, /Loyer hors charges non fixé/, `select public.activer_bail($1)`, [bail]);
    const { rows } = await db.query(`select etat from public.baux where id=$1`, [bail]);
    expect(rows[0].etat).toBe("brouillon");
  });

  it("sans date de prise d'effet : refus, et l'activation n'invente plus la date du jour", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { dateDebut: null });
    await attendreEchec(db, /Date de prise d'effet non renseignée/, `select public.activer_bail($1)`, [bail]);
    const { rows } = await db.query(`select etat, date_debut from public.baux where id=$1`, [bail]);
    // Le repli « date_debut = current_date » du 2026-08-02 a disparu : rien n'est
    // écrit, la date d'effet reste à saisir.
    expect(rows[0]).toMatchObject({ etat: "brouillon", date_debut: null });
  });

  it("l'écriture directe de l'état ne contourne pas la règle (la policy baux_update l'autorise)", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: null, dateDebut: null });
    await attendreEchec(
      db,
      /Mentions obligatoires du bail manquantes/,
      `update public.baux set etat='actif' where id=$1`,
      [bail]
    );
  });

  it("LE GESTE LÉGITIME : le brouillon complet s'active, et garde SA date d'effet", async () => {
    const lot = await lotLouable();
    // Entrée dans une semaine : la date du contrat, pas celle du dépôt
    const bail = await creerBrouillon(lot, { loyer: 750, dateDebut: null });
    await db.query(`update public.baux set date_debut = current_date + 7 where id=$1`, [bail]);

    await db.query(`select public.controler_mise_en_location($1)`, [bail]);
    await db.query(`select public.activer_bail($1)`, [bail]);

    const { rows } = await db.query(
      `select b.etat, b.loyer_hc, b.date_debut, l.etat as etat_lot,
              (b.date_debut = current_date + 7) as date_preservee
         from public.baux b join public.lots l on l.id = b.lot_id where b.id=$1`,
      [bail]
    );
    expect(rows[0]).toMatchObject({ etat: "actif", etat_lot: "loue", date_preservee: true });
    expect(Number(rows[0].loyer_hc)).toBe(750);
  });

  it("l'appel de loyer à 0,00 € n'est plus atteignable par l'activation", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: null });
    await attendreEchec(db, /Mentions obligatoires/, `select public.activer_bail($1)`, [bail]);

    // Le loyer fixé, l'échéancier sort au bon montant
    await db.query(`update public.baux set loyer_hc = 640 where id=$1`, [bail]);
    await db.query(`select public.activer_bail($1)`, [bail]);
    await db.query(`select public.generer_appels_loyer($1)`, [bail]);
    const { rows } = await db.query(
      `select loyer_hc from public.appels_loyer where bail_id=$1 order by periode limit 1`,
      [bail]
    );
    expect(Number(rows[0].loyer_hc)).toBeGreaterThan(0);
  });

  it("un congé annulé ramène en « actif » un bail ancien et incomplet — la garde ne vise que l'activation", async () => {
    const lot = await lotLouable();
    // Donnée d'avant la règle : un bail vivant sans loyer, inséré tel quel
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut)
       values ($1,$2,$3,'actif', current_date - 200) returning id`,
      [org, lot, locataire]
    );
    await db.query(`update public.lots set etat='loue' where id=$1`, [lot]);
    await db.query(
      `select public.enregistrer_conge($1,'locataire'::public.conge_par, current_date, 3::smallint)`,
      [bail]
    );
    // Le locataire se rétracte : rien ne doit l'en empêcher, ce n'est pas une
    // conclusion de contrat — sinon la correction casserait l'existant.
    await db.query(`select public.annuler_conge($1, 'rétractation')`, [bail]);
    const { rows } = await db.query(`select etat, loyer_hc from public.baux where id=$1`, [bail]);
    expect(rows[0]).toMatchObject({ etat: "actif", loyer_hc: null });
  });
  // ───────────────────────────────────────────────────────────────────────
  // Vérification adversariale du 2026-09-11 : la garde ci-dessus ne regardait
  // que l'état PRÉCÉDENT. Un saut de plus le lui faisait oublier — deux
  // requêtes PostgREST suffisaient à rendre actif un brouillon sans mentions.
  // ───────────────────────────────────────────────────────────────────────

  it("le détour par le préavis ne blanchit pas un brouillon", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: null, dateDebut: null });
    // RM-A5.1 (wiki « Machines à états et événements ») : « brouillon → préavis »
    // n'est pas une transition listée — et `enregistrer_conge` refuse déjà un
    // congé sur autre chose qu'un bail actif.
    await attendreEchec(
      db,
      /Un brouillon ne passe pas en préavis/,
      `update public.baux set etat='preavis' where id=$1`,
      [bail]
    );
    const { rows } = await db.query(`select etat from public.baux where id=$1`, [bail]);
    expect(rows[0].etat).toBe("brouillon");
  });

  it("le détour par la clôture ne blanchit pas un brouillon : un bail terminé ne revit pas", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: null, dateDebut: null });
    // L'entrée en « terminé » reste possible (reprise d'historique) ; c'est la
    // SORTIE qui est fermée — RM-A5.2 « un état terminal n'a aucune sortie »,
    // wiki « Bail » : « terminé → actif (nouveau bail requis) ».
    await db.query(`update public.baux set etat='termine' where id=$1`, [bail]);
    await attendreEchec(
      db,
      /Un bail terminé ne revit pas/,
      `update public.baux set etat='actif' where id=$1`,
      [bail]
    );
    await attendreEchec(
      db,
      /Un bail terminé ne revit pas/,
      `update public.baux set etat='preavis' where id=$1`,
      [bail]
    );
    const { rows } = await db.query(`select etat, loyer_hc from public.baux where id=$1`, [bail]);
    expect(rows[0]).toMatchObject({ etat: "termine", loyer_hc: null });
  });

  it("un bail en cours ne perd pas les mentions qu'il porte", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: 700, dateDebut: null });
    await db.query(`update public.baux set date_debut = current_date where id=$1`, [bail]);
    await db.query(`select public.activer_bail($1)`, [bail]);

    // Le vidage après coup ramenait l'appel de loyer à 0,00 € — l'état de fin
    // que la garde visait, atteint par l'autre bout.
    await attendreEchec(
      db,
      /un bail en cours ne les perd pas/,
      `update public.baux set loyer_hc = null where id=$1`,
      [bail]
    );
    await attendreEchec(
      db,
      /un bail en cours ne les perd pas/,
      `update public.baux set date_debut = null where id=$1`,
      [bail]
    );

    await db.query(`select public.generer_appels_loyer($1)`, [bail]);
    const { rows } = await db.query(
      `select loyer_hc from public.appels_loyer where bail_id=$1 order by periode limit 1`,
      [bail]
    );
    expect(Number(rows[0].loyer_hc)).toBeGreaterThan(0);
  });

  it("LE GESTE LÉGITIME : un bail ancien et incomplet se COMPLÈTE toujours", async () => {
    const lot = await lotLouable();
    // Donnée d'avant la règle : vivante, sans loyer. Le pilote doit pouvoir la
    // réparer — la garde n'interdit que le retrait, jamais l'ajout.
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, jour_echeance)
       values ($1,$2,$3,'actif', current_date - 300, 5) returning id`,
      [org, lot, locataire]
    );
    await db.query(`update public.lots set etat='loue' where id=$1`, [lot]);
    await db.query(`update public.baux set loyer_hc = 620 where id=$1`, [bail]);
    const { rows } = await db.query(`select etat, loyer_hc from public.baux where id=$1`, [bail]);
    expect(rows[0].etat).toBe("actif");
    expect(Number(rows[0].loyer_hc)).toBe(620);
  });

  it("LE GESTE LÉGITIME : le cycle complet du bail passe toujours, verrou compris", async () => {
    const lot = await lotLouable();
    const bail = await creerBrouillon(lot, { loyer: 700, dateDebut: null });
    await db.query(`update public.baux set date_debut = current_date + 30 where id=$1`, [bail]);
    await db.query(`select public.activer_bail($1)`, [bail]);

    // Corriger : retour en brouillon, puis réactivation (le PDF est détaché)
    await db.query(`select public.devalider_bail($1)`, [bail]);
    await db.query(`update public.baux set document_signe = $2 where id=$1`, [bail, await docBail()]);
    await db.query(`select public.activer_bail($1)`, [bail]);

    // Congé, rétractation, congé de nouveau, puis clôture sur EDL de sortie
    await db.query(
      `select public.enregistrer_conge($1,'locataire'::public.conge_par, current_date, 3::smallint)`,
      [bail]
    );
    await db.query(`select public.annuler_conge($1, 'rétractation')`, [bail]);
    await db.query(
      `select public.enregistrer_conge($1,'locataire'::public.conge_par, current_date, 3::smallint)`,
      [bail]
    );
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims','',true)`);
    await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type, etat, date_edl)
       values ($1,$2,'sortie','signe', current_date)`,
      [org, bail]
    );
    await db.query(`update public.baux set date_fin = current_date where id=$1`, [bail]);
    await simuler(db, admin);
    await db.query(`select public.terminer_bail($1)`, [bail]);

    const { rows } = await db.query(
      `select b.etat, l.etat as lot from public.baux b join public.lots l on l.id=b.lot_id where b.id=$1`,
      [bail]
    );
    expect(rows[0]).toMatchObject({ etat: "termine", lot: "disponible" });
  });
});
