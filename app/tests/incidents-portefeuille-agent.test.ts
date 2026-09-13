/**
 * Le lot d'un collègue est invisible : son incident et ses gestes doivent
 * l'être aussi, y compris par RPC SECURITY DEFINER sans passer par l'écran.
 * Décor isolé, transaction annulée. Aucun mail ni fichier externe envoyé.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Incidents dans le portefeuille de l'agent", () => {
  let db: Client;
  let org: string, autreOrg: string;
  let admin: string, agentA: string, agentB: string, sa: string, locataireCompte: string, artisanCompte: string;
  let lot: string, bail: string, incident: string, artisan: string;
  let consultation: string, sollicitation: string, devis: string, intervention: string, document: string, alerte: string;

  const id = async (sql: string, args: unknown[] = []) => (await db.query<{ id: string }>(sql, args)).rows[0].id;
  const devenir = async (compte: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [compte]);
    await db.query("set local role authenticated");
  };
  const postgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const compte = async (prefixe: string) => id(`
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
      email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Recette portefeuille incidents','active','agence') returning id");
    autreOrg = await id("insert into public.organizations(name,status,type) values('Autre agence recette','active','agence') returning id");
    [admin, agentA, agentB, sa, locataireCompte, artisanCompte] = [
      await compte("admin"), await compte("agentA"), await compte("agentB"),
      await compte("sa"), await compte("locataire"), await compte("artisan"),
    ];
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'admin_agence'),($3,$2,'agent'),($4,$2,'agent'),($5,null,'super_admin'),
      ($6,$2,'locataire'),($7,$2,'artisan')`, [admin, org, agentA, agentB, sa, locataireCompte, artisanCompte]);
    const mandant = await id("insert into public.persons(organization_id,nom) values($1,'Bailleur fictif') returning id", [org]);
    const locataire = await id("insert into public.persons(organization_id,nom,account_id) values($1,'Locataire fictif',$2) returning id", [org, locataireCompte]);
    const bien = await id(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
      values($1,'Bien agent A','appartement','1 rue de la Recette','75001','Paris') returning id`, [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot agent A','loue') returning id", [org, bien]);
    await db.query("insert into public.detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lot, mandant]);
    const mandat = await id(`insert into public.mandats(organization_id,person_id,etat,date_debut,agent_account_id)
      values($1,$2,'brouillon',current_date-30,$3) returning id`, [org, mandant, agentA]);
    await db.query(`insert into public.mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut)
      values($1,$2,$3,7,current_date-30)`, [org, mandat, lot]);
    await db.query("update public.mandats set etat='actif' where id=$1", [mandat]);
    bail = await id(`insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges)
      values($1,$2,$3,'actif',current_date-200,700,50) returning id`, [org, lot, locataire]);
    incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,
      canal,categorie,description,etat,imputation,imputation_justification)
      values($1,'INC-RECETTE-PORTEFEUILLE',$2,$3,$4,'espace_locataire','plomberie_canalisation',
      'Détail privé du portefeuille A','qualifie','proprietaire','Joint usé') returning id`, [org, lot, bail, locataire]);
    artisan = await id(`insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id)
      values('Artisan recette portefeuille',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000',
      'valide','verifie','publique',$1) returning id`, [artisanCompte]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [artisan]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'75001')", [artisan]);
    consultation = await id(`insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux,devis_unique_assume)
      values($1,$2,'plomberie','entretien_courant',true) returning id`, [org, incident]);
    sollicitation = await id(`insert into public.incident_sollicitations(organization_id,incident_id,consultation_id,artisan_id,statut)
      values($1,$2,$3,$4,'devis_depose') returning id`, [org, incident, consultation, artisan]);
    devis = await id(`insert into public.incident_devis(organization_id,incident_id,sollicitation_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au)
      values($1,$2,$3,$4,10000,'Devis privé A',current_date+30) returning id`, [org, incident, sollicitation, artisan]);
    intervention = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut)
      values($1,$2,$3,'entretien_courant','acceptee') returning id`, [org, incident, artisan]);
    await db.query(`insert into public.incident_evenements(organization_id,incident_id,type,details)
      values($1,$2,'qualification','{"note":"Notes privées A"}')`, [org, incident]);
    await db.query(`insert into public.intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin)
      values($1,$2,'artisan',1,now()+interval '1 day',now()+interval '1 day 2 hour')`, [org, intervention]);
    await db.query(`insert into public.intervention_comptes_rendus(organization_id,intervention_id,artisan_id,travaux_realises,montant_final_cents)
      values($1,$2,$3,'Compte rendu privé A',10000)`, [org, intervention, artisan]);
    document = await id(`insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
      values($1::uuid,'photo_incident','Photo après A',$1::text||'/recette/photo.png','image/png',10,'recette-photo') returning id`, [org]);
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [`${org}/recette/photo.png`]);
    await db.query(`insert into public.document_liens(organization_id,document_id,entite,entite_id)
      values($1,$2,'incident',$3)`, [org, document, incident]);
    await db.query(`insert into public.intervention_photos(organization_id,intervention_id,document_id,moment)
      values($1,$2,$3,'apres')`, [org, intervention, document]);
    await db.query(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,commentaire)
      values($1,$2,$3,'locataire',4,'Commentaire privé A')`, [org, intervention, artisan]);
    alerte = await id(`insert into public.alerts(organization_id,type,titre,assigned_all,details)
      values($1,'incident_a_qualifier','Incident du portefeuille A',true,jsonb_build_object('incident_id',$2::text)) returning id`, [org, incident]);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it("confirme que l'agent sans mandat n'a pas accès au lot", async () => {
    await devenir(agentB);
    expect((await db.query("select public.lot_hors_portefeuille($1,$2) interdit", [org, lot])).rows[0].interdit).toBe(true);
    expect((await db.query("select id from public.lots where id=$1", [lot])).rows).toHaveLength(0);
  });

  const tables = ["incidents", "incident_evenements", "incident_consultations", "incident_sollicitations",
    "incident_devis", "incident_interventions", "intervention_creneaux", "intervention_comptes_rendus",
    "intervention_photos", "artisan_evaluations"];
  it.each(tables)("%s : l'agent A lit son dossier, l'agent B ne lit rien", async (table) => {
    await devenir(agentA);
    expect((await db.query(`select * from public.${table} where organization_id=$1`, [org])).rows).toHaveLength(1);
    await devenir(agentB);
    expect((await db.query(`select * from public.${table} where organization_id=$1`, [org])).rows).toHaveLength(0);
  });

  const mutations = () => [
    ["ouvrir un incident", "select public.ouvrir_incident_agence($1,$2,'plomberie_canalisation','Incident chez le collègue',null,null,'normale')", [org, lot]],
    ["qualifier", "select public.qualifier_incident($1,$2,'locataire','Imputation hors portefeuille')", [org, incident]],
    ["attribuer", "select public.attribuer_incident($1,$2,$3)", [org, incident, agentB]],
    ["clôturer", "select public.cloturer_incident($1,$2,'sans_suite','Clôture hors portefeuille')", [org, incident]],
    ["rouvrir", "select public.rouvrir_incident($1,$2,'Réouverture hors portefeuille')", [org, incident]],
    ["joindre une photo", "select public.joindre_photo_incident($1,$2,$3,'image/png',10,'recette-nouvelle-photo')", [org, incident, `${org}/recette/nouvelle-photo.png`]],
    ["ouvrir une consultation", "select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30)", [org, incident]],
    ["solliciter", "select public.solliciter_artisan($1,$2,$3)", [org, consultation, artisan]],
    ["retenir un devis", "select public.retenir_devis($1,$2)", [org, devis]],
    ["fixer un créneau", "select public.fixer_creneau_arbitrage($1,$2,now()+interval '2 day',now()+interval '2 day 2 hour','Recette')", [org, intervention]],
    ["réviser après diagnostic", "select public.reviser_imputation_apres_diagnostic($1,$2,'locataire','Recette')", [org, incident]],
    ["annuler une mission", "select public.annuler_mission($1,$2,'Annulation hors portefeuille')", [org, intervention]],
    ["évaluer l'artisan", "select public.evaluer_artisan_gerant($1,$2,4::smallint,4::smallint,4::smallint,'Recette')", [org, intervention]],
  ] as const;
  it.each(Array.from({ length: 13 }, (_, index) => index))("RPC d'agence %i : refuse hors portefeuille avant tout effet", async (index) => {
    await devenir(agentB);
    const [nom, sql, args] = mutations()[index];
    await expect(db.query(sql, [...args]), nom).rejects.toMatchObject({ code: "42501", message: "Ce dossier est hors de votre portefeuille" });
  });

  it("l'agent titulaire garde les mutations autorisées et leurs effets", async () => {
    await devenir(agentA);
    await db.query("select public.qualifier_incident($1,$2,'proprietaire','Qualification du titulaire')", [org, incident]);
    await db.query("select public.attribuer_incident($1,$2,$3)", [org, incident, agentA]);
    await db.query("select public.fixer_creneau_arbitrage($1,$2,now()+interval '2 day',now()+interval '2 day 2 hour','Accord téléphonique')", [org, intervention]);
    expect((await db.query("select statut from public.incident_interventions where id=$1", [intervention])).rows[0].statut).toBe("planifiee");
    await db.query("select public.annuler_mission($1,$2,'Report demandé')", [org, intervention]);
    expect((await db.query("select statut from public.incident_interventions where id=$1", [intervention])).rows[0].statut).toBe("annulee");
  });

  it.each(["admin", "super_admin"])("%s conserve la qualification sans mandat personnel", async (role) => {
    await devenir(role === "admin" ? admin : sa);
    expect((await db.query("select id from public.incidents where id=$1", [incident])).rows).toHaveLength(1);
    await db.query("select public.qualifier_incident($1,$2,'proprietaire','Qualification responsable')", [org, incident]);
  });

  it("le propriétaire direct conserve le périmètre de son organisation", async () => {
    await postgres();
    await db.query("update public.memberships set role='proprietaire_direct' where account_id=$1 and organization_id=$2", [admin, org]);
    await devenir(admin);
    await db.query("select public.qualifier_incident($1,$2,'proprietaire','Qualification propriétaire')", [org, incident]);
    expect((await db.query("select id from public.incident_devis where id=$1", [devis])).rows).toHaveLength(1);
  });

  it("une agence étrangère reste refusée par la garde d'organisation", async () => {
    await devenir(agentA);
    await expect(db.query("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30)", [autreOrg, incident])).rejects.toThrow("Accès refusé");
  });

  it("le créateur d'un lot sans mandat peut toujours y ouvrir un incident", async () => {
    await devenir(agentB);
    const nouveauBien = (await db.query("select public.creer_bien_avec_lot($1,'Nouveau bien','appartement','2 rue du Test',null,'75001','Paris',null,false,30,2) id", [org])).rows[0].id;
    const nouveauLot = (await db.query("select id from public.lots where bien_id=$1", [nouveauBien])).rows[0].id;
    const nouveau = (await db.query("select public.ouvrir_incident_agence($1,$2,'plomberie_canalisation','Incident du lot que je crée',null,null,'normale') id", [org, nouveauLot])).rows[0].id;
    expect((await db.query("select id from public.incidents where id=$1", [nouveau])).rows).toHaveLength(1);
    await devenir(agentA);
    expect((await db.query("select id from public.incidents where id=$1", [nouveau])).rows).toHaveLength(0);
  });

  it("les pièces et alertes suivent leur incident, sans fuite à l'agent B", async () => {
    await devenir(agentA);
    expect((await db.query("select id from public.documents where id=$1", [document])).rows).toHaveLength(1);
    expect((await db.query("select id from storage.objects where name=$1", [`${org}/recette/photo.png`])).rows).toHaveLength(1);
    expect((await db.query("select id from public.alerts where id=$1", [alerte])).rows).toHaveLength(1);
    await devenir(agentB);
    expect((await db.query("select id from public.documents where id=$1", [document])).rows).toHaveLength(0);
    expect((await db.query("select id from public.document_liens where document_id=$1", [document])).rows).toHaveLength(0);
    expect((await db.query("select id from storage.objects where name=$1", [`${org}/recette/photo.png`])).rows).toHaveLength(0);
    expect((await db.query("select id from public.alerts where id=$1", [alerte])).rows).toHaveLength(0);
  });

  it("une assignation personnelle ne contourne pas le portefeuille de l'incident", async () => {
    await postgres();
    await db.query("update public.alerts set assigned_all=false,assignee_account_id=$1 where id=$2", [agentB, alerte]);
    await devenir(agentB);
    expect((await db.query("select id from public.alerts where id=$1", [alerte])).rows).toHaveLength(0);
    expect((await db.query("update public.alerts set titre='Modification interdite' where id=$1 returning id", [alerte])).rows).toHaveLength(0);
    await devenir(admin);
    expect((await db.query("select id from public.alerts where id=$1", [alerte])).rows).toHaveLength(1);
  });

  it("les alertes référant seulement l'intervention, la consultation ou le devis sont aussi filtrées", async () => {
    for (const [cle, valeur] of [["intervention_id", intervention], ["consultation_id", consultation], ["devis_id", devis]]) {
      await devenir(agentB);
      expect((await db.query("select public.alerte_dans_portefeuille($1,jsonb_build_object($2::text,$3::text)) visible", [org, cle, valeur])).rows[0].visible).toBe(false);
      await devenir(agentA);
      expect((await db.query("select public.alerte_dans_portefeuille($1,jsonb_build_object($2::text,$3::text)) visible", [org, cle, valeur])).rows[0].visible).toBe(true);
    }
  });

  it("la file à évaluer ne révèle pas les interventions d'un collègue", async () => {
    await postgres();
    await db.query("update public.incident_interventions set statut='terminee',terminee_le=now() where id=$1", [intervention]);
    await devenir(agentA);
    expect((await db.query("select * from public.interventions_a_evaluer($1)", [org])).rows.map(r => r.intervention_id)).toContain(intervention);
    await devenir(agentB);
    expect((await db.query("select * from public.interventions_a_evaluer($1)", [org])).rows).toHaveLength(0);
  });

  it("le locataire garde son suivi et sa contestation, sans les tables de gestion", async () => {
    await devenir(locataireCompte);
    expect((await db.query("select * from public.mes_incidents_locataire($1)", [org])).rows.map(r => r.id)).toContain(incident);
    expect((await db.query("select * from public.mon_suivi_intervention($1)", [org])).rows).toHaveLength(1);
    await db.query("select public.contester_imputation($1,$2,'Je demande une vérification de la cause')", [org, incident]);
    expect((await db.query("select id from public.incident_devis where id=$1", [devis])).rows).toHaveLength(0);
  });

  it("un locataire également agent d'une autre agence conserve le dépôt de sa photo", async () => {
    await postgres();
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'agent')", [locataireCompte, autreOrg]);
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)", [`${org}/recette/photo-locataire-agent.png`, locataireCompte]);
    await devenir(locataireCompte);
    const photo = (await db.query("select public.joindre_photo_incident($1,$2,$3,'image/png',10,'photo-locataire-agent') id",
      [org, incident, `${org}/recette/photo-locataire-agent.png`])).rows[0].id;
    expect(photo).toBeTruthy();
    expect((await db.query("select * from public.mon_document_locataire($1,$2)", [org, photo])).rows).toHaveLength(1);
  });

  it("le modèle ne permet pas deux memberships agent et locataire dans la même agence", async () => {
    await postgres();
    await expect(db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'agent')", [locataireCompte, org]))
      .rejects.toMatchObject({ code: "23505", constraint: "memberships_unique_compte_agence" });
  });

  it("l'artisan garde son agenda et le démarrage de sa mission", async () => {
    await devenir(artisanCompte);
    expect((await db.query("select * from public.mon_agenda_artisan()", [])).rows.map(r => r.intervention_id)).toContain(intervention);
    await db.query("select public.demarrer_intervention($1)", [intervention]);
    expect((await db.query("select * from public.mon_agenda_artisan()", [])).rows.find(r => r.intervention_id === intervention)?.statut).toBe("en_cours");
    expect((await db.query("select id from public.incident_devis where id=$1", [devis])).rows).toHaveLength(0);
  });

  it("un artisan aussi agent garde ses gestes artisan, sans acquérir ceux de gestion hors portefeuille", async () => {
    await postgres();
    await db.query("update public.artisans set account_id=$1 where id=$2", [agentB, artisan]);
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)", [`${org}/recette/photo-artisan-agent.png`, agentB]);
    await devenir(agentB);
    await db.query("select public.deposer_photo_intervention($1,'avant',$2,'image/png',10,'photo-artisan-agent')", [intervention, `${org}/recette/photo-artisan-agent.png`]);
    await db.query("select public.demarrer_intervention($1)", [intervention]);
    expect((await db.query("select * from public.mon_agenda_artisan()")).rows.find(r => r.intervention_id === intervention)?.statut).toBe("en_cours");
    await expect(db.query("select public.annuler_mission($1,$2,'Annulation en tant qu’agent')", [org, intervention])).rejects.toMatchObject({ code: "42501" });
  });

  it("les comptes ne peuvent pas contourner les RPC par une écriture directe", async () => {
    for (const table of tables) {
      const permissions = await db.query("select has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE,TRUNCATE') permis", [`public.${table}`]);
      expect(permissions.rows[0].permis, table).toBe(false);
    }
    expect((await db.query(`select has_function_privilege('authenticated',
      'public.incident_creer(uuid,uuid,uuid,uuid,public.incident_canal,text,text,text,text,public.incident_urgence,uuid)','EXECUTE') permis`)).rows[0].permis).toBe(false);
  });
});
