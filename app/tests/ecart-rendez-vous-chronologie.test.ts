/**
 * Audit du 13/10/2026, ART-21, décision D20 (option B) : démarrer, terminer ou facturer avant le rendez-vous confirmé
 * n'est pas bloqué (arrivées anticipées légitimes, urgences) mais l'écart est écrit à la chronologie de l'incident
 * quand le geste a lieu plus de 2 h avant `debut_prevu`.
 *
 * Avant la correction, la mission passait « en cours » puis « terminée » cinq jours avant le rendez-vous, la facture
 * était déposée, et rien dans le dossier ne disait que le locataire attendait encore l'artisan.
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

describe.skipIf(!DB_URL)("Écart avec le rendez-vous écrit à la chronologie (ART-21, D20-B)", () => {
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

  /** Ouvre la consultation, sollicite, dépose le devis (480 € TTC), le retient : la mission est confiée. */
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

  /** Mission acceptée, sans rendez-vous. */
  async function missionAcceptee() {
    const mission = await confierLaMission(incident);
    await agir(cptArtisan);
    await db.query(`select public.accepter_mission($1)`, [mission]);
    return mission;
  }

  /** Mission planifiée : le locataire retient le créneau qui commence dans `heures` heures. */
  async function missionPlanifieeDans(heures: number) {
    const mission = await missionAcceptee();
    const creneau = (h: number) => ({
      debut: new Date(Date.now() + h * 3600000).toISOString(),
      fin: new Date(Date.now() + (h + 2) * 3600000).toISOString(),
    });
    await agir(cptArtisan);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [
      mission,
      JSON.stringify([creneau(heures), creneau(heures + 24), creneau(heures + 48)]),
    ]);
    await agir(cptLoc);
    const { rows } = await db.query(
      `select * from public.mes_creneaux_locataire($1) where intervention_id = $2 order by debut`,
      [org, mission]
    );
    await db.query(`select public.choisir_creneau($1,$2)`, [org, rows[0].creneau_id]);
    return mission;
  }

  const evenement = async (type: string, mission: string) => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select details from public.incident_evenements
        where incident_id = $1 and type = $2 and details->>'intervention_id' = $3 order by created_at desc, id limit 1`,
      [incident, type, mission]
    );
    return rows[0]?.details as Record<string, unknown> | undefined;
  };
  const debutPrevu = async (mission: string) => {
    await enTantQuePostgres();
    const { rows: [r] } = await db.query(`select extract(epoch from debut_prevu) * 1000 as ms from public.incident_interventions where id = $1`, [mission]);
    return Number(r.ms);
  };

  async function photoApres(mission: string) {
    await agir(cptArtisan);
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, (select auth.uid()))`, [
      `${org}/incidents/apres-${mission}.jpg`,
    ]);
    await db.query(`select public.deposer_photo_intervention($1,'apres',$2,'image/jpeg',1000,'emp-apres')`, [
      mission,
      `${org}/incidents/apres-${mission}.jpg`,
    ]);
  }
  async function compteRendu(mission: string) {
    await photoApres(mission);
    await agir(cptArtisan);
    await db.query(
      `select public.deposer_compte_rendu($1,'Joint et siphon remplacés','Joint usé','proprietaire', 48000, false)`,
      [mission]
    );
  }
  async function facture(mission: string) {
    await agir(cptArtisan);
    const chemin = `${org}/factures-artisan/${mission}/facture.pdf`;
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, (select auth.uid()))`, [chemin]);
    await db.query(`select public.deposer_facture_artisan($1,'F-2026-14',48000,null,$2,'application/pdf',10,'emp-facture')`, [mission, chemin]);
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status) values ('Écart rendez-vous — Agence','active') returning id`
    );
    org = orgs[0].id;
    gerant = await nouveauCompte("gerant");
    cptArtisan = await nouveauCompte("artisan");
    cptLoc = await nouveauCompte("loc");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence'),($3,$2,'locataire')`,
      [gerant, org, cptLoc]
    );
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`, [org]);
    const { rows: [lot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot 1','loue') returning id`, [bien.id, org]);
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`, [org, cptLoc]);
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`, [org, lot.id, personne.id]);
    const { rows: [inc] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id, canal, categorie,
         description, etat, imputation, imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire','Joint usé par le temps')
       returning id`, [org, lot.id, bail.id, personne.id]);
    incident = inc.id;

    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email,
         statut_plateforme, siret_etat, visibilite, account_id)
       values ('Plomberie Durand','12345678901234','0611111111','d@test.local',
         'valide','verifie','publique',$1) returning id`, [cptArtisan]);
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

  it("démarrer cinq jours avant le rendez-vous n'est pas bloqué, et l'écart est écrit à la chronologie", async () => {
    const mission = await missionPlanifieeDans(5 * 24);
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);

    await enTantQuePostgres();
    const { rows: [m] } = await db.query(`select statut from public.incident_interventions where id = $1`, [mission]);
    expect(m.statut).toBe("en_cours");

    const d = await evenement("intervention_demarree", mission);
    expect(d?.avant_rendez_vous).toBe(true);
    expect(Date.parse(String(d?.debut_prevu))).toBe(await debutPrevu(mission));
    // Cinq jours moins quelques secondes d'exécution, en minutes entières.
    expect(Number(d?.ecart_minutes)).toBeGreaterThanOrEqual(7190);
    expect(Number(d?.ecart_minutes)).toBeLessThanOrEqual(7200);
    // Le détail d'origine reste.
    expect(d?.intervention_id).toBe(mission);
  });

  it("démarrer moins de deux heures avant le rendez-vous : aucun écart écrit", async () => {
    const mission = await missionPlanifieeDans(1.5);
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    const d = await evenement("intervention_demarree", mission);
    expect(d).toEqual({ intervention_id: mission });
  });

  it("la limite est à deux heures : à 2 h 30 du rendez-vous, c'est un écart", async () => {
    const mission = await missionPlanifieeDans(2.5);
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    const d = await evenement("intervention_demarree", mission);
    expect(d?.avant_rendez_vous).toBe(true);
    expect(Number(d?.ecart_minutes)).toBeGreaterThanOrEqual(148);
    expect(Number(d?.ecart_minutes)).toBeLessThanOrEqual(150);
  });

  it("la limite est à deux heures : à 1 h 50 du rendez-vous, ce n'est pas un écart", async () => {
    const mission = await missionPlanifieeDans(1 + 50 / 60);
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    expect(await evenement("intervention_demarree", mission)).toEqual({ intervention_id: mission });
  });

  it("démarrer une mission sans rendez-vous confirmé (dépannage) : rien à comparer, aucun écart", async () => {
    const mission = await missionAcceptee();
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    expect(await evenement("intervention_demarree", mission)).toEqual({ intervention_id: mission });
  });

  it("démarrer après l'heure du rendez-vous : aucun écart", async () => {
    const mission = await missionPlanifieeDans(5 * 24);
    // Le rendez-vous est passé : on recule la date prévue (écriture du banc, hors parcours produit).
    await enTantQuePostgres();
    await db.query(
      `update public.incident_interventions set debut_prevu = now() - interval '1 hour', fin_prevue = now() + interval '1 hour' where id = $1`,
      [mission]
    );
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    expect(await evenement("intervention_demarree", mission)).toEqual({ intervention_id: mission });
  });

  it("terminer (compte rendu) puis facturer avant le rendez-vous : l'écart est écrit, rien n'est bloqué, le détail d'origine reste", async () => {
    const mission = await missionPlanifieeDans(5 * 24);
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    await compteRendu(mission);
    await facture(mission);

    const cr = await evenement("compte_rendu", mission);
    expect(cr?.avant_rendez_vous).toBe(true);
    expect(Date.parse(String(cr?.debut_prevu))).toBe(await debutPrevu(mission));
    expect(Number(cr?.ecart_minutes)).toBeGreaterThan(7000);
    expect(cr?.cause_reelle).toBe("Joint usé");
    expect(cr?.montant_final_cents).toBe(48000);

    const f = await evenement("facture_deposee", mission);
    expect(f?.avant_rendez_vous).toBe(true);
    expect(Number(f?.ecart_minutes)).toBeGreaterThan(7000);
    expect(f?.numero).toBe("F-2026-14");
    expect(f?.montant_ttc_cents).toBe(48000);

    await enTantQuePostgres();
    const { rows: [m] } = await db.query(`select statut from public.incident_interventions where id = $1`, [mission]);
    expect(m.statut).toBe("terminee");
    const { rows: [alerte] } = await db.query(
      `select id from public.alerts where type = 'facture_artisan_a_valider' and details->>'intervention_id' = $1`,
      [mission]
    );
    expect(alerte).toBeTruthy();
  });

  it("une mission menée à l'heure ne laisse aucun écart sur ses trois événements", async () => {
    const mission = await missionPlanifieeDans(5 * 24);
    await enTantQuePostgres();
    await db.query(
      `update public.incident_interventions set debut_prevu = now() - interval '1 hour', fin_prevue = now() + interval '1 hour' where id = $1`,
      [mission]
    );
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [mission]);
    await compteRendu(mission);
    await facture(mission);
    for (const type of ["intervention_demarree", "compte_rendu", "facture_deposee"]) {
      const d = await evenement(type, mission);
      expect(d, type).toBeDefined();
      expect(d, type).not.toHaveProperty("avant_rendez_vous");
      expect(d, type).not.toHaveProperty("ecart_minutes");
    }
  });
});
