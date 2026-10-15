/**
 * L'arrêt d'urgence couvre aussi les tâches SQL planifiées par pg_cron (D06, option A).
 *
 * Avant la migration 20261014200000, la supervision pouvait afficher « arrêt actif » pendant que
 * pg_cron supprimait des lignes (rétention), générait les appels de loyer (cycle mensuel), posait
 * des alertes et appelait le serveur du marketing. Ces tests gardent :
 *  — la table de correspondance (chaque tâche pg_cron a sa ou ses clés, rien d'autre) ;
 *  — le prédicat (arrêt global, clé de la tâche, autre clé, arrêt levé), fermé à tous les rôles ;
 *  — les huit fonctions : arrêt actif = AUCUN effet (la même fonction, la même base, le même appel
 *    produisent un effet quand l'arrêt est levé : le test n'est pas vide) ;
 *  — le rejeu de la migration, sans effet.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Tout est joué dans une transaction annulée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { TACHES_SQL } from "../src/lib/nom-arret-supervision";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261014200000_arret_urgence_taches_planifiees.sql", "utf8");

/** Les 9 tâches pg_cron (la 9ᵉ, « maintenance-artisans », vient du lot maintenance des artisans), et la clé d'arrêt (en plus de « global ») qui arrête chacune. */
const CORRESPONDANCE: Record<string, string[]> = {
  "retention-quotidienne": ["purge"],
  "cycle-mensuel": ["appels", "quittances"],
  "alertes-impayes-quotidiennes": ["relances"],
  "alertes-diagnostics-quotidiennes": ["rappels"],
  "alertes-assurance-quotidiennes": ["rappels"],
  "alertes-restitutions-quotidiennes": ["rappels"],
  "propositions-publication-hebdo": ["marketing"],
  "marketing-declencheur": ["marketing"],
  "maintenance-artisans": ["rappels"],
};
const FONCTIONS: [tache: string, signature: string][] = [
  ["retention-quotidienne", "public.appliquer_retention()"],
  ["cycle-mensuel", "public.cycle_mensuel_interne()"],
  ["alertes-impayes-quotidiennes", "public.generer_alertes_impayes()"],
  ["alertes-diagnostics-quotidiennes", "public.generer_alertes_diagnostics()"],
  ["alertes-assurance-quotidiennes", "public.generer_alertes_assurance()"],
  ["alertes-restitutions-quotidiennes", "public.generer_alertes_restitution()"],
  ["propositions-publication-hebdo", "public.proposer_publications_interne(date)"],
  ["marketing-declencheur", "public.declencher_marketing()"],
];
const MARQUE = "Audit du 14/10 (SUP-01)";

