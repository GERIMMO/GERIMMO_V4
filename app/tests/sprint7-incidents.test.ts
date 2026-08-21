/**
 * Tests d'intégration Sprint 7 — Incidents : déclaration, qualification,
 * clôture, réouverture, contestation (module 7, registre A5).
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
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
      'test-s7-'||gen_random_uuid()||'@test.local','x', now(),
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

describe.skipIf(!DB_URL)("Sprint 7 — incidents : cycle de vie", () => {
  let db: Client;
  let orgA: string;
  let orgB: string;
  let agentA: string;
  let adminB: string;
  let compteLocataire: string;
  let personneLocataire: string;
  let lotA: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const orgs = await db.query(
      `insert into public.organizations (name, status)
       values ('S7 Alpha','active'), ('S7 Beta','active') returning id, name`
    );
    orgA = orgs.rows.find((o) => o.name === "S7 Alpha")!.id;
    orgB = orgs.rows.find((o) => o.name === "S7 Beta")!.id;
    agentA = await creerUtilisateur(db);
    adminB = await creerUtilisateur(db);
    compteLocataire = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'agent'), ($3,$4,'admin_agence'), ($5,$2,'locataire')`,
      [agentA, orgA, adminB, orgB, compteLocataire]
    );

    // Un lot loué par un bail actif : le terrain de jeu de la déclaration
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'5 rue des Incidents','appartement'::public.bien_type,
         '5 rue des Incidents', null, '75001','Paris',1990,false,50,3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    lotA = lot;

    await db.query("reset role");
    const {
      rows: [{ id: personne }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, account_id)
       values ($1,'Testeuse','Léa',$2) returning id`,
      [orgA, compteLocataire]
    );
    personneLocataire = personne;
    // Fixture : le bail est posé directement à l'état actif (l'activation
    // outillée est couverte par les tests du sprint 4)
    await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal)
       values ($1,$2,'actif',$3)`,
      [orgA, lotA, personneLocataire]
    );
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function declarer(urgence = "normale"): Promise<string> {
    await simuler(db, compteLocataire);
    const {
      rows: [{ id }],
    } = await db.query(
      `select public.declarer_mon_incident($1,'plomberie_joint','Fuite sous l''évier, ça s''étend','Cuisine','Depuis dimanche',$2::public.incident_urgence) as id`,
      [orgA, urgence]
    );
    return id;
  }

  it("le locataire déclare : incident numéroté, événement tracé, alerte « à qualifier » (RM-7.1)", async () => {
    const incident = await declarer();
    await db.query("reset role");

    const {
      rows: [i],
    } = await db.query(`select * from public.incidents where id = $1`, [incident]);
    expect(i.numero).toMatch(/^INC-\d{4}-0001$/);
    expect(i.etat).toBe("declare");
    expect(i.canal).toBe("espace_locataire");
    expect(i.declarant_person_id).toBe(personneLocataire);
    expect(i.bail_id).not.toBeNull();
    expect(i.imputation).toBeNull();

    const { rows: evenements } = await db.query(
      `select type from public.incident_evenements where incident_id = $1`,
      [incident]
    );
    expect(evenements.map((e) => e.type)).toContain("declaration");

    const {
      rows: [alerte],
    } = await db.query(
      `select criticite, statut from public.alerts
       where organization_id = $1 and type = 'incident_a_qualifier'
         and details->>'incident_id' = $2`,
      [orgA, incident]
    );
    expect(alerte.statut).toBe("ouverte");
    expect(alerte.criticite).toBe("normale");
  });

  it("une déclaration urgente lève une alerte critique ; le doublon est signalé sans bloquer", async () => {
    await declarer();
    const second = await declarer("urgente");
    await db.query("reset role");

    const {
      rows: [alerte],
    } = await db.query(
      `select criticite, details from public.alerts
       where details->>'incident_id' = $1`,
      [second]
    );
    expect(alerte.criticite).toBe("critique");
    expect(alerte.details.libelle).toMatch(/Doublon possible/);
    // Les deux incidents existent : le doublon alerte, il ne bloque pas
    const { rows } = await db.query(
      `select numero from public.incidents where organization_id = $1 order by numero`,
      [orgA]
    );
    expect(rows.map((r) => r.numero.slice(-4))).toEqual(["0001", "0002"]);
  });

  it("sans bail actif, pas de déclaration (RM-7.1) ; hors de son agence non plus", async () => {
    await db.query(`update public.baux set etat = 'termine', date_fin = current_date where organization_id = $1`, [orgA]);
    await simuler(db, compteLocataire);
    await attendreEchec(
      db,
      /bail actif/,
      `select public.declarer_mon_incident($1,'plomberie_joint','Fuite','Cuisine',null,'normale')`,
      [orgA]
    );
    await attendreEchec(
      db,
      /Accès refusé/,
      `select public.declarer_mon_incident($1,'plomberie_joint','Fuite','Cuisine',null,'normale')`,
      [orgB]
    );
  });

  it("le locataire ne touche jamais la table : ni insert direct, ni select — il lit par mes_incidents_locataire", async () => {
    const incident = await declarer();

    await simuler(db, compteLocataire);
    await attendreEchec(
      db,
      /permission denied|row-level security/,
      `insert into public.incidents (organization_id, numero, lot_id, canal, categorie, description)
       values ($1,'INC-9999-9999',$2,'espace_locataire','autre','contournement')`,
      [orgA, lotA]
    );
    const { rows: directs } = await db.query(
      `select id from public.incidents where organization_id = $1`,
      [orgA]
    );
    expect(directs).toHaveLength(0);

    const { rows: miens } = await db.query(
      `select id, numero, etat from public.mes_incidents_locataire($1)`,
      [orgA]
    );
    expect(miens.map((m) => m.id)).toContain(incident);
  });

  it("l'isolation tient : l'agence B ne voit ni ne qualifie les incidents de A (RM-A1.7)", async () => {
    const incident = await declarer();

    await simuler(db, adminB);
    const { rows } = await db.query(`select id from public.incidents where organization_id = $1`, [
      orgA,
    ]);
    expect(rows).toHaveLength(0);
    await attendreEchec(
      db,
      /Accès refusé|introuvable/,
      `select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`,
      [orgA, incident]
    );
  });

  it("qualification : justification obligatoire (RM-7.2.3), puis imputation visible et alerte soldée", async () => {
    const incident = await declarer();

    await simuler(db, agentA);
    await attendreEchec(
      db,
      /justification .* obligatoire/i,
      `select public.qualifier_incident($1,$2,'locataire','   ')`,
      [orgA, incident]
    );
    await db.query(
      `select public.qualifier_incident($1,$2,'locataire','Joint de robinetterie : réparation locative, décret 87-712')`,
      [orgA, incident]
    );

    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(`select etat, imputation from public.incidents where id = $1`, [incident]);
    expect(i.etat).toBe("qualifie");
    expect(i.imputation).toBe("locataire");

    const {
      rows: [alerte],
    } = await db.query(
      `select statut, closed_action from public.alerts where details->>'incident_id' = $1`,
      [incident]
    );
    expect(alerte.statut).toBe("fermee");
    expect(alerte.closed_action).toMatch(/qualifié/);

    // Le locataire voit l'imputation immédiatement (RM-7.2.4)
    await simuler(db, compteLocataire);
    const { rows: miens } = await db.query(
      `select imputation, imputation_justification from public.mes_incidents_locataire($1)`,
      [orgA]
    );
    expect(miens[0].imputation).toBe("locataire");
    expect(miens[0].imputation_justification).toMatch(/87-712/);
  });

  it("machine A5 : un incident qualifié ne se requalifie pas, un incident en cours ne se clôture pas (RM-7.5.1)", async () => {
    const incident = await declarer();
    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      incident,
    ]);
    await attendreEchec(
      db,
      /déclaré ou rouvert/,
      `select public.qualifier_incident($1,$2,'proprietaire','Changement d''avis')`,
      [orgA, incident]
    );

    // Fixture : on pousse l'incident en intervention (états servis par les
    // incréments artisans à venir)
    await db.query("reset role");
    await db.query(`update public.incidents set etat = 'en_cours' where id = $1`, [incident]);
    await simuler(db, agentA);
    await attendreEchec(
      db,
      /compte rendu/,
      `select public.cloturer_incident($1,$2,'resolu',null)`,
      [orgA, incident]
    );
  });

  it("clôture : un déclaré se classe (jamais « résolu »), un qualifié se résout (jamais « sans suite »)", async () => {
    const classement = await declarer();
    await simuler(db, agentA);
    await attendreEchec(
      db,
      /Qualifiez l'incident/,
      `select public.cloturer_incident($1,$2,'resolu',null)`,
      [orgA, classement]
    );
    await db.query(
      `select public.cloturer_incident($1,$2,'sans_suite','Déjà traité par le gardien')`,
      [orgA, classement]
    );

    const resolu = await declarer();
    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      resolu,
    ]);
    await attendreEchec(
      db,
      /se clôture « résolu »/,
      `select public.cloturer_incident($1,$2,'sans_suite',null)`,
      [orgA, resolu]
    );
    await db.query(
      `select public.cloturer_incident($1,$2,'resolu','Conseil au téléphone : purge du radiateur')`,
      [orgA, resolu]
    );

    await db.query("reset role");
    const { rows } = await db.query(
      `select etat, cloture_motif, clos_le from public.incidents where organization_id = $1`,
      [orgA]
    );
    for (const r of rows) {
      expect(r.etat).toBe("clos");
      expect(r.clos_le).not.toBeNull();
    }
  });

  it("la clôture solde toutes les alertes de l'incident (RM-7.6.2)", async () => {
    const incident = await declarer();
    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      incident,
    ]);
    // Contestation entre-temps : une seconde alerte s'ouvre
    await simuler(db, compteLocataire);
    await db.query(`select public.contester_imputation($1,$2,'Le joint était déjà usé')`, [
      orgA,
      incident,
    ]);
    await simuler(db, agentA);
    await db.query(`select public.cloturer_incident($1,$2,'resolu','Réparé')`, [orgA, incident]);

    await db.query("reset role");
    const { rows } = await db.query(
      `select statut from public.alerts where details->>'incident_id' = $1`,
      [incident]
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.statut).toBe("fermee");
  });

  it("contestation : tracée sans bloquer (RM-7.2.5), une seule fois", async () => {
    const incident = await declarer();

    await simuler(db, compteLocataire);
    await attendreEchec(
      db,
      /pas encore qualifié/,
      `select public.contester_imputation($1,$2,'Pas d''accord')`,
      [orgA, incident]
    );

    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      incident,
    ]);

    await simuler(db, compteLocataire);
    await db.query(`select public.contester_imputation($1,$2,'Le joint était déjà usé à l''entrée')`, [
      orgA,
      incident,
    ]);
    await attendreEchec(
      db,
      /déjà été transmise/,
      `select public.contester_imputation($1,$2,'J''insiste')`,
      [orgA, incident]
    );

    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(
      `select etat, imputation_contestee_le from public.incidents where id = $1`,
      [incident]
    );
    // La contestation ne change pas l'état : elle ne bloque rien
    expect(i.etat).toBe("qualifie");
    expect(i.imputation_contestee_le).not.toBeNull();
    const {
      rows: [alerte],
    } = await db.query(
      `select statut from public.alerts
       where type = 'incident_conteste' and details->>'incident_id' = $1`,
      [incident]
    );
    expect(alerte.statut).toBe("ouverte");
  });

  it("réouverture par le locataire déclarant : clos → rouvert → requalification (registre A5)", async () => {
    const incident = await declarer();
    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      incident,
    ]);
    await db.query(`select public.cloturer_incident($1,$2,'resolu','Joint changé')`, [
      orgA,
      incident,
    ]);

    await simuler(db, compteLocataire);
    await attendreEchec(db, /Dites pourquoi/, `select public.rouvrir_incident($1,$2,'')`, [
      orgA,
      incident,
    ]);
    await db.query(`select public.rouvrir_incident($1,$2,'La fuite est revenue ce matin')`, [
      orgA,
      incident,
    ]);

    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(
      `select etat, clos_le, cloture_motif, imputation from public.incidents where id = $1`,
      [incident]
    );
    expect(i.etat).toBe("rouvert");
    expect(i.clos_le).toBeNull();
    expect(i.cloture_motif).toBeNull();
    // La requalification repart de zéro : l'ancienne imputation ne préjuge
    // pas de la nouvelle (revue n°2 — le donut la comptait encore)
    expect(i.imputation).toBeNull();
    // L'historique de clôture reste dans les événements
    const { rows: evenements } = await db.query(
      `select type from public.incident_evenements where incident_id = $1 order by created_at`,
      [incident]
    );
    expect(evenements.map((e) => e.type)).toEqual([
      "declaration",
      "qualification",
      "cloture",
      "reouverture",
    ]);
    // Et l'agence requalifie (rouvert → qualifié)
    await simuler(db, agentA);
    await db.query(
      `select public.qualifier_incident($1,$2,'proprietaire','Le joint neuf fuit : malfaçon, charge bailleur')`,
      [orgA, incident]
    );
  });

  it("l'agence saisit pour le locataire : canal agence, déclarant déduit du bail actif", async () => {
    await simuler(db, agentA);
    const {
      rows: [{ id: incident }],
    } = await db.query(
      `select public.ouvrir_incident_agence($1,$2,'chauffage_panne','Appel du locataire : radiateur froid','Chambre',null,'normale') as id`,
      [orgA, lotA]
    );

    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(
      `select canal, declarant_person_id, bail_id from public.incidents where id = $1`,
      [incident]
    );
    expect(i.canal).toBe("agence");
    expect(i.declarant_person_id).toBe(personneLocataire);
    expect(i.bail_id).not.toBeNull();
  });

  it("confidentialité : le nouveau locataire du lot ne voit pas les incidents de l'ancien bail (revue n°2)", async () => {
    const incident = await declarer();

    // Fin du premier bail, nouveau locataire sur le même lot
    await db.query(
      `update public.baux set etat = 'termine', date_fin = current_date where organization_id = $1`,
      [orgA]
    );
    const compteSuivant = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'locataire')`,
      [compteSuivant, orgA]
    );
    const {
      rows: [{ id: personneSuivante }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, account_id)
       values ($1,'Suivant','Bob',$2) returning id`,
      [orgA, compteSuivant]
    );
    await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal) values ($1,$2,'actif',$3)`,
      [orgA, lotA, personneSuivante]
    );

    // Le nouveau locataire ne voit rien du bail précédent…
    await simuler(db, compteSuivant);
    const { rows: vus } = await db.query(`select id from public.mes_incidents_locataire($1)`, [orgA]);
    expect(vus).toHaveLength(0);
    // …l'ancien déclarant garde son historique (est_declarant vrai)
    await simuler(db, compteLocataire);
    const { rows: miens } = await db.query(
      `select id, est_declarant from public.mes_incidents_locataire($1)`,
      [orgA]
    );
    expect(miens.map((m) => m.id)).toContain(incident);
    expect(miens.find((m) => m.id === incident)!.est_declarant).toBe(true);
  });

  it("contestation d'un incident clos refusée : l'alerte n'aurait plus de clôture pour la solder (revue n°2)", async () => {
    const incident = await declarer();
    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      incident,
    ]);
    await db.query(`select public.cloturer_incident($1,$2,'resolu','Réparé')`, [orgA, incident]);

    await simuler(db, compteLocataire);
    await attendreEchec(
      db,
      /clos — rouvrez-le/,
      `select public.contester_imputation($1,$2,'Trop tard mais je conteste')`,
      [orgA, incident]
    );
  });

  it("garde-fous en base : catégorie fermée, plafond de photos, « terminé » jamais classé sans suite", async () => {
    await simuler(db, compteLocataire);
    // La catégorie est une liste fermée (contrainte incidents_categorie_connue)
    await attendreEchec(
      db,
      /incidents_categorie_connue/,
      `select public.declarer_mon_incident($1,'categorie_bidon','Test',null,null,'normale')`,
      [orgA]
    );

    const incident = await declarer();
    // Dix photos au plus par incident, quel que soit le nombre de requêtes
    for (let i = 0; i < 10; i++) {
      await db.query(
        `select public.joindre_photo_incident($1,$2,$1::text||'/photo-'||$3||'.jpg','image/jpeg',100,'empreinte-cap-'||$3)`,
        [orgA, incident, String(i)]
      );
    }
    await attendreEchec(
      db,
      /Dix photos au maximum/,
      `select public.joindre_photo_incident($1,$2,$1::text||'/photo-11.jpg','image/jpeg',100,'empreinte-cap-11')`,
      [orgA, incident]
    );

    // Un incident terminé (intervention faite) ne se classe pas « sans suite »
    await simuler(db, agentA);
    await db.query(`select public.qualifier_incident($1,$2,'locataire','Décret 87-712')`, [
      orgA,
      incident,
    ]);
    await db.query("reset role");
    await db.query(`update public.incidents set etat = 'termine' where id = $1`, [incident]);
    await simuler(db, agentA);
    await attendreEchec(
      db,
      /se clôture « résolu »/,
      `select public.cloturer_incident($1,$2,'sans_suite',null)`,
      [orgA, incident]
    );
    await db.query(`select public.cloturer_incident($1,$2,'resolu','Intervention validée')`, [
      orgA,
      incident,
    ]);
  });

  it("attribution : un agent se saisit d'un dossier libre, le rend, mais ne vole pas celui d'un autre", async () => {
    const incident = await declarer();

    await simuler(db, agentA);
    await db.query(`select public.attribuer_incident($1,$2,$3)`, [orgA, incident, agentA]);
    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(`select responsable_account_id from public.incidents where id = $1`, [
      incident,
    ]);
    expect(i.responsable_account_id).toBe(agentA);

    // Un second agent ne peut pas se l'approprier : dossier déjà suivi
    const agent2 = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'agent')`,
      [agent2, orgA]
    );
    await simuler(db, agent2);
    await attendreEchec(
      db,
      /suivi par quelqu'un d'autre/,
      `select public.attribuer_incident($1,$2,$3)`,
      [orgA, incident, agent2]
    );

    // Le premier le rend au pot commun
    await simuler(db, agentA);
    await db.query(`select public.attribuer_incident($1,$2,null)`, [orgA, incident]);
  });
});
