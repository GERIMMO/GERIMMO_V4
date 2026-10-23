/**
 * Liste noire locale « à l'aveugle » (relecture du 15/10/2026 du lot « invitation-artisan », constat de sécurité antérieur
 * au lot, migration 20261014843000).
 *
 * Constat : `artisan_blacklist_locale(p_org, p_artisan, p_motif)` acceptait N'IMPORTE QUEL identifiant d'artisan et créait
 * la ligne `artisan_agences` manquante. Une organisation sans aucune relation avec l'artisan se donnait ainsi une relation :
 * `artisan_lisible` lui ouvrait ensuite la fiche de l'entreprise (nom, SIRET, téléphone, e-mail, métiers, zone), et
 * l'artisan apparaissait dans son carnet. Désormais : relation préalable RÉELLE exigée (ligne du carnet, ou sollicitation,
 * intervention ou devis de cette organisation avec cet artisan), sinon un refus NEUTRE, le même que l'artisan existe ou non.
 * Les autres fonctions qui créent une ligne `artisan_agences` ne prennent pas d'identifiant à l'aveugle :
 * `artisan_creer_ou_rattacher` (SIRET d'un profil public, ou créé par l'agence) et `repondre_invitation_artisan` (geste de
 * l'artisan lui-même) ; `artisan_statut_local` et `artisan_lever_blacklist_locale` ne font que modifier une ligne existante.
 *
 * Troisième relecture du 15/10 (constat de sécurité, migration 20261014849000) : la ligne que la liste noire CRÉE (relation
 * préalable faite d'une sollicitation, d'une intervention ou d'un devis, sans ligne de carnet) devenait une relation ACTIVE
 * à la levée de la liste noire. Un propriétaire direct faisait ainsi entrer dans son carnet un artisan du réseau, sans
 * invitation ni geste de l'artisan, puis le sollicitait dans une commune fermée. Désormais une telle ligne le dit
 * (`creee_par_liste_noire`) : la levée la SUPPRIME, la réactivation la refuse ; seules les portes prévues (invitation
 * acceptée par l'artisan, ajout par SIRET d'une agence) font entrer l'artisan dans un carnet.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);

const REFUS_NEUTRE = /Cet artisan n’est pas en relation avec votre organisation/;

describe.skipIf(!DB)("Liste noire locale : jamais sans relation préalable", () => {
  let db: Client;
  let agence: string, parc: string, adminAgence: string, proprietaire: string;
  let inconnu: string, duCarnet: string, sollicite: string, intervenu: string, devise: string;
  let incident: string, consultation: string;

  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async () =>
    id(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','ln-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`
    );
  const artisan = async (nom: string) =>
    id("insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite) values($1,lpad((random()*10^13)::bigint::text,14,'0'),'0600000000','valide','verifie','publique') returning id", [nom]);
  const devenir = async (qui: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]);
    await db.query("set local role authenticated");
  };
  const postgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const echec = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as Error).message;
    }
  };
  const relations = async (org: string, art: string) => {
    await postgres();
    return (await db.query("select statut, blacklist_le is not null as liste_noire from public.artisan_agences where organization_id=$1 and artisan_id=$2", [org, art])).rows;
  };
  /** Une demande de devis du parc, pour un bien de cette commune (code INSEE confirmé). */
  const consultationDuParc = async (cp: string, ville: string, commune: string) => {
    await postgres();
    const personne = await id("insert into public.persons(organization_id,nom) values($1,'Locataire du parc') returning id", [parc]);
    const bien = await id(
      "insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,commune_insee) values($1,'Bien du parc','appartement','1 rue du Test',$2,$3,$4) returning id",
      [parc, cp, ville, commune]
    );
    const lot = await id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot du parc') returning id", [parc, bien]);
    const inc = await id(
      "insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description,declarant_person_id,etat,imputation,imputation_justification) values($1,$2,'LNP-'||substr(gen_random_uuid()::text,1,8),'espace_locataire','plomberie_canalisation','Fuite',$3,'qualifie','proprietaire','Usure') returning id",
      [parc, lot, personne]
    );
    return id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [parc, inc]);
  };
  /** Un artisan du RÉSEAU de Gerimmo : avec son compte, validé, public, plomberie, zone Lyon 1er seulement. Depuis le
   * 23/10/2026 (20261023180000), le réseau suit la zone choisie par l'artisan : il est proposé à Lyon 1er, pas à Paris. */
  const artisanDuReseau = async () => {
    await postgres();
    const art = await artisan("Plomberie du réseau");
    // Le réseau n'admet qu'un artisan qui a son compte (reseau_artisan_eligible).
    await db.query("update public.artisans set account_id=$2 where id=$1", [art, await compte()]);
    await db.query("insert into public.artisan_metiers(artisan_id,metier) values($1,'plomberie')", [art]);
    await db.query("insert into public.artisan_zones(artisan_id,code_postal) values($1,'69001')", [art]);
    return art;
  };
  const HORS_ZONE = /plus disponible pour ce métier dans cette commune/;
  const ENTREE_PAR_LISTE_NOIRE = /n’est entré dans votre carnet que par votre liste noire/;

  beforeAll(async () => {
    db = new Client({ connectionString: DB });
    await db.connect();
    await db.query("begin");
    agence = await id("insert into public.organizations(name,type,status) values('Agence liste noire','agence','active') returning id");
    parc = await id("insert into public.organizations(name,type,status) values('Parc liste noire','proprietaire_direct','active') returning id");
    [adminAgence, proprietaire] = [await compte(), await compte()];
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'proprietaire_direct')", [adminAgence, agence, proprietaire, parc]);
    [inconnu, duCarnet, sollicite, intervenu, devise] = [
      await artisan("Artisan inconnu"), await artisan("Artisan du carnet"), await artisan("Artisan sollicité"),
      await artisan("Artisan intervenu"), await artisan("Artisan au devis"),
    ];
    await db.query("insert into public.artisan_agences(organization_id,artisan_id,statut,created_by) values($1,$2,'actif',$3)", [agence, duCarnet, adminAgence]);
    const personne = await id("insert into public.persons(organization_id,nom) values($1,'Locataire LN') returning id", [agence]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien LN','appartement','1 rue du Test','75011','Paris') returning id", [agence]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot LN') returning id", [agence, bien]);
    incident = await id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description,declarant_person_id) values($1,$2,'LN-'||substr(gen_random_uuid()::text,1,8),'espace_locataire','plomberie_canalisation','Fuite',$3) returning id", [agence, lot, personne]);
    consultation = await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id", [agence, incident]);
    await db.query("insert into public.incident_sollicitations(organization_id,incident_id,consultation_id,artisan_id,statut) values($1,$2,$3,$4,'refusee')", [agence, incident, consultation, sollicite]);
    await db.query("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','proposee')", [agence, incident, intervenu]);
    // Un devis SANS sollicitation de cet artisan (rattaché, pour l'essai, à la demande d'un autre) : le devis seul suffit.
    const solAutre = (await db.query("select id from public.incident_sollicitations where artisan_id=$1", [sollicite])).rows[0].id as string;
    await db.query(
      "insert into public.incident_devis(organization_id,incident_id,sollicitation_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,statut) values($1,$2,$3,$4,10000,'Devis LN',current_date+30,'non_retenu')",
      [agence, incident, solAutre, devise]
    );
  });
  beforeEach(async () => {
    await postgres();
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("sans relation : refus neutre, aucune ligne créée, la fiche reste illisible et hors du carnet", async () => {
    await devenir(proprietaire);
    const message = await echec("select public.artisan_blacklist_locale($1,$2,'Motif quelconque')", [parc, inconnu]);
    expect(message).toMatch(REFUS_NEUTRE);
    expect(await relations(parc, inconnu)).toEqual([]);
    await devenir(proprietaire);
    expect((await db.query("select id from public.artisans where id=$1", [inconnu])).rows).toEqual([]);
    expect((await db.query("select * from public.carnet_artisans_proprietaire($1)", [parc])).rows.map((l) => l.artisan_id)).not.toContain(inconnu);
    expect((await db.query("select artisan_id from public.artisan_agences where organization_id=$1", [parc])).rows).toEqual([]);
    // Une agence sans relation : même refus, même étanchéité.
    await devenir(adminAgence);
    expect(await echec("select public.artisan_blacklist_locale($1,$2,'Motif quelconque')", [agence, inconnu])).toMatch(REFUS_NEUTRE);
    expect(await relations(agence, inconnu)).toEqual([]);
  });

  it("le refus ne révèle pas l'existence de l'artisan : même message pour un identifiant qui n'existe pas", async () => {
    await devenir(proprietaire);
    const existant = await echec("select public.artisan_blacklist_locale($1,$2,'Motif')", [parc, inconnu]);
    const absent = await echec("select public.artisan_blacklist_locale($1,gen_random_uuid(),'Motif')", [parc]);
    expect(absent).toBe(existant);
  });

  it.each([
    ["une ligne du carnet", "duCarnet"],
    ["une sollicitation", "sollicite"],
    ["une intervention", "intervenu"],
    ["un devis", "devise"],
  ])("avec %s de cette organisation : mise sur liste noire acceptée", async (_relation, qui) => {
    const art = { duCarnet, sollicite, intervenu, devise }[qui]!;
    await devenir(adminAgence);
    await db.query("select public.artisan_blacklist_locale($1,$2,'Retards répétés')", [agence, art]);
    expect(await relations(agence, art)).toEqual([{ statut: "desactive", liste_noire: true }]);
  });

  it("la relation d'UNE autre organisation ne compte pas", async () => {
    for (const art of [duCarnet, sollicite, intervenu, devise]) {
      await devenir(proprietaire);
      expect(await echec("select public.artisan_blacklist_locale($1,$2,'Motif')", [parc, art])).toMatch(REFUS_NEUTRE);
      expect(await relations(parc, art)).toEqual([]);
    }
  });

  it("les autres gardes restent : rôle, motif obligatoire", async () => {
    await devenir(proprietaire);
    expect(await echec("select public.artisan_blacklist_locale($1,$2,'Motif')", [agence, duCarnet])).toMatch(/Accès refusé/);
    await devenir(adminAgence);
    expect(await echec("select public.artisan_blacklist_locale($1,$2,'  ')", [agence, duCarnet])).toMatch(/Le motif est obligatoire/);
  });

  // Troisième relecture du 15/10 : le scénario du relecteur, entièrement par les fonctions réelles, session du propriétaire.
  it("propriétaire direct : sollicitation réseau, liste noire, levée ; l'artisan n'entre pas dans le carnet et reste non sollicitable hors de sa zone", async () => {
    const art = await artisanDuReseau();
    const lyon = await consultationDuParc("69001", "Lyon", "69123");
    const paris = await consultationDuParc("75011", "Paris", "75056");
    await devenir(proprietaire);
    expect(await echec("select public.solliciter_artisan($1,$2,$3)", [parc, paris, art])).toMatch(HORS_ZONE);
    await db.query("select public.solliciter_artisan($1,$2,$3)", [parc, lyon, art]);
    await db.query("select public.artisan_blacklist_locale($1,$2,'Retards répétés')", [parc, art]);
    expect(await relations(parc, art)).toEqual([{ statut: "desactive", liste_noire: true }]);
    await devenir(proprietaire);
    await db.query("select public.artisan_lever_blacklist_locale($1,$2)", [parc, art]);
    // La ligne n'existait que par la liste noire : la levée la retire. Aucune relation active, rien dans le carnet.
    expect(await relations(parc, art)).toEqual([]);
    await devenir(proprietaire);
    expect((await db.query("select artisan_id from public.carnet_artisans_proprietaire($1)", [parc])).rows.map((l) => l.artisan_id)).not.toContain(art);
    expect(await echec("select public.solliciter_artisan($1,$2,$3)", [parc, paris, art])).toMatch(HORS_ZONE);
    // Ni invitation ni geste de l'artisan : rien d'autre n'a été créé.
    await postgres();
    expect((await db.query("select count(*)::int n from public.invitations_artisans where organization_id=$1", [parc])).rows[0].n).toBe(0);
  });

  it("une ligne entrée par la liste noire ne se réactive pas, ni sur liste noire, ni après la purge du motif ; la levée la retire", async () => {
    const art = await artisanDuReseau();
    const lyon = await consultationDuParc("69001", "Lyon", "69123");
    await devenir(proprietaire);
    await db.query("select public.solliciter_artisan($1,$2,$3)", [parc, lyon, art]);
    await db.query("select public.artisan_blacklist_locale($1,$2,'Retards répétés')", [parc, art]);
    await devenir(proprietaire);
    expect(await echec("select public.artisan_statut_local($1,$2,true)", [parc, art])).toMatch(ENTREE_PAR_LISTE_NOIRE);
    expect(await relations(parc, art)).toEqual([{ statut: "desactive", liste_noire: true }]);
    // Trois ans plus tard, la purge lève la mesure et laisse la ligne « désactivée » (maintenance_artisans) : toujours
    // pas de réactivation possible ; la désactivation, elle, reste permise.
    await db.query("update public.artisan_agences set blacklist_le=null, blacklist_motif=null, blacklist_par=null, purge_motif_le=null where organization_id=$1 and artisan_id=$2", [parc, art]);
    await devenir(proprietaire);
    expect(await echec("select public.artisan_statut_local($1,$2,true)", [parc, art])).toMatch(ENTREE_PAR_LISTE_NOIRE);
    await db.query("select public.artisan_statut_local($1,$2,false)", [parc, art]);
    expect(await relations(parc, art)).toEqual([{ statut: "desactive", liste_noire: false }]);
    await devenir(proprietaire);
    await db.query("select public.artisan_lever_blacklist_locale($1,$2)", [parc, art]);
    expect(await relations(parc, art)).toEqual([]);
  });

  it("agence : la levée retire aussi la ligne entrée par la liste noire ; l'ajout par SIRET reste la porte du carnet", async () => {
    await devenir(adminAgence);
    await db.query("select public.artisan_blacklist_locale($1,$2,'Retards répétés')", [agence, sollicite]);
    await devenir(adminAgence);
    expect(await echec("select public.artisan_statut_local($1,$2,true)", [agence, sollicite])).toMatch(ENTREE_PAR_LISTE_NOIRE);
    await db.query("select public.artisan_lever_blacklist_locale($1,$2)", [agence, sollicite]);
    expect(await relations(agence, sollicite)).toEqual([]);
    const siret = (await db.query("select siret from public.artisans where id=$1", [sollicite])).rows[0].siret as string;
    await devenir(adminAgence);
    await db.query("select public.artisan_creer_ou_rattacher($1,'Artisan sollicité',$2,'0600000000',null,array['plomberie']::public.artisan_metier[],array['75011'])", [agence, siret]);
    expect(await relations(agence, sollicite)).toEqual([{ statut: "actif", liste_noire: false }]);
    await devenir(adminAgence);
    await db.query("select public.artisan_statut_local($1,$2,false)", [agence, sollicite]);
    await db.query("select public.artisan_statut_local($1,$2,true)", [agence, sollicite]);
    expect(await relations(agence, sollicite)).toEqual([{ statut: "actif", liste_noire: false }]);
  });

  it("inchangé pour une ligne du carnet antérieure à la liste noire : la levée la remet active, la réactivation reste permise", async () => {
    await devenir(adminAgence);
    await db.query("select public.artisan_blacklist_locale($1,$2,'Retards répétés')", [agence, duCarnet]);
    await devenir(adminAgence);
    await db.query("select public.artisan_lever_blacklist_locale($1,$2)", [agence, duCarnet]);
    expect(await relations(agence, duCarnet)).toEqual([{ statut: "actif", liste_noire: false }]);
    await devenir(adminAgence);
    await db.query("select public.artisan_statut_local($1,$2,false)", [agence, duCarnet]);
    await db.query("select public.artisan_statut_local($1,$2,true)", [agence, duCarnet]);
    expect(await relations(agence, duCarnet)).toEqual([{ statut: "actif", liste_noire: false }]);
  });
});
