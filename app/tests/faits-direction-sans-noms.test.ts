/**
 * D13 (fiche SUP-05) et D48 (fiche IA-11), décisions du dirigeant du 14/10/2026.
 *
 * D13 : les « faits de direction » ne copient plus de noms de locataires. Une alerte y figure par son identifiant, un libellé
 * générique (le type d'alerte) et un lien, jamais par son titre, qui contient parfois un nom. Préparer ou lire les faits laisse une
 * trace par organisation citée. Les instantanés déjà enregistrés (format 1) s'effacent dans une étape séparée, irréversible,
 * qui exige une sauvegarde.
 *
 * D48 : une règle de conservation de six mois par registre d'exécution, appliquée par `appliquer_retention`.
 *
 * Tout est joué dans une transaction annulée à la fin, sur une base locale jetable déjà migrée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const migration = (nom: string) => readFileSync(`supabase/migrations/${nom}`, "utf8");
const MIGRATION_RETENTION = "20261014231000_retention_registres_execution.sql";
const MIGRATION_EFFACEMENT = "20261014232000_effacement_instantanes_faits_direction.sql";
const RETOUR_RETENTION = "supabase/retours-arriere/20261014231000_retention_registres_execution.retour.sql";

// « Aujourd'hui » est le jour de PARIS, comme dans la base (`preparer_faits_direction`) et dans l'écran, jamais `current_date` : la
// base de test est en UTC, et entre 22 h et 24 h UTC (minuit à 2 h à Paris en été) les deux jours diffèrent. Relevé à la relecture
// du 14/10 : sans cela, le test échouait chaque soir (et dans tout fuseau de session qui n'est pas celui de Paris).
const PARIS = "(now() at time zone 'Europe/Paris')::date";

const NOM = "Marie Durand";
const TITRE_ALERTE = `État des lieux d'entrée — Lot 1 · ${NOM}`;

describe.skipIf(!url)("D13 / D48 — faits de direction sans noms, conservation des registres", () => {
  let db: Client, sa: string, autre: string, org: string, alerte: string;

  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const as = async (id: string, aal = "aal2") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal })]);
    await db.query("set local role authenticated");
  };
  const failed = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refuse");
    try { await db.query(sql, args); return ""; }
    catch (e) { await db.query("rollback to savepoint refuse"); return (e as Error).message; }
    finally { await db.query("release savepoint refuse"); }
  };
  const compte = async () => (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-d13-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
  const preparer = async () => (await db.query("select public.preparer_faits_direction() d")).rows[0].d;
  const lire = async () => (await db.query(`select public.lire_faits_direction(${PARIS}) d`)).rows[0].d;
  const traces = async (action: string) => (await db.query("select organization_id, details from public.audit_log where account_id=$1 and action=$2 order by created_at", [sa, action])).rows;
  // Panne simulée de la source « échéances » SANS toucher au schéma des tables : pas de verrou exclusif, donc pas d'interblocage avec les autres fichiers de test.
  const casserLaSourceEcheances = () => db.query("create or replace function public.libelle_generique_alerte(p_type text) returns text language plpgsql immutable set search_path = '' as $$ begin raise exception 'panne simulée'; end $$");
  const nombre = async (sql: string, args: unknown[] = []) => Number((await db.query(sql, args)).rows[0].n);

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    sa = await compte(); autre = await compte();
    org = (await db.query("insert into public.organizations(name,status) values('TEST D13','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin'),($2,$3,'proprietaire_direct')", [sa, autre, org]);
    alerte = (await db.query(`insert into public.alerts(organization_id,type,criticite,titre,echeance) values($1,'edl_entree','normale',$2,${PARIS}+2) returning id`, [org, TITRE_ALERTE])).rows[0].id;
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("D13 — aucune copie de nom", () => {
    it("une alerte devient un identifiant, un libellé générique et un lien : ni le titre, ni le nom, ni le lot", async () => {
      await as(sa); const s = await preparer();
      const fait = s.sources.echeances.donnees.faits.find((f: { id: string }) => f.id === alerte);
      expect(fait).toBeTruthy();
      expect(fait.titre).toBe("Alerte · État des lieux d’entrée à faire");
      expect(fait.href).toBe(`/agence/${org}/alertes`);
      expect(fait.date).toBe((await db.query(`select (${PARIS} + 2)::text as d`)).rows[0].d);
      const brut = JSON.stringify(s);
      expect(brut).not.toContain("Marie");
      expect(brut).not.toContain("Durand");
      expect(brut).not.toContain("Lot 1");
      expect(brut).not.toContain(TITRE_ALERTE);
    });

    it("un type d'alerte inconnu, ou libre, ne donne qu'un libellé neutre : la valeur brute n'est jamais recopiée", async () => {
      await admin();
      await db.query(`insert into public.alerts(organization_id,type,criticite,titre,echeance) values($1,'type_libre_Jean_Martin','normale','Titre libre Jean Martin',${PARIS}+1)`, [org]);
      await as(sa); const s = await preparer();
      const brut = JSON.stringify(s);
      expect(brut).not.toContain("Jean");
      expect(brut).not.toContain("Martin");
      expect(s.sources.echeances.donnees.faits.some((f: { titre: string }) => f.titre === "Alerte · Alerte à traiter")).toBe(true);
    });

    it("les chiffres de la source et les autres sources sont inchangés", async () => {
      await as(sa); const s = await preparer();
      expect(s.indisponibles).toEqual([]);
      expect(s.sources.echeances.donnees.mesures.alertes_prochains_7_jours).toBeGreaterThanOrEqual(1);
      expect(Object.keys(s.sources).sort()).toEqual(["echeances", "incidents", "interventions", "loyers", "service"]);
      expect(s.version_regles).toBe(2);
      expect(s.auteur_reel).toBe(sa);
    });

    it("le dernier état connu ne reprend jamais un instantané ancien (format 1, avec des noms)", async () => {
      await admin();
      await db.query("delete from public.brief_direction_snapshots");
      const ancien = { statut: "disponible", observe_le: new Date().toISOString(), donnees: { mesures: { alertes_en_retard: 0, alertes_prochains_7_jours: 1, alertes_critiques: 0 }, faits: [{ titre: TITRE_ALERTE, date: null, href: "/x" }] } };
      await db.query(`insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(${PARIS},now()-interval '1 hour',$1,jsonb_build_object('echeances',$2::jsonb),1)`, [sa, JSON.stringify(ancien)]);
      await casserLaSourceEcheances();
      await as(sa); const s = await preparer();
      expect(s.indisponibles).toContain("echeances");
      expect(s.sources.echeances).toMatchObject({ statut: "indisponible", donnees: null, observe_le: null });
      expect(JSON.stringify(s)).not.toContain("Marie");
    });

    it("le dernier état connu d'un instantané récent (format 2) reste repris, sans nom", async () => {
      await admin(); await db.query("delete from public.brief_direction_snapshots");
      await as(sa); const initial = await preparer(); await admin();
      await casserLaSourceEcheances();
      await as(sa); const apres = await preparer();
      expect(apres.indisponibles).toContain("echeances");
      expect(apres.sources.echeances.statut).toBe("indisponible");
      expect(apres.sources.echeances.donnees).toEqual(initial.sources.echeances.donnees);
      expect(JSON.stringify(apres)).not.toContain("Durand");
    });
  });

  describe("D13 — consultation tracée", () => {
    it("préparer laisse une ligne par préparation et une par organisation citée, dans la même transaction", async () => {
      await as(sa); const s = await preparer(); await admin();
      const preparation = await traces("preparation_faits_direction");
      expect(preparation).toHaveLength(1);
      expect(preparation[0].organization_id).toBeNull();
      expect(preparation[0].details).toMatchObject({ snapshot: s.id });
      const consultations = (await traces("consultation_faits_direction")).filter((t) => t.organization_id === org);
      expect(consultations).toHaveLength(1);
      expect(consultations[0].details).toMatchObject({ snapshot: s.id, origine: "preparation" });
      expect(JSON.stringify(preparation) + JSON.stringify(consultations)).not.toContain("Durand");
    });

    it("lire l'écran trace chaque organisation citée, une seule fois par minute pour une même lecture", async () => {
      await as(sa); const s = await preparer(); await admin();
      await db.query("delete from public.audit_log where account_id=$1", [sa]);
      await as(sa); const lu = await lire(); expect(lu.id).toBe(s.id);
      await lire(); await admin();
      const lignes = (await traces("consultation_faits_direction")).filter((t) => t.organization_id === org);
      expect(lignes).toHaveLength(1);
      expect(lignes[0].details).toMatchObject({ snapshot: s.id, jour: lu.jour });
    });

    it("la préparation prend un verrou de transaction : une préparation simultanée d'une autre session doit attendre", async () => {
      await as(sa); await preparer(); await admin();
      const autre = new Client({ connectionString: url }); await autre.connect();
      try {
        await autre.query("begin");
        const { rows } = await autre.query("select pg_try_advisory_xact_lock(hashtext('brief_direction_manuel')) as obtenu");
        expect(rows[0].obtenu).toBe(false);
      } finally {
        await autre.query("rollback").catch(() => undefined);
        await autre.end();
      }
    });

    it("lire un jour qui a plusieurs instantanés rend le plus récent", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      const poser = async (age: string) => (await db.query(`insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(${PARIS},now()-$2::interval,$1,'{}',2) returning id`, [sa, age])).rows[0].id;
      await poser("3 hours"); const recent = await poser("1 hour"); await poser("2 hours");
      await as(sa); expect((await lire()).id).toBe(recent); await admin();
    });

    it("lire un jour sans instantané ne trace rien et ne renvoie rien", async () => {
      await admin(); await db.query("delete from public.brief_direction_snapshots");
      await as(sa); expect((await db.query(`select public.lire_faits_direction(${PARIS}) d`)).rows[0].d).toBeNull(); await admin();
      expect(await traces("consultation_faits_direction")).toHaveLength(0);
    });

    it("un compte ordinaire ou sans double vérification ne lit ni ne prépare, et ne laisse aucune trace", async () => {
      await as(sa); await preparer(); await admin();
      await db.query("delete from public.audit_log where account_id in ($1,$2)", [sa, autre]);
      await as(autre); expect(await failed(`select public.lire_faits_direction(${PARIS})`)).toMatch(/vérification/);
      await as(sa, "aal1"); expect(await failed(`select public.lire_faits_direction(${PARIS})`)).toMatch(/vérification/);
      expect(await failed("select public.preparer_faits_direction()")).toMatch(/vérification/);
      await admin();
      expect(await nombre("select count(*) n from public.audit_log where account_id in ($1,$2) and action like '%faits_direction'", [sa, autre])).toBe(0);
    });

    it("l'accès anonyme aux fonctions reste fermé", async () => {
      const { rows } = await db.query(`select has_function_privilege('anon','public.lire_faits_direction(date)','EXECUTE') l,
        has_function_privilege('anon','public.preparer_faits_direction()','EXECUTE') p, has_function_privilege('anon','public.collecter_source_direction(text)','EXECUTE') c`);
      expect(rows[0]).toEqual({ l: false, p: false, c: false });
    });
  });

  // Relecture du 14/10 : la promesse « chaque traversée est tracée » n'était vérifiée que pour la source « échéances » et une seule
  // organisation ; les bornes de la source (vingt faits, sept jours, alertes ouvertes seulement), la liste fermée des libellés et
  // le choix du dernier état connu n'étaient pas éprouvés. Ici : une organisation par source, des bornes exactes, les 25 libellés.
  describe("D13 — toutes les sources, plusieurs organisations, bornes exactes", () => {
    // Un dossier d'organisation alimentant au plus une source de faits (les trois qui ne sont pas les échéances).
    type Sources = { incidentUrgent?: boolean; missionEnRetard?: boolean; loyerEnRetard?: boolean };
    async function dossier(nom: string, avec: Sources) {
      const o = (await db.query("insert into public.organizations(name,status) values($1,'active') returning id", [`TEST D13 ${nom}`])).rows[0].id as string;
      const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien D13','immeuble','1 rue TEST','75001','Paris') returning id", [o])).rows[0].id;
      const lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot D13','loue') returning id", [o, bien])).rows[0].id;
      const personne = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','D13') returning id", [o])).rows[0].id;
      const sortie: { org: string; incident?: string; bail?: string } = { org: o };
      if (avec.loyerEnRetard) {
        sortie.bail = (await db.query("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-60,700,50) returning id", [o, lot, personne])).rows[0].id;
        await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,montant_du) values($1,$2,date_trunc('month',current_date),current_date-2,750)", [o, sortie.bail]);
      }
      if (avec.incidentUrgent || avec.missionEnRetard) {
        sortie.incident = (await db.query("insert into public.incidents(organization_id,numero,lot_id,canal,categorie,description,urgence) values($1,'TEST-D13-'||gen_random_uuid(),$2,'espace_locataire','plomberie_canalisation','Fuite fictive',$3::public.incident_urgence) returning id", [o, lot, avec.incidentUrgent ? "urgente" : "normale"])).rows[0].id;
      }
      if (avec.missionEnRetard) {
        const compteArtisan = await compte();
        const artisan = (await db.query("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme) values($1,'Artisan D13',lpad((random()*10^13)::bigint::text,14,'0'),'0600000000','valide') returning id", [compteArtisan])).rows[0].id;
        await db.query("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut,fin_prevue) values($1,$2,$3,'entretien_courant','acceptee',now()-interval '1 day')", [o, sortie.incident, artisan]);
      }
      return sortie;
    }
    const consultations = async () => (await traces("consultation_faits_direction")).filter((t) => t.organization_id);
    const alerteOuverte = async (echeanceSql: string, type = "manuelle") =>
      (await db.query(`insert into public.alerts(organization_id,type,criticite,titre,echeance) values($1,$2,'normale','Alerte de test',${echeanceSql}) returning id`, [org, type])).rows[0].id as string;
    const faits = (s: { sources: { echeances: { donnees: { faits: { id: string }[] } } } }) => s.sources.echeances.donnees.faits.map((f) => f.id);

    it("préparer trace UNE ligne par organisation citée, quelle que soit la source : incident urgent, mission en retard, loyer en retard, alerte", async () => {
      const incident = await dossier("incident", { incidentUrgent: true });
      const mission = await dossier("mission", { missionEnRetard: true });
      const loyer = await dossier("loyer", { loyerEnRetard: true });
      await as(sa); const s = await preparer(); await admin();
      // Les trois sources alimentent bien les faits (le test ne passe pas à vide).
      expect(s.sources.incidents.donnees.faits.map((f: { href: string }) => f.href)).toContain(`/agence/${incident.org}/incidents?sel=${incident.incident}`);
      expect(s.sources.interventions.donnees.faits.map((f: { href: string }) => f.href)).toContain(`/agence/${mission.org}/incidents?sel=${mission.incident}`);
      expect(s.sources.loyers.donnees.faits.map((f: { href: string }) => f.href)).toContain(`/agence/${loyer.org}/baux/${loyer.bail}`);
      const lignes = await consultations();
      for (const o of [org, incident.org, mission.org, loyer.org]) {
        const siennes = lignes.filter((t) => t.organization_id === o);
        expect(siennes, `organisation ${o}`).toHaveLength(1);
        expect(siennes[0].details).toMatchObject({ snapshot: s.id, origine: "preparation" });
      }
      // Une organisation citée deux fois (par deux faits) n'est tracée qu'une fois : autant de lignes que d'organisations.
      const organisations = lignes.map((t) => t.organization_id);
      expect(new Set(organisations).size).toBe(organisations.length);
      const preparation = await traces("preparation_faits_direction");
      expect(preparation[0].details.organisations).toBe(organisations.length);
    });

    it("lire l'écran trace LES MÊMES organisations, une ligne chacune (pas seulement la première)", async () => {
      const incident = await dossier("incident", { incidentUrgent: true });
      const mission = await dossier("mission", { missionEnRetard: true });
      const loyer = await dossier("loyer", { loyerEnRetard: true });
      await as(sa); const s = await preparer(); await admin();
      await db.query("delete from public.audit_log where account_id=$1", [sa]);
      await as(sa); const lu = await lire(); await admin();
      expect(lu.id).toBe(s.id);
      const lignes = await consultations();
      for (const o of [org, incident.org, mission.org, loyer.org]) {
        const siennes = lignes.filter((t) => t.organization_id === o);
        expect(siennes, `organisation ${o}`).toHaveLength(1);
        expect(siennes[0].details).toMatchObject({ snapshot: s.id, jour: lu.jour });
      }
      expect(lignes.length).toBeGreaterThanOrEqual(4);
    });

    it("une organisation supprimée depuis l'instantané n'est pas tracée (aucune ligne vers une organisation qui n'existe plus)", async () => {
      const loyer = await dossier("loyer", { loyerEnRetard: true });
      await as(sa); const s = await preparer(); await admin();
      await db.query("delete from public.audit_log where account_id=$1", [sa]);
      // Une trace est tenue par clé étrangère vers l'organisation : on retire les lignes du dossier puis l'organisation.
      await db.query("set local session_replication_role = replica");
      await db.query("delete from public.appels_loyer where organization_id=$1", [loyer.org]);
      await db.query("delete from public.baux where organization_id=$1", [loyer.org]);
      await db.query("delete from public.persons where organization_id=$1", [loyer.org]);
      await db.query("delete from public.lots where organization_id=$1", [loyer.org]);
      await db.query("delete from public.biens where organization_id=$1", [loyer.org]);
      await db.query("delete from public.organizations where id=$1", [loyer.org]);
      await db.query("set local session_replication_role = origin");
      await as(sa); expect((await lire()).id).toBe(s.id); await admin();
      expect((await consultations()).filter((t) => t.organization_id === loyer.org)).toHaveLength(0);
      expect((await consultations()).filter((t) => t.organization_id === org)).toHaveLength(1);
    });

    it("une alerte FERMÉE n'entre ni dans les faits ni dans les chiffres", async () => {
      await as(sa); const avant = await preparer(); await admin();
      const fermeeRetard = (await db.query("insert into public.alerts(organization_id,type,criticite,titre,echeance,statut,closed_at) values($1,'loyer_impaye','critique','Alerte fermée en retard',current_date-1,'fermee',now()) returning id", [org])).rows[0].id;
      const fermeeProche = (await db.query("insert into public.alerts(organization_id,type,criticite,titre,echeance,statut,closed_at) values($1,'loyer_impaye','critique','Alerte fermée proche',current_date+1,'fermee',now()) returning id", [org])).rows[0].id;
      await as(sa); const apres = await preparer(); await admin();
      expect(faits(apres)).not.toContain(fermeeRetard);
      expect(faits(apres)).not.toContain(fermeeProche);
      expect(apres.sources.echeances.donnees.mesures).toEqual(avant.sources.echeances.donnees.mesures);
    });

    it("la fenêtre est exacte : les alertes en retard et jusqu'à J+7 inclus y sont, J+8 n'y est pas ; les faits sont rangés par échéance", async () => {
      // Le jour de référence de la source est `current_date` de la session (comme la fonction), et non le jour de Paris des autres tests.
      await as(sa); const avant = await preparer(); await admin();
      const enRetard = await alerteOuverte("current_date-3");
      const limite = await alerteOuverte("current_date+7");
      const horsFenetre = await alerteOuverte("current_date+8");
      await as(sa); const apres = await preparer(); await admin();
      const ids = faits(apres);
      expect(ids).toContain(enRetard);
      expect(ids).toContain(limite);
      expect(ids).not.toContain(horsFenetre);
      expect(ids.indexOf(enRetard)).toBeLessThan(ids.indexOf(limite));
      const m0 = avant.sources.echeances.donnees.mesures, m1 = apres.sources.echeances.donnees.mesures;
      expect(m1.alertes_en_retard).toBe(m0.alertes_en_retard + 1);
      // J+7 compte dans « prochains 7 jours », J+8 non.
      expect(m1.alertes_prochains_7_jours).toBe(m0.alertes_prochains_7_jours + 1);
    });

    it("vingt faits au plus par source, mais les chiffres restent complets", async () => {
      await as(sa); const avant = await preparer(); await admin();
      await db.query("insert into public.alerts(organization_id,type,criticite,titre,echeance) select $1,'manuelle','normale','Alerte '||n,current_date+3 from generate_series(1,25) n", [org]);
      await as(sa); const apres = await preparer(); await admin();
      expect(apres.sources.echeances.donnees.faits).toHaveLength(20);
      expect(apres.sources.echeances.donnees.mesures.alertes_prochains_7_jours).toBe(avant.sources.echeances.donnees.mesures.alertes_prochains_7_jours + 25);
    });

    it("les alertes critiques sont comptées (ouvertes seulement)", async () => {
      await as(sa); const avant = await preparer(); await admin();
      await db.query("insert into public.alerts(organization_id,type,criticite,titre,echeance) values($1,'manuelle','critique','Critique',current_date+30)", [org]);
      await as(sa); const apres = await preparer(); await admin();
      expect(apres.sources.echeances.donnees.mesures.alertes_critiques).toBe(avant.sources.echeances.donnees.mesures.alertes_critiques + 1);
    });

    // La liste fermée, type par type : un libellé générique, jamais le type brut ni rien qui ressemble à un nom.
    const LIBELLES: Record<string, string> = {
      assurance_expiration: "Attestation d’assurance à renouveler",
      attestation_a_verifier: "Attestation à contrôler",
      avenant_devis_a_decider: "Dépassement de devis à décider",
      conge_intention: "Congé à confirmer",
      creneaux_arbitrage: "Rendez-vous à arbitrer",
      decompte: "Décompte de restitution à envoyer",
      decompte_lrar: "Décompte de restitution à envoyer en recommandé",
      diagnostic_expiration: "Diagnostic à renouveler",
      ecart_versement: "Écart de versement au propriétaire",
      edl_entree: "État des lieux d’entrée à faire",
      edl_sortie: "État des lieux de sortie à faire",
      facture_artisan_a_valider: "Facture d’artisan à contrôler",
      incident_a_qualifier: "Incident à qualifier",
      incident_conteste: "Imputation d’incident contestée",
      incident_imputation_a_reviser: "Imputation à réviser avant facturation",
      loyer_impaye: "Loyer impayé",
      manuelle: "Alerte saisie à la main",
      message_locataire: "Message d’un locataire",
      piece_deposee: "Pièce déposée à contrôler",
      restitution_echeance: "Restitution du dépôt de garantie à traiter",
      retenue_sans_justificatif: "Retenue sans justificatif",
      signature_a_reprendre: "Signature à reprendre",
      signature_retournee: "Document signé à contrôler",
      versement_proprietaire: "Versement au propriétaire à faire",
      zone_tendue_a_verifier: "Zone tendue à vérifier",
    };
    it.each(Object.entries(LIBELLES))("le type « %s » donne le libellé « %s »", async (type, libelle) => {
      expect((await db.query("select public.libelle_generique_alerte($1) l", [type])).rows[0].l).toBe(libelle);
    });
    it("25 types connus, aucun libellé n'est le type brut, tous distincts ; l'inconnu, le vide et l'absent donnent le libellé neutre", async () => {
      expect(Object.keys(LIBELLES)).toHaveLength(25);
      expect(new Set(Object.values(LIBELLES)).size).toBe(25);
      for (const [type, libelle] of Object.entries(LIBELLES)) expect(libelle).not.toContain(type);
      for (const inconnu of ["type_libre", "", "Loyer_Impaye", " loyer_impaye", "Marie Durand"]) {
        expect((await db.query("select public.libelle_generique_alerte($1) l", [inconnu])).rows[0].l, JSON.stringify(inconnu)).toBe("Alerte à traiter");
      }
      expect((await db.query("select public.libelle_generique_alerte(null) l")).rows[0].l).toBe("Alerte à traiter");
    });

    it("le dernier état connu est le PLUS RÉCENT instantané de version 2 qui a une observation ; ni un plus récent sans observation, ni un plus récent de version 1", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      const poser = async (version: number, age: string, echeances: unknown) => (await db.query(
        `insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(${PARIS},now()-$2::interval,$1,jsonb_build_object('echeances',$3::jsonb),$4) returning id`,
        [sa, age, JSON.stringify(echeances), version])).rows[0].id;
      const dispo = (marque: string, observe: string | null) => ({ statut: "disponible", observe_le: observe, donnees: { mesures: { marque }, faits: [] } });
      await poser(2, "5 hours", dispo("v2-ancien", "2026-10-01T08:00:00Z"));
      await poser(2, "3 hours", dispo("v2-recent", "2026-10-01T10:00:00Z"));
      await poser(2, "2 hours", dispo("v2-sans-observation", null));
      await poser(1, "1 hour", dispo("v1-tres-recent-avec-noms", "2026-10-01T11:00:00Z"));
      await casserLaSourceEcheances();
      await as(sa); const s = await preparer(); await admin();
      expect(s.indisponibles).toContain("echeances");
      expect(s.sources.echeances.donnees.mesures.marque).toBe("v2-recent");
      expect(s.sources.echeances.observe_le).toBe("2026-10-01T10:00:00Z");
    });
  });

  describe("D13 — effacement des instantanés existants (étape séparée, irréversible)", () => {
    const poserAncien = async () => (await db.query(`insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(${PARIS},now()-interval '2 hours',$1,jsonb_build_object('echeances',jsonb_build_object('statut','disponible','donnees',jsonb_build_object('mesures','{}'::jsonb,'faits',jsonb_build_array(jsonb_build_object('titre',$2::text))))),1) returning id`, [sa, TITRE_ALERTE])).rows[0].id;

    it("refuse d'effacer sans la confirmation d'une sauvegarde, et ne touche à rien", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      const ancien = await poserAncien();
      const message = await failed(migration(MIGRATION_EFFACEMENT));
      expect(message).toMatch(/sauvegarde/i);
      expect(message).toMatch(/IRRÉVERSIBLE/);
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [ancien])).toBe(1);
    });

    it("avec la confirmation : efface les instantanés du format 1, garde ceux du format 2, laisse une ligne d'audit", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      await db.query("delete from public.audit_log where action='effacement_instantanes_faits_direction'");
      const ancien = await poserAncien(); const ancien2 = await poserAncien();
      await as(sa); const recent = (await preparer()).id; await admin();
      await db.query("select set_config('gerimmo.sauvegarde_confirmee','oui',true)");
      await db.query(migration(MIGRATION_EFFACEMENT));
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=any($1::uuid[])", [[ancien, ancien2]])).toBe(0);
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [recent])).toBe(1);
      const { rows } = await db.query("select details from public.audit_log where action='effacement_instantanes_faits_direction'");
      expect(rows).toHaveLength(1);
      expect(rows[0].details).toMatchObject({ nombre: 2, decision: "D13", fiche: "SUP-05" });
      expect(JSON.stringify(rows)).not.toContain("Durand");
    });

    it("exige la migration 230000 : sans elle l'étape est refusée, même sans instantané ancien et même avec la confirmation", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      await db.query("select set_config('gerimmo.sauvegarde_confirmee','oui',true)");
      await db.query("drop function public.libelle_generique_alerte(text)");
      expect(await failed(migration(MIGRATION_EFFACEMENT))).toMatch(/appliquez d'abord 20261014230000/);
      // Avec un instantané ancien : la même erreur, rien n'est effacé.
      const ancien = await poserAncien();
      expect(await failed(migration(MIGRATION_EFFACEMENT))).toMatch(/appliquez d'abord 20261014230000/);
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [ancien])).toBe(1);
    });

    // La confirmation est le mot « oui », rien d'autre : une valeur non vide quelconque ne vaut pas sauvegarde.
    it.each(["non", "true", "1", "OUI", "oui ", "yes", "sauvegarde faite", ""])("la confirmation « %s » ne suffit pas : rien n'est effacé", async (valeur) => {
      await db.query("delete from public.brief_direction_snapshots");
      const ancien = await poserAncien();
      await db.query("select set_config('gerimmo.sauvegarde_confirmee',$1,true)", [valeur]);
      expect(await failed(migration(MIGRATION_EFFACEMENT))).toMatch(/IRRÉVERSIBLE/);
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [ancien])).toBe(1);
      expect(await nombre("select count(*) n from public.audit_log where action='effacement_instantanes_faits_direction'")).toBe(0);
    });

    it("sans instantané ancien, l'étape passe sans confirmation et se rejoue sans effet", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      await as(sa); const recent = (await preparer()).id; await admin();
      await db.query(migration(MIGRATION_EFFACEMENT));
      await db.query(migration(MIGRATION_EFFACEMENT));
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [recent])).toBe(1);
    });
  });

  describe("D48 — une règle de six mois par registre, appliquée par appliquer_retention", () => {
    const REGISTRES = ["agent_passages", "supervision_operations", "points_du_matin", "decisions_du_matin", "brief_direction_snapshots"];
    let ancien: Record<string, string>, recent: Record<string, string>;

    async function poserRegistres() {
      ancien = {}; recent = {};
      const mission = (await db.query("select cle from public.agent_missions limit 1")).rows[0].cle;
      // Les âges encadrent la limite de six mois de part et d'autre (tout le test tourne dans UNE transaction : `now()` est le même
      // à la pose et à la purge, donc un âge pile égal à la limite ne dépasserait jamais).
      for (const [cible, age] of [[ancien, "6 months 10 days"], [recent, "5 months 20 days"]] as const) {
        cible.agent_passages = (await db.query("insert into public.agent_passages(mission,debut,etat) values($1,now()-$2::interval,'reussi') returning id", [mission, age])).rows[0].id;
        cible.supervision_operations = (await db.query("insert into public.supervision_operations(action,auteur,cree_le) values('consigne_executee',$1,now()-$2::interval) returning id", [sa, age])).rows[0].id;
        cible.brief_direction_snapshots = (await db.query(`insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(${PARIS},now()-$2::interval,$1,'{}',2) returning id`, [sa, age])).rows[0].id;
        const point = (await db.query(`insert into public.points_du_matin(jour,equipe,genere_le) values(${PARIS},'test_d48_'||substr(gen_random_uuid()::text,1,8),now()-$1::interval) returning id`, [age])).rows[0].id;
        cible.points_du_matin = point;
        cible.decisions_du_matin = (await db.query("insert into public.decisions_du_matin(point_id,cle,titre,pourquoi,source,cree_le) values($1,'test-d48','Décision de test','Pour le test','retour',now()-$2::interval) returning id", [point, age])).rows[0].id;
      }
    }
    const existe = async (table: string, id: string) => (await nombre(`select count(*) n from public.${table} where id=$1`, [id])) === 1;

    it("cinq règles actives de six mois, par suppression, une par registre", async () => {
      const { rows } = await db.query("select data_type, duree_mois, sort::text sort, actif, declencheur, libelle, finalite from public.retention_rules where data_type = any($1::text[]) order by data_type", [REGISTRES.map((r) => `journal:${r}`)]);
      expect(rows.map((r) => r.data_type)).toEqual(REGISTRES.map((r) => `journal:${r}`).sort());
      for (const r of rows) {
        expect(r).toMatchObject({ duree_mois: 6, sort: "suppression", actif: true });
        expect(r.libelle.length).toBeGreaterThan(5);
        expect(r.finalite.length).toBeGreaterThan(10);
        expect(r.declencheur.length).toBeGreaterThan(3);
      }
    });

    it("appliquer_retention supprime ce qui a plus de six mois dans chaque registre et garde le reste, compte à l'appui", async () => {
      await poserRegistres();
      await as(sa);
      const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b;
      await admin();
      for (const r of REGISTRES) {
        expect(await existe(r, ancien[r]), `${r} : ligne de 7 mois`).toBe(false);
        expect(await existe(r, recent[r]), `${r} : ligne de 5 mois`).toBe(true);
        expect(bilan.journaux[r], `bilan ${r}`).toBeGreaterThanOrEqual(1);
      }
    });

    it("une règle désactivée n'efface rien dans son registre, les autres continuent", async () => {
      await poserRegistres();
      await db.query("update public.retention_rules set actif=false where data_type='journal:agent_passages'");
      await as(sa); const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b; await admin();
      expect(await existe("agent_passages", ancien.agent_passages)).toBe(true);
      expect(bilan.journaux.agent_passages).toBeUndefined();
      expect(await existe("supervision_operations", ancien.supervision_operations)).toBe(false);
    });

    // Pour chaque registre, la règle désactivée protège ses lignes anciennes ; les autres registres sont purgés comme d'habitude.
    // (Désactiver les décisions garde aussi leur point : un point ne part pas tant qu'il lui reste une décision.)
    it.each(REGISTRES)("règle « %s » désactivée : ses lignes anciennes restent, celles des autres registres partent", async (registre) => {
      await poserRegistres();
      await db.query("update public.retention_rules set actif=false where data_type=$1", [`journal:${registre}`]);
      await as(sa); const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b; await admin();
      const gardees = registre === "decisions_du_matin" ? ["decisions_du_matin", "points_du_matin"] : [registre];
      for (const r of REGISTRES) {
        expect(await existe(r, ancien[r]), `${r} (règle ${registre} désactivée)`).toBe(gardees.includes(r));
        expect(await existe(r, recent[r]), `${r} récent`).toBe(true);
      }
      expect(bilan.journaux[registre], `bilan ${registre}`).toBeUndefined();
    });

    it("les cinq règles désactivées : aucun registre n'est touché, aucune ligne au journal technique", async () => {
      await poserRegistres();
      await db.query("delete from public.tech_log where evenement='purge_registres_execution'");
      await db.query("update public.retention_rules set actif=false where data_type = any($1::text[])", [REGISTRES.map((r) => `journal:${r}`)]);
      await as(sa); await db.query("select public.appliquer_retention()"); await admin();
      for (const r of REGISTRES) expect(await existe(r, ancien[r]), r).toBe(true);
      expect(await nombre("select count(*) n from public.tech_log where evenement='purge_registres_execution'")).toBe(0);
    });

    it("une purge qui supprime laisse UNE ligne au journal technique, avec des nombres seulement ; une purge à vide n'en laisse aucune", async () => {
      await poserRegistres();
      await db.query("delete from public.tech_log where evenement='purge_registres_execution'");
      await as(sa); const bilan = (await db.query("select public.purger_registres_execution() b")).rows[0].b; await admin();
      const lignes = (await db.query("select details from public.tech_log where evenement='purge_registres_execution'")).rows;
      expect(lignes).toHaveLength(1);
      expect(lignes[0].details).toEqual(bilan);
      for (const r of REGISTRES) expect(lignes[0].details[r], r).toBeGreaterThanOrEqual(1);
      expect(Object.values(lignes[0].details).every((v) => typeof v === "number")).toBe(true);
      expect(JSON.stringify(lignes)).not.toContain("Décision de test");
      // Une seconde purge n'a plus rien à supprimer : le bilan est à zéro et le journal ne change pas.
      await as(sa); const vide = (await db.query("select public.purger_registres_execution() b")).rows[0].b; await admin();
      for (const r of REGISTRES) expect(vide[r], r).toBe(0);
      expect(await nombre("select count(*) n from public.tech_log where evenement='purge_registres_execution'")).toBe(1);
    });

    it("un point n'emporte pas une décision encore dans sa durée : il attend que ses décisions partent", async () => {
      await poserRegistres();
      await db.query("update public.decisions_du_matin set cree_le=now()-interval '1 day' where id=$1", [ancien.decisions_du_matin]);
      await as(sa); await db.query("select public.appliquer_retention()"); await admin();
      expect(await existe("decisions_du_matin", ancien.decisions_du_matin)).toBe(true);
      expect(await existe("points_du_matin", ancien.points_du_matin)).toBe(true);
    });

    it("la règle des décisions désactivée garde aussi leur point, même ancien", async () => {
      await poserRegistres();
      await db.query("update public.retention_rules set actif=false where data_type='journal:decisions_du_matin'");
      await as(sa); await db.query("select public.appliquer_retention()"); await admin();
      expect(await existe("decisions_du_matin", ancien.decisions_du_matin)).toBe(true);
      expect(await existe("points_du_matin", ancien.points_du_matin)).toBe(true);
    });

    it("réservée à la supervision (ou au traitement planifié), fermée à anon, rejouable sans effet", async () => {
      await as(autre); expect(await failed("select public.purger_registres_execution()")).toMatch(/réservée/);
      await admin();
      expect((await db.query("select has_function_privilege('anon','public.purger_registres_execution()','EXECUTE') ok")).rows[0].ok).toBe(false);
      const avant = (await db.query("select md5(pg_get_functiondef('public.appliquer_retention()'::regprocedure)) m")).rows[0].m;
      await db.query(migration(MIGRATION_RETENTION));
      expect((await db.query("select md5(pg_get_functiondef('public.appliquer_retention()'::regprocedure)) m")).rows[0].m).toBe(avant);
      expect(await nombre("select count(*) n from public.retention_rules where data_type like 'journal:%' and data_type = any($1::text[])", [REGISTRES.map((r) => `journal:${r}`)])).toBe(5);
    });

    it("appliquer_retention garde ses appels antérieurs et appelle la purge des registres une seule fois", async () => {
      const { rows: [{ f }] } = await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) f");
      expect(f.match(/purger_registres_execution/g)).toHaveLength(1);
      expect(f).toContain("purger_signalements_support");
      expect(f).toContain("debut_conservation_document");
      expect(f).toContain("journal:tech_log");
    });
  });

  // Relecture du 14/10 : le retour de 231000 recopiait la définition d'appliquer_retention d'AVANT la migration. Joué après la
  // migration 20261014200000 (branche lot-arret-taches), qui injecte dans la même fonction la garde de l'arrêt d'urgence
  // (« Audit du 14/10 (SUP-01) »), il supprimait cette garde en silence. Il ne retire plus que le bloc que 231000 a posé.
  describe("D48 — le retour arrière retire le bloc de 231000 et rien d'autre (composable avec l'arrêt d'urgence, SUP-01)", () => {
    // Le script gère SA transaction (garde « pas dans un lot », begin, commit) : pour le jouer ici, dans la transaction du test
    // (annulée à la fin), on en retire ces trois éléments. Le reste est exécuté tel quel.
    const retourSansTransaction = () => readFileSync(RETOUR_RETENTION, "utf8")
      .replace(/^do \$retour_arriere\$\nbegin\n  if statement_timestamp\(\)[\s\S]*?end \$retour_arriere\$;\n/m, "")
      .replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    // L'ancre de 231000 : la dernière purge de la fonction, derrière laquelle l'appel est posé.
    const ANCRE_SIGNALEMENTS = "  v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());";
    // La technique et le texte de la garde de 20261014200000 pour cette fonction : ancre = fin du contrôle d'appelant.
    const ANCRE = "    raise exception 'appliquer_retention: reserve au super admin';\n  end if;\n";
    const GARDE = `  -- Audit du 14/10 (SUP-01) : l'arrêt d'urgence couvre aussi cette tâche pg_cron. Arrêt actif : aucun effet.
  if not public.tache_planifiee_autorisee('retention-quotidienne') then
    return jsonb_build_object('arret_en_cours', true, 'journaux', '{}'::jsonb, 'documents_purges', 0, 'documents_anonymises', 0);
  end if;
`;
    const definition = async () => (await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) f")).rows[0].f as string;
    const poserGardeArret = async () => {
      // Le prédicat vient de l'autre migration : ici, un double qui laisse tout passer (la garde est testée en tant que TEXTE conservé).
      await db.query("create or replace function public.tache_planifiee_autorisee(p_tache text) returns boolean language sql stable set search_path = '' as 'select true'");
      const def = await definition();
      expect(def.split(ANCRE)).toHaveLength(2);
      await db.query(def.replace(ANCRE, ANCRE + GARDE));
    };
    const jouerRetour = () => db.query(retourSansTransaction());

    it("sans autre migration : l'appel à la purge disparaît, le reste de la fonction est intact, la purge et les cinq règles sont retirées", async () => {
      const avant = await definition();
      await jouerRetour();
      const apres = await definition();
      expect(apres).not.toContain("purger_registres_execution");
      expect(apres).not.toContain("D48 / D13");
      // Le texte d'avant la migration, à l'identique : on a retiré exactement le bloc ajouté.
      expect(apres).toBe(avant.replace(/\n\n  -- D48 \/ D13[^\n]*\n  v_journaux := v_journaux \|\| public\.purger_registres_execution\(\);/, ""));
      expect(apres).toContain("v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());\n  return jsonb_build_object('journaux', v_journaux");
      expect(await nombre("select count(*) n from pg_proc where proname='purger_registres_execution'")).toBe(0);
      expect(await nombre("select count(*) n from public.retention_rules where data_type like 'journal:%' and data_type = any($1::text[])", [["agent_passages", "supervision_operations", "points_du_matin", "decisions_du_matin", "brief_direction_snapshots"].map((r) => `journal:${r}`)])).toBe(0);
      // La fonction reste appelable et rend le bilan de ses autres journaux.
      await as(sa);
      const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b;
      await admin();
      expect(bilan).toHaveProperty("journaux");
      expect(bilan.journaux).not.toHaveProperty("agent_passages");
    });

    it("après la garde de l'arrêt d'urgence (SUP-01) : la garde RESTE, seul le bloc de 231000 part", async () => {
      await poserGardeArret();
      const avant = await definition();
      expect(avant).toContain("Audit du 14/10 (SUP-01)");
      expect(avant).toContain("purger_registres_execution");
      await jouerRetour();
      const apres = await definition();
      expect(apres).toContain("Audit du 14/10 (SUP-01)");
      expect(apres).toContain("tache_planifiee_autorisee('retention-quotidienne')");
      expect(apres).not.toContain("purger_registres_execution");
      expect(apres).not.toContain("D48 / D13");
      // Rien d'autre n'a bougé : la définition d'après est celle d'avant, moins le bloc.
      expect(apres.length).toBeLessThan(avant.length);
      expect(apres).toBe(avant.replace(/\n\n  -- D48 \/ D13[^\n]*\n  v_journaux := v_journaux \|\| public\.purger_registres_execution\(\);/, ""));
      // Et la fonction s'exécute encore avec la garde.
      await as(sa); await db.query("select public.appliquer_retention()"); await admin();
    });

    it("dans l'autre ordre (garde posée AVANT la migration 231000) : l'aller s'ajoute à la garde, le retour ne retire que lui", async () => {
      await jouerRetour();
      await poserGardeArret();
      await db.query(migration(MIGRATION_RETENTION));
      const ensemble = await definition();
      expect(ensemble).toContain("Audit du 14/10 (SUP-01)");
      expect(ensemble.match(/purger_registres_execution/g)).toHaveLength(1);
      // L'appel est POSÉ APRÈS l'ancre (qui reste), avant le bilan : rien n'est remplacé.
      expect(ensemble.split(ANCRE_SIGNALEMENTS)).toHaveLength(2);
      expect(ensemble).toMatch(/purger_signalements_support\(\)\);\n\n  -- D48 \/ D13[^\n]*\n  v_journaux := v_journaux \|\| public\.purger_registres_execution\(\);\n  return jsonb_build_object\('journaux'/);
      await jouerRetour();
      const apres = await definition();
      expect(apres).toContain("Audit du 14/10 (SUP-01)");
      expect(apres).not.toContain("purger_registres_execution");
    });

    it("rejouable : sur une fonction déjà revenue, la marque est absente, rien n'est fait et aucune erreur", async () => {
      await jouerRetour();
      const apres = await definition();
      await db.query("create function public.purger_registres_execution() returns jsonb language sql as $$ select '{}'::jsonb $$");
      await jouerRetour();
      expect(await definition()).toBe(apres);
    });

    it("fonction réécrite depuis (la marque est là, le bloc n'y est plus exactement une fois) : le script s'arrête, rien n'est supprimé", async () => {
      const def = await definition();
      await db.query(def.replace("-- D48 / D13 (IA-11, SUP-05)", "-- D48 / D13 (IA-11, SUP-05, retouché)"));
      const message = await failed(retourSansTransaction());
      expect(message).toMatch(/figure 0 fois \(attendu : une\)/);
      expect(message).toMatch(/rien n'a été modifié/);
      // La fonction de purge est toujours là et toujours appelée : le retour ne la retire jamais sous un appel qui la nomme.
      expect(await nombre("select count(*) n from pg_proc where proname='purger_registres_execution'")).toBe(1);
      expect(await definition()).toContain("public.purger_registres_execution()");
      expect(await nombre("select count(*) n from public.retention_rules where data_type='journal:agent_passages'")).toBe(1);
    });

    // La migration injecte son appel APRÈS une ancre qui doit figurer exactement une fois : sinon elle s'arrête plutôt que
    // de réécrire la fonction de mémoire ou d'injecter deux fois.
    it("la migration s'arrête si l'ancre d'appliquer_retention a disparu, et ne réécrit rien", async () => {
      await jouerRetour();
      const def = await definition();
      expect(def.split(ANCRE_SIGNALEMENTS)).toHaveLength(2);
      await db.query(def.replace(ANCRE_SIGNALEMENTS, ""));
      const sansAncre = await definition();
      expect(await failed(migration(MIGRATION_RETENTION))).toMatch(/définition de appliquer_retention inattendue \(ancre absente ou répétée\)/);
      expect(await definition()).toBe(sansAncre);
    });

    it("la migration s'arrête si l'ancre figure deux fois, et ne réécrit rien", async () => {
      await jouerRetour();
      const def = await definition();
      await db.query(def.replace(ANCRE_SIGNALEMENTS, ANCRE_SIGNALEMENTS + "\n" + ANCRE_SIGNALEMENTS));
      const doublee = await definition();
      expect(await failed(migration(MIGRATION_RETENTION))).toMatch(/ancre absente ou répétée/);
      expect(await definition()).toBe(doublee);
    });

    it("rejouée sur une fonction qui porte déjà l'appel, la migration ne l'ajoute pas une seconde fois", async () => {
      await db.query(migration(MIGRATION_RETENTION));
      await db.query(migration(MIGRATION_RETENTION));
      expect((await definition()).match(/purger_registres_execution/g)).toHaveLength(1);
    });

    it("le script refuse de se jouer dans un lot déjà ouvert (il valide sa propre transaction)", async () => {
      const message = await failed(readFileSync(RETOUR_RETENTION, "utf8"));
      expect(message).toMatch(/Retour arrière refusé/);
      expect(await nombre("select count(*) n from pg_proc where proname='purger_registres_execution'")).toBe(1);
    });
  });
});