describe.skipIf(!DB_URL)("arrêt d'urgence et tâches planifiées (D06)", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); auteur = undefined; });
  afterEach(async () => { await db.query("rollback"); });

  // ── Aides ────────────────────────────────────────────────────────────────

  async function creerUtilisateur(): Promise<string> {
    const { rows: [{ id }] } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-atp-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    return id;
  }

  /** Se faire passer pour un compte, ou pour pg_cron (accountId null : aucun jeton). */
  async function simuler(accountId: string | null, role = "authenticated") {
    await db.query("reset role");
    if (accountId) {
      await db.query(
        `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated','aal','aal2')::text, true)`,
        [accountId]
      );
    } else {
      await db.query(`select set_config('request.jwt.claims', '', true)`);
    }
    await db.query(`set local role ${role}`);
  }
  const commeCron = () => simuler(null, "postgres");

  let auteur: string | undefined;
  /** Pose (ou lève) un arrêt, comme le ferait commander_arret_supervision. */
  async function arreter(cle: string, arrete = true) {
    await db.query("reset role");
    auteur ??= await creerUtilisateur();
    await db.query(
      `insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, $2, 'Essai de contrôle', $3)
       on conflict (cle) do update set arrete = excluded.arrete`,
      [cle, arrete, auteur]
    );
  }

  async function compter(sql: string, params: unknown[] = []): Promise<number> {
    await db.query("reset role");
    const { rows: [{ n }] } = await db.query<{ n: string }>(sql, params);
    return Number(n);
  }

  async function organisation(): Promise<{ org: string; gerant: string }> {
    await db.query("reset role");
    const { rows: [{ id: org }] } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status) values ('Arrêt tâches', 'active') returning id`
    );
    const gerant = await creerUtilisateur();
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`, [gerant, org]);
    return { org, gerant };
  }

  /** Un bien, son lot et un bail actif commencé il y a `moisEnArriere` mois. */
  async function bailActif(org: string, gerant: string, moisEnArriere = 3): Promise<{ bail: string; bien: string; lot: string }> {
    await simuler(gerant);
    const { rows: [{ id: bien }] } = await db.query<{ id: string }>(
      `select public.creer_bien_avec_lot($1,'1 rue Arrêt','appartement'::public.bien_type,'1 rue Arrêt',null,'75001','Paris',1990,false,45,2) as id`,
      [org]
    );
    const { rows: [{ id: lot }] } = await db.query<{ id: string }>(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query("reset role");
    const { rows: [{ id: loc }] } = await db.query<{ id: string }>(`insert into public.persons (organization_id, nom) values ($1,'Locataire') returning id`, [org]);
    const { rows: [{ id: bail }] } = await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, etat, date_debut, jour_echeance)
       values ($1,$2,$3,700,50,'actif',(date_trunc('month', current_date) - make_interval(months => $4::int))::date, 1) returning id`,
      [org, lot, loc, moisEnArriere]
    );
    await couvrirParMandat(db, bail);
    return { bail, bien, lot };
  }

  // ── La table de correspondance ──────────────────────────────────────────

  it("couvre exactement les tâches planifiées par pg_cron, avec les clés validées contre le code", async () => {
    await db.query("reset role");
    const { rows: planifiees } = await db.query<{ jobname: string }>(`select jobname from cron.job order by 1`);
    const { rows: table } = await db.query<{ tache: string; cle: string }>(`select tache, cle from public.supervision_taches_arret order by 1, 2`);
    expect(planifiees.map((j) => j.jobname)).toEqual(Object.keys(CORRESPONDANCE).sort());
    const lue: Record<string, string[]> = {};
    for (const { tache, cle } of table) (lue[tache] ??= []).push(cle);
    expect(lue).toEqual(CORRESPONDANCE);
    // Chaque clé est une clé que le contrôle d'arrêt des routes connaît déjà (même vocabulaire que verifierAvantEffet).
    for (const cle of new Set(table.map((t) => t.cle))) {
      await db.query("reset role");
      await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      await db.query("set local role service_role");
      const { rows: [{ ok }] } = await db.query(`select public.verifier_arret_supervision($1) as ok`, [cle]);
      expect(ok, cle).toBe(true);
    }
  });

  it("la table n'est lisible que du superviseur permanent et n'est écrite par aucun rôle", async () => {
    await db.query("reset role");
    const droits = await db.query<{ role: string; select: boolean; ecriture: boolean }>(
      `select r.rolname as role,
              has_table_privilege(r.rolname, 'public.supervision_taches_arret', 'SELECT') as select,
              has_table_privilege(r.rolname, 'public.supervision_taches_arret', 'INSERT,UPDATE,DELETE') as ecriture
         from (values ('anon'),('authenticated'),('service_role')) r(rolname) order by 1`
    );
    expect(droits.rows).toEqual([
      { role: "anon", select: false, ecriture: false },
      { role: "authenticated", select: true, ecriture: false },
      { role: "service_role", select: true, ecriture: false },
    ]);
    const { rows: [{ rls }] } = await db.query(`select relrowsecurity as rls from pg_class where oid = 'public.supervision_taches_arret'::regclass`);
    expect(rls).toBe(true);
    // Un compte quelconque, même connecté, ne lit aucune ligne.
    const simple = await creerUtilisateur();
    await simuler(simple);
    const { rows: [{ n }] } = await db.query(`select count(*) as n from public.supervision_taches_arret`);
    expect(Number(n)).toBe(0);
  });

  // ── Le prédicat ──────────────────────────────────────────────────────────

  it("est fermé à tous les rôles : ni anon, ni connecté, ni le service", async () => {
    await db.query("reset role");
    const { rows } = await db.query<{ role: string; peut: boolean }>(
      `select r.rolname as role, has_function_privilege(r.rolname, 'public.tache_planifiee_autorisee(text)', 'EXECUTE') as peut
         from (values ('anon'),('authenticated'),('service_role')) r(rolname) order by 1`
    );
    expect(rows).toEqual([
      { role: "anon", peut: false },
      { role: "authenticated", peut: false },
      { role: "service_role", peut: false },
    ]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.query("savepoint refus");
      await simuler(null, role);
      await expect(db.query(`select public.tache_planifiee_autorisee('cycle-mensuel')`), role).rejects.toThrow(/permission denied/);
      await db.query("rollback to savepoint refus");
    }
    const { rows: [{ ok }] } = await (async () => { await commeCron(); return db.query(`select public.tache_planifiee_autorisee('cycle-mensuel') as ok`); })();
    expect(ok).toBe(true);
  });

  it("refuse une tâche inconnue plutôt que de la laisser s'exécuter", async () => {
    await commeCron();
    await expect(db.query(`select public.tache_planifiee_autorisee('tache-inventee')`)).rejects.toThrow(/inconnue/);
  });

  it.each(Object.entries(CORRESPONDANCE))("%s : s'arrête sur « global » et sur ses clés, jamais sur une autre", async (tache, cles) => {
    const autorisee = async () => {
      await commeCron();
      const { rows: [{ ok }] } = await db.query(`select public.tache_planifiee_autorisee($1) as ok`, [tache]);
      return ok as boolean;
    };
    expect(await autorisee()).toBe(true);
    // Une clé qui n'est pas la sienne ne l'arrête pas.
    await arreter("territoire");
    expect(await autorisee()).toBe(true);
    await arreter("territoire", false);
    for (const cle of ["global", ...cles]) {
      await arreter(cle);
      expect(await autorisee(), `${cle} actif`).toBe(false);
      await arreter(cle, false);
      expect(await autorisee(), `${cle} levé`).toBe(true);
    }
  });

  it("les huit fonctions portent la marque et le nom de leur tâche ; pg_cron les appelle toujours telles quelles", async () => {
    await db.query("reset role");
    for (const [tache, signature] of FONCTIONS) {
      const { rows: [{ def }] } = await db.query(`select pg_get_functiondef($1::text::regprocedure) as def`, [signature]);
      expect(def, signature).toContain(MARQUE);
      expect(def, signature).toContain(`public.tache_planifiee_autorisee('${tache}')`);
    }
    const { rows } = await db.query<{ jobname: string; command: string }>(`select jobname, command from cron.job order by 1`);
    expect(rows.map((r) => r.command).every((c) => /^select public\.[a-z_]+\(\)$/.test(c))).toBe(true);
  });

  // ── Les effets : arrêt actif = aucun effet ; arrêt levé = comportement inchangé ──

  it("rétention : l'arrêt « purge » ne supprime rien, la levée reprend", async () => {
    await db.query("reset role");
    await db.query(`insert into public.tech_log (evenement, created_at) values ('arret_test_ancien', now() - interval '3 years')`);
    const ancien = () => compter(`select count(*) as n from public.tech_log where evenement = 'arret_test_ancien'`);
    expect(await ancien()).toBe(1);
    await arreter("purge");
    await commeCron();
    const { rows: [{ r }] } = await db.query(`select public.appliquer_retention() as r`);
    expect(r).toMatchObject({ arret_en_cours: true, documents_purges: 0 });
    expect(await ancien()).toBe(1);
    await arreter("purge", false);
    await commeCron();
    const { rows: [{ r: reprise }] } = await db.query(`select public.appliquer_retention() as r`);
    expect(reprise.arret_en_cours).toBeUndefined();
    expect(await ancien()).toBe(0);
  });

  it("rétention : l'arrêt global l'arrête aussi, même appelée par un super administrateur", async () => {
    await db.query("reset role");
    await db.query(`insert into public.tech_log (evenement, created_at) values ('arret_test_ancien', now() - interval '3 years')`);
    const sa = await creerUtilisateur();
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1, null, 'super_admin')`, [sa]);
    await arreter("global");
    await simuler(sa);
    const { rows: [{ r }] } = await db.query(`select public.appliquer_retention() as r`);
    expect(r.arret_en_cours).toBe(true);
    expect(await compter(`select count(*) as n from public.tech_log where evenement = 'arret_test_ancien'`)).toBe(1);
  });

  it("retient l'accès : un compte sans droit reçoit son refus habituel, pas l'état de l'arrêt", async () => {
    await arreter("global");
    const simple = await creerUtilisateur();
    for (const signature of ["public.appliquer_retention()", "public.generer_alertes_diagnostics()", "public.generer_alertes_assurance()", "public.generer_alertes_restitution()"]) {
      await db.query("savepoint refus");
      await simuler(simple);
      await expect(db.query(`select ${signature}`), signature).rejects.toThrow(/reserve|réservé/i);
      await db.query("rollback to savepoint refus");
    }
  });

  it("cycle mensuel : les arrêts « appels » ou « quittances » ne créent ni appel, ni quittance, ni trace ; la levée reprend", async () => {
    const { org, gerant } = await organisation();
    const { bail } = await bailActif(org, gerant, 3);
    const appels = () => compter(`select count(*) as n from public.appels_loyer where bail_id = $1`, [bail]);
    const passages = () => compter(`select count(*) as n from public.tech_log where evenement = 'cycle_mensuel'`);
    const avant = await passages();
    for (const cle of ["global", "appels", "quittances"]) {
      await arreter(cle);
      await commeCron();
      const { rows: [{ r }] } = await db.query(`select public.cycle_mensuel_interne() as r`);
      expect(r, cle).toMatchObject({ arret_en_cours: true, baux: 0, appels_crees: 0 });
      expect(await appels(), cle).toBe(0);
      expect(await passages(), cle).toBe(avant);
      await arreter(cle, false);
    }
    // Une clé étrangère à la tâche ne l'arrête pas.
    await arreter("relances");
    await commeCron();
    await db.query(`select public.cycle_mensuel_interne()`);
    expect(await appels()).toBe(4);
    expect(await passages()).toBe(avant + 1);
  });

  it("constat : après un cycle sauté par l'arrêt, le rattrapage rend, le même matin, l'avis d'échéance ET la relance du même terme", async () => {
    // C'est la raison de la consigne affichée à l'écran « Arrêt avant les prochains effets » : si l'arrêt a couvert un
    // 1er du mois, garder « Relances de loyers » arrêtée jusqu'à l'envoi des avis du rattrapage. Ce test constate le
    // comportement actuel des deux listes que lisent les tâches Vercel (avis à 07:30 UTC, relances à 07:45 UTC) ; il
    // n'approuve pas ce comportement. Si `relances_loyer_dues` est un jour conditionnée à l'avis envoyé (décision
    // technique à prendre hors de ce lot), ce test échouera : retirer alors la consigne de l'écran et de la documentation.
    const { org, gerant } = await organisation();
    const { bail } = await bailActif(org, gerant, 2);
    await db.query("reset role");
    await db.query(`update public.organizations set appels_envoi_auto = true, relances_envoi_auto = true where id = $1`, [org]);
    await db.query(`update public.persons set email = 'locataire-rattrapage@test.local' where id = (select locataire_principal from public.baux where id = $1)`, [bail]);
    // Le 1er du mois d'il y a deux mois est passé pendant l'arrêt : le cycle n'a rien créé.
    await arreter("appels");
    await commeCron();
    await db.query(`select public.cycle_mensuel_interne()`);
    expect(await compter(`select count(*) as n from public.appels_loyer where bail_id = $1`, [bail])).toBe(0);
    // Arrêt levé : le cycle suivant crée les appels de tous les mois manquants (rattrapage).
    await arreter("appels", false);
    await commeCron();
    await db.query(`select public.cycle_mensuel_interne()`);
    expect(await compter(`select count(*) as n from public.appels_loyer where bail_id = $1`, [bail])).toBe(3);
    // Les avis du rattrapage ne sont pas partis.
    expect(await compter(`select count(*) as n from public.appels_loyer where bail_id = $1 and email_envoye_at is not null`, [bail])).toBe(0);
    // Mission « Avis d'échéance » : les avis des mois manquants sont à envoyer (créés à l'instant, dans la fenêtre de 45 jours).
    await simuler(null, "service_role");
    const { rows: avis } = await db.query<{ periode: string }>(`select to_char(periode, 'YYYY-MM-DD') as periode from public.appels_a_envoyer(500) where bail_id = $1 order by periode`, [bail]);
    // Mission « Relances de loyers » : la même matinée, le terme le plus ancien est déjà relancé, avant que son avis soit parti.
    const { rows: relances } = await db.query<{ niveau: string; periode: string; jours_retard: number }>(
      `select niveau, to_char(periode, 'YYYY-MM-DD') as periode, jours_retard from public.relances_loyer_dues(500) where bail_id = $1`, [bail]
    );
    expect(avis.length).toBeGreaterThanOrEqual(2);
    expect(relances).toHaveLength(1);
    expect(relances[0].niveau).toBe("relance_1");
    expect(relances[0].jours_retard).toBeGreaterThan(30);
    expect(avis.map((a) => a.periode)).toContain(relances[0].periode);
    // La consigne fonctionne : tant que « relances » est arrêtée, le contrôle que la route des relances lit avant chaque envoi
    // refuse, alors que celui de la route des avis d'échéance (« appels ») laisse passer.
    await arreter("relances");
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await db.query("set local role service_role");
    const controle = async (cle: string) => (await db.query(`select public.verifier_arret_supervision($1) as ok`, [cle])).rows[0].ok;
    expect(await controle("relances")).toBe(false);
    expect(await controle("appels")).toBe(true);
  });

  it("alertes d'impayés : l'arrêt « relances » ne pose aucune alerte, la levée reprend", async () => {
    const { org, gerant } = await organisation();
    const { bail } = await bailActif(org, gerant, 3);
    await commeCron();
    await db.query(`select public.generer_appels_loyer_interne($1)`, [bail]);
    const alertes = () => compter(`select count(*) as n from public.alerts where organization_id = $1 and type = 'loyer_impaye'`, [org]);
    await arreter("relances");
    await commeCron();
    const { rows: [{ n }] } = await db.query(`select public.generer_alertes_impayes() as n`);
    expect(Number(n)).toBe(0);
    expect(await alertes()).toBe(0);
    await arreter("relances", false);
    await commeCron();
    await db.query(`select public.generer_alertes_impayes()`);
    expect(await alertes()).toBe(1);
  });

  it("alertes de diagnostics, d'assurance et de restitution : l'arrêt « rappels » ne pose rien, la levée reprend", async () => {
    const { org, gerant } = await organisation();
    const { bail, bien } = await bailActif(org, gerant, 3);
    await db.query("reset role");
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration) values ($1, $2, 'dpe', current_date - 3000, current_date + 10)`,
      [org, bien]
    );
    const { rows: [{ id: locataire }] } = await db.query<{ id: string }>(`select locataire_principal as id from public.baux where id = $1`, [bail]);
    const { rows: [{ id: attestation }] } = await db.query<{ id: string }>(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, expire_le)
       values ($1, 'attestation_assurance', 'Assurance', $1::uuid::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000, 'e-' || gen_random_uuid(), current_date + 10)
       returning id`,
      [org]
    );
    await db.query(`insert into public.document_liens (document_id, organization_id, entite, entite_id) values ($1, $2, 'personne', $3)`, [attestation, org, locataire]);
    await db.query(
      `insert into public.restitutions (organization_id, bail_id, date_remise_cles, delai_mois, statut) values ($1, $2, current_date - 25, 1, 'en_cours')`,
      [org, bail]
    );
    const alertes = (type: string) => compter(`select count(*) as n from public.alerts where organization_id = $1 and type = $2`, [org, type]);
    const types = ["diagnostic_expiration", "assurance_expiration", "restitution_echeance"];
    const fonctions = ["generer_alertes_diagnostics", "generer_alertes_assurance", "generer_alertes_restitution"];

    for (const cle of ["rappels", "global"]) {
      await arreter(cle);
      for (const f of fonctions) {
        await commeCron();
        const { rows: [{ n }] } = await db.query(`select public.${f}() as n`);
        expect(Number(n), `${f} (${cle})`).toBe(0);
      }
      for (const t of types) expect(await alertes(t), `${t} (${cle})`).toBe(0);
      await arreter(cle, false);
    }
    // Une clé étrangère aux alertes ne les arrête pas : elles se posent.
    await arreter("marketing");
    for (const f of fonctions) {
      await commeCron();
      const { rows: [{ n }] } = await db.query(`select public.${f}() as n`);
      expect(Number(n), f).toBeGreaterThanOrEqual(1);
    }
    for (const t of types) expect(await alertes(t), t).toBe(1);
  });

  it("propositions de publication : l'arrêt « marketing » ne crée aucune proposition, la levée reprend", async () => {
    await db.query("reset role");
    const propositions = () => compter(`select count(*) as n from public.publications where statut = 'proposition'`);
    const avant = await propositions();
    await arreter("marketing");
    await commeCron();
    // Tous les mois déclencheurs de toutes les veines : à une date où au moins une veine propose.
    const { rows: [{ mois }] } = await db.query<{ mois: number }>(`select min(m)::int as mois from public.publication_veines v, unnest(v.mois_declencheur) m where v.actif`);
    const jour = `2027-${String(mois).padStart(2, "0")}-15`;
    const { rows: [{ n }] } = await db.query(`select public.proposer_publications_interne($1::date) as n`, [jour]);
    expect(Number(n)).toBe(0);
    expect(await propositions()).toBe(avant);
    await arreter("marketing", false);
    await commeCron();
    const { rows: [{ n: reprise }] } = await db.query(`select public.proposer_publications_interne($1::date) as n`, [jour]);
    expect(Number(reprise)).toBeGreaterThan(0);
    expect(await propositions()).toBe(avant + Number(reprise));
  });

  it("bouton « Chercher des sujets » : sous arrêt le point d'entrée humain rend 0, et le superviseur peut lire l'arrêt qui l'explique", async () => {
    // L'action genererPropositions ne doit pas confondre ce 0 avec « la file est à jour » : elle lit l'arrêt avec les clés
    // de la table de correspondance (miroir TS TACHES_SQL) ; ce test vérifie, sur la vraie base, que cette lecture voit l'arrêt.
    await db.query("reset role");
    await db.query("delete from public.publications");
    const sa = await creerUtilisateur();
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1, null, 'super_admin')`, [sa]);
    const cles = ["global", ...TACHES_SQL["propositions-publication-hebdo"].cles];
    const arretsLus = async () => {
      await simuler(sa);
      const { rows } = await db.query<{ cle: string }>(`select cle from public.supervision_arrets where arrete = true and cle = any($1::text[]) order by cle`, [cles]);
      return rows.map((r) => r.cle);
    };
    const proposer = async () => {
      await simuler(sa);
      const { rows: [{ n }] } = await db.query(`select public.proposer_publications('2027-01-15'::date) as n`);
      return Number(n);
    };
    // Aucun arrêt : des propositions, aucun arrêt lu.
    expect(await arretsLus()).toEqual([]);
    expect(await proposer()).toBeGreaterThan(0);
    // « marketing » puis « global » : le moteur rend 0 (rien n'est proposé) et l'arrêt se lit.
    for (const cle of ["marketing", "global"]) {
      await db.query("reset role");
      await db.query("delete from public.publications");
      await arreter(cle);
      expect(await proposer(), cle).toBe(0);
      expect(await arretsLus(), cle).toEqual([cle]);
      await arreter(cle, false);
    }
    // Un arrêt d'une autre clé n'est pas lu : le 0 ne vient pas de lui, et il ne retient pas le moteur.
    await arreter("appels");
    expect(await arretsLus()).toEqual([]);
    expect(await proposer()).toBeGreaterThan(0);
  });

  it("déclencheur marketing : l'arrêt « marketing » n'appelle pas le serveur ; la levée l'appelle", async () => {
    await db.query("reset role");
    // Banc : pg_net n'existe pas sur la base locale. On pose, dans cette transaction annulée, une extension
    // de façade et un net.http_get qui note les appels, pour voir si la fonction tente d'appeler le serveur.
    await db.query(`create schema if not exists net`);
    await db.query(`create temp table appels_http (url text, entetes jsonb)`);
    await db.query(
      `create or replace function net.http_get(url text, headers jsonb default '{}', timeout_milliseconds integer default 1000) returns bigint
       language plpgsql as $f$ begin insert into pg_temp.appels_http values (url, headers); return 1; end $f$`
    );
    await db.query(
      `insert into pg_catalog.pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
       select ((select max(oid)::text::bigint + 1000 from pg_catalog.pg_extension)::text)::oid, 'pg_net', 10, 'net'::regnamespace, false, '0.0'
        where not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')`
    );
    await db.query(`update public.declencheur_marketing set dernier_appel_le = null where singleton`);
    // Un contenu échu à publier : de quoi déclencher l'appel.
    await db.query(
      `insert into public.publications (periode, statut, titre, chapo, corps, facebook_texte, programmee_pour, slug)
       values ('2026-arret', 'programmee', 'Titre de test d''arrêt', 'Chapô de test de l''arrêt d''urgence, assez long.',
               repeat('Corps de test de l''arrêt d''urgence. ', 30), 'Texte de test pour la page Facebook, assez long pour être complet.',
               now() - interval '1 minute', 'arret-test-' || gen_random_uuid())`
    );
    const appels = () => compter(`select count(*) as n from pg_temp.appels_http`);
    const dernierAppel = async () => { const { rows: [{ d }] } = await db.query(`select dernier_appel_le as d from public.declencheur_marketing where singleton`); return d as Date | null; };

    await arreter("marketing");
    await commeCron();
    await db.query(`select public.declencher_marketing()`);
    expect(await appels()).toBe(0);
    expect(await dernierAppel()).toBeNull();

    await arreter("marketing", false);
    await commeCron();
    await db.query(`select public.declencher_marketing()`);
    expect(await appels()).toBe(1);
    expect(await dernierAppel()).not.toBeNull();
  });

  // ── Le rejeu ─────────────────────────────────────────────────────────────

  it("rejouée sur une base déjà migrée, la migration ne change rien (deux fois de suite)", async () => {
    await db.query("reset role");
    const empreinte = async () => {
      const etat: string[] = [];
      for (const [, signature] of FONCTIONS) {
        const { rows: [{ v }] } = await db.query(
          `select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = $1::text::regprocedure`,
          [signature]
        );
        etat.push(`${signature} ${v}`);
      }
      const { rows: [{ v }] } = await db.query(`select md5(pg_get_functiondef('public.tache_planifiee_autorisee(text)'::regprocedure)) || ' ' || coalesce(proacl::text, '') as v from pg_proc where oid = 'public.tache_planifiee_autorisee(text)'::regprocedure`);
      etat.push(`predicat ${v}`);
      const { rows: [{ t }] } = await db.query(`select string_agg(tache || ':' || cle, ',' order by tache, cle) as t from public.supervision_taches_arret`);
      etat.push(`table ${t}`);
      return etat;
    };
    const avant = await empreinte();
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(avant);
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(avant);
  });

  it("la production écrit le contrôle d'accès de trois alertes sur une seule ligne : la garde s'y pose aussi, une seule fois", async () => {
    // Relevé du 14/10 : en production, generer_alertes_{diagnostics,assurance,restitution} portent
    // `... then raise exception '…: reserve au cron et au super admin'; end if;` sur UNE ligne (le dépôt l'écrit sur
    // plusieurs). La simulation de la migration s'y arrêtait (« ancre absente ou répétée »).
    await db.query("reset role");
    const fonctions = ["generer_alertes_diagnostics", "generer_alertes_assurance", "generer_alertes_restitution"];
    for (const fn of fonctions) {
      const { rows: [{ def }] } = await db.query<{ def: string }>(`select pg_get_functiondef('public.${fn}()'::regprocedure) as def`);
      const sansGarde = def.replace(/  -- Audit du 14\/10 \(SUP-01\)[^\n]*\n  if not public\.tache_planifiee_autorisee\([^\n]*\n    [^\n]*\n  end if;\n/, "");
      const multi = `then\n    raise exception '${fn}: reserve au cron et au super admin';\n  end if;\n`;
      expect(sansGarde, `${fn} : forme du dépôt attendue avant la mise en forme de production`).toContain(multi);
      const compacte = sansGarde.replace(multi, `then raise exception '${fn}: reserve au cron et au super admin'; end if;\n`);
      expect(compacte).not.toContain(MARQUE);
      await db.query(compacte);
    }
    await db.query(MIGRATION);
    for (const fn of fonctions) {
      const { rows: [{ def }] } = await db.query<{ def: string }>(`select pg_get_functiondef('public.${fn}()'::regprocedure) as def`);
      expect(def.split(MARQUE).length - 1, `${fn} : la garde est posée une seule fois`).toBe(1);
      // Le contrôle d'accès de production est conservé tel quel, et la garde le suit immédiatement.
      expect(def).toContain(`then raise exception '${fn}: reserve au cron et au super admin'; end if;\n  -- ${MARQUE}`);
    }
    await db.query(MIGRATION); // rejeu : rien à refaire
    for (const fn of fonctions) {
      const { rows: [{ def }] } = await db.query<{ def: string }>(`select pg_get_functiondef('public.${fn}()'::regprocedure) as def`);
      expect(def.split(MARQUE).length - 1).toBe(1);
    }
  });

  it("une définition inattendue l'arrête : la marque ne dispense pas de l'ancre, et l'ancre manquante se dit", async () => {
    await db.query("reset role");
    await db.query(
      `create or replace function public.generer_alertes_impayes() returns integer language plpgsql security definer set search_path to '' as $f$ begin return 0; end $f$`
    );
    await expect(db.query(MIGRATION)).rejects.toThrow(/SUP-01 \(public\.generer_alertes_impayes\(\)\) : définition inattendue/);
  });
});
