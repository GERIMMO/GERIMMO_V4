/**
 * Audit du 13/10/2026, CHN-01, décision D21 (option A) : les créneaux que personne n'a refusés mais qu'un choix a
 * écartés ne sont plus enregistrés « refusés » : ils deviennent « caducs ». Seuls les refus réels comptent pour
 * l'arbitrage à six refus : « Aucun ne me convient » du locataire, et le refus des dates du locataire par l'artisan.
 *
 * Avant la correction, chaque choix (le locataire retient une date de l'artisan, ou l'artisan retient une date du
 * locataire) passait les autres créneaux à « refuse » : après trois reports, l'artisan était bloqué et l'écran
 * imputait au locataire des refus qu'il n'avait jamais faits.
 *
 * Appels réels sous RLS, scénarios indépendants, transaction finale annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Créneaux non retenus : caducs, pas refusés (CHN-01, D21-A)", () => {
  let db: Client;
  let org = "";
  let gerant = "", cptArtisan = "", cptLoc = "";
  let artisan = "";
  let incident = "";

  const connecte = (id: string) =>
    db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [id]
    );
  const role = (r: string) => db.query(r === "reset" ? "reset role" : `set local role ${r}`);
  const agir = async (compte: string) => {
    await role("reset");
    await connecte(compte);
    await role("authenticated");
  };
  const enTantQuePostgres = () => role("reset");

  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  };

  // Trois créneaux, à N jours, de 4 h chacun.
  const creneauxA = (jours: number[]) =>
    JSON.stringify(
      jours.map((j) => ({
        debut: new Date(Date.now() + j * 86400000).toISOString(),
        fin: new Date(Date.now() + j * 86400000 + 4 * 3600000).toISOString(),
      }))
    );

  async function nouveauCompte(prefixe: string): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  }

  /** Un lot loué, son bail actif, son locataire, et un incident qualifié. */
  async function parc(organisation: string, compte: string) {
    await enTantQuePostgres();
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
      [organisation]
    );
    const { rows: [unLot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat)
       values ($1,$2,'Lot 1','loue') returning id`,
      [bien.id, organisation]
    );
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`,
      [organisation, compte]
    );
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat,
         date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
      [organisation, unLot.id, personne.id]
    );
    const { rows: [inc] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id,
         declarant_person_id, canal, categorie, description, etat, imputation,
         imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire',
         'Joint usé par le temps') returning id`,
      [organisation, unLot.id, bail.id, personne.id]
    );
    return { lot: unLot.id as string, incident: inc.id as string, bail: bail.id as string };
  }

  /** Ouvre la consultation, sollicite, dépose le devis, le retient : la mission est confiée. */
  async function confierLaMission(inc: string): Promise<string> {
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) as id`,
      [org, inc]
    );
    const { rows: [{ id: sollicitation }] } = await db.query(
      `select public.solliciter_artisan($1,$2,$3) as id`,
      [org, consultation, artisan]
    );
    await agir(cptArtisan);
    const { rows: [{ id: devis }] } = await db.query(
      `select public.deposer_devis_structure($1, jsonb_build_array(jsonb_build_object('libelle','Travaux','quantite',1,'prix_unitaire_ht_cents',48000,'tva_bps',0)), 'Diagnostic de test', 'Remplacement du joint et du siphon', 'Sous 7 jours', 'Une journée', null, null) as id`,
      [sollicitation]
    );
    await agir(gerant);
    const { rows: [{ id }] } = await db.query(`select public.retenir_devis($1,$2) as id`, [org, devis]);
    return id as string;
  }

  /** La mission acceptée, avec trois créneaux de l'artisan en attente du locataire. */
  async function missionAvecCreneaux() {
    const mission = await confierLaMission(incident);
    await agir(cptArtisan);
    await db.query(`select public.accepter_mission($1)`, [mission]);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [mission, creneauxA([3, 4, 5])]);
    return mission;
  }

  /** Le locataire retient le premier créneau proposé par l'artisan. */
  async function locataireRetient(mission: string) {
    await agir(cptLoc);
    const { rows } = await db.query(
      `select * from public.mes_creneaux_locataire($1) where intervention_id = $2 order by debut`,
      [org, mission]
    );
    await db.query(`select public.choisir_creneau($1,$2)`, [org, rows[0].creneau_id]);
  }

  const repartition = async (mission: string) => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select propose_par::text as par, statut::text as statut, count(*)::int as n,
              count(refuse_le)::int as avec_date_de_refus
       from public.intervention_creneaux where intervention_id = $1 group by 1, 2`,
      [mission]
    );
    return rows.sort((a: { par: string; statut: string }, b: { par: string; statut: string }) =>
      (a.par + a.statut).localeCompare(b.par + b.statut)
    );
  };
  const nbRefuses = async (mission: string) => {
    await enTantQuePostgres();
    const { rows: [r] } = await db.query(
      `select count(*)::int as n from public.intervention_creneaux where intervention_id = $1 and statut = 'refuse'`,
      [mission]
    );
    return r.n as number;
  };
  const alerteArbitrage = async (mission: string) => {
    await enTantQuePostgres();
    return (await db.query(`select id from public.alerts where type = 'creneaux_arbitrage' and origine_id = $1`, [mission])).rowCount;
  };
  /** Ce que lit l'écran de suivi du locataire. */
  const suiviLocataire = async (mission: string) => {
    await agir(cptLoc);
    const { rows } = await db.query(`select * from public.mon_suivi_intervention($1) where intervention_id = $2`, [org, mission]);
    return rows[0] as { creneaux_refuses: number; arbitrage: boolean; etape: string };
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status) values ('Créneaux caducs — Agence','active') returning id`
    );
    org = orgs[0].id;
    gerant = await nouveauCompte("gerant");
    cptArtisan = await nouveauCompte("artisan");
    cptLoc = await nouveauCompte("loc");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence'),($3,$2,'locataire')`,
      [gerant, org, cptLoc]
    );
    incident = (await parc(org, cptLoc)).incident;

    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email,
         statut_plateforme, siret_etat, visibilite, account_id)
       values ('Plomberie Durand','12345678901234','0611111111','d@test.local',
         'valide','verifie','publique',$1) returning id`,
      [cptArtisan]
    );
    artisan = a.id;
    await db.query(`insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)`, [org, artisan]);
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [artisan]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [artisan]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,'emp-dec', current_date + 300)`,
      [artisan, `artisans/${artisan}/decennale.pdf`]
    );
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  beforeEach(async () => {
    await enTantQuePostgres();
    await db.query("savepoint scenario");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint scenario");
  });

  it("le locataire retient une date de l'artisan : les deux autres deviennent caduques, pas refusées", async () => {
    const mission = await missionAvecCreneaux();
    await locataireRetient(mission);
    expect(await repartition(mission)).toEqual([
      { par: "artisan", statut: "caduc", n: 2, avec_date_de_refus: 0 },
      { par: "artisan", statut: "retenu", n: 1, avec_date_de_refus: 0 },
    ]);
    expect(await nbRefuses(mission)).toBe(0);
  });

  it("l'artisan retient une date du locataire : les autres dates du locataire deviennent caduques", async () => {
    const mission = await missionAvecCreneaux();
    await agir(cptLoc);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`, [org, mission, creneauxA([10, 11, 12])]);
    await agir(cptArtisan);
    const { rows } = await db.query(
      `select * from public.mes_creneaux_artisan($1) where propose_par = 'locataire' order by debut`,
      [mission]
    );
    await db.query(`select public.accepter_creneau_locataire($1)`, [rows[0].creneau_id]);
    expect(await repartition(mission)).toEqual([
      // Les trois créneaux de l'artisan ont, eux, été refusés par la contre-proposition : un refus réel.
      { par: "artisan", statut: "refuse", n: 3, avec_date_de_refus: 3 },
      { par: "locataire", statut: "caduc", n: 2, avec_date_de_refus: 0 },
      { par: "locataire", statut: "retenu", n: 1, avec_date_de_refus: 0 },
    ]);
    expect(await nbRefuses(mission)).toBe(3);
  });

  it("trois cycles « choix puis report » : aucun refus, pas d'arbitrage, l'artisan peut encore déplacer (CHN-01)", async () => {
    const mission = await missionAvecCreneaux();
    for (let cycle = 1; cycle <= 3; cycle++) {
      await locataireRetient(mission);
      expect(await nbRefuses(mission)).toBe(0);
      // L'artisan déplace le rendez-vous : trois nouvelles dates, la précédente tombe.
      await agir(cptArtisan);
      await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [mission, creneauxA([20 + cycle * 3, 21 + cycle * 3, 22 + cycle * 3])]);
    }
    // Quatrième report : avant la correction, six refus fantômes bloquaient ici.
    await locataireRetient(mission);
    await agir(cptArtisan);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [mission, creneauxA([60, 61, 62])]);

    expect(await nbRefuses(mission)).toBe(0);
    expect(await alerteArbitrage(mission)).toBe(0);
    const suivi = await suiviLocataire(mission);
    expect(suivi.creneaux_refuses).toBe(0);
    expect(suivi.arbitrage).toBe(false);
    expect(suivi.etape).toBe("creneau_a_choisir");
  });

  it("les refus réels comptent toujours : « Aucun ne me convient » puis le refus des dates du locataire mènent à l'arbitrage", async () => {
    const mission = await missionAvecCreneaux();
    await agir(cptLoc);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`, [org, mission, creneauxA([10, 11, 12])]);
    expect(await nbRefuses(mission)).toBe(3);
    expect((await suiviLocataire(mission)).arbitrage).toBe(false);
    await agir(cptArtisan);
    await db.query(`select public.refuser_creneaux_locataire($1,'Dates incompatibles pour le test')`, [mission]);
    expect(await nbRefuses(mission)).toBe(6);
    expect(await alerteArbitrage(mission)).toBe(1);
    const suivi = await suiviLocataire(mission);
    expect(suivi.creneaux_refuses).toBe(6);
    expect(suivi.arbitrage).toBe(true);
    // Le sixième refus bloque toujours un nouvel envoi de l'artisan.
    await agir(cptArtisan);
    await expect(essai(`select public.proposer_creneaux($1,$2::jsonb)`, [mission, creneauxA([30, 31, 32])])).rejects.toThrow();
  });

  it("un choix suivi d'un refus réel ne compte que le refus réel (les créneaux écartés par le choix ne s'ajoutent pas)", async () => {
    const mission = await missionAvecCreneaux();
    await locataireRetient(mission);
    await agir(cptArtisan);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [mission, creneauxA([20, 21, 22])]);
    await agir(cptLoc);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`, [org, mission, creneauxA([30, 31, 32])]);
    // Trois refus réels (les dates du deuxième tour) ; les deux dates écartées au premier choix sont caduques.
    expect(await nbRefuses(mission)).toBe(3);
    expect(await alerteArbitrage(mission)).toBe(0);
    const suivi = await suiviLocataire(mission);
    expect(suivi.creneaux_refuses).toBe(3);
    expect(suivi.arbitrage).toBe(false);
  });
});
