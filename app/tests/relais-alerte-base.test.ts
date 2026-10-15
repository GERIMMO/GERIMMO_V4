/**
 * D46-B, partie « alerte e-mail du relais » (décision du dirigeant du 15/10/2026) — la base.
 *
 * Ce que la base garde :
 *  — le jour de Paris où le relais est passé : UNE réservation par jour (`reserver_alerte_relais`), rejouable sans
 *    double envoi même si la tâche est appelée deux fois ; une reprise n'est permise qu'après un échec ou une passe
 *    restée « en cours » plus de 10 minutes, trois tentatives au plus ;
 *  — le résultat de la passe (`terminer_alerte_relais`) : des nombres, jamais un texte, jamais une adresse ;
 *  — la « tâche sentinelle » (`sentinelle_relais`) : alertes du mode vacances non accusées (comptées), arrêts d'urgence
 *    actifs (clé et date, jamais le motif), tâches pg_cron en échec, absentes à leur heure ou plus programmées.
 *
 * Le banc n'a pas de planificateur : `cron.job` y est une table d'enregistrement et `cron.job_run_details` n'existe pas.
 * Les cas qui en ont besoin la créent DANS leur transaction (annulée à la fin) avec les colonnes de pg_cron.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Chaque cas est joué dans une transaction annulée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const CHEMIN_MIGRATION = "supabase/migrations/20261014810000_relais_alerte_quotidienne.sql";

let db: Client;

async function service() {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await db.query("set local role service_role");
}
async function proprietaire() {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}
async function agir(id: string, aal = "aal2") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text, true)", [id, aal]);
  await db.query("set local role authenticated");
}
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
async function compte(): Promise<string> {
  await proprietaire();
  const { rows: [u] } = await db.query<{ id: string }>(
    `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
     values(gen_random_uuid(),'authenticated','authenticated','relais-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
  );
  return u.id;
}
async function reserver() {
  await service();
  const { rows: [{ r }] } = await db.query<{ r: { reserve: boolean; jour: string; tentative?: number; statut?: string } }>("select public.reserver_alerte_relais() as r");
  return r;
}
async function terminer(jour: string, statut: string, compteurs: Record<string, unknown> = {}) {
  await service();
  await db.query("select public.terminer_alerte_relais($1::date,$2,2,2,1,$3::jsonb)", [jour, statut, JSON.stringify(compteurs)]);
}
type Sentinelle = {
  alertes: { ouvertes: number; escaladees: number; non_acheminees: number };
  arrets: { cle: string; depuis: string }[];
  taches_base_lisibles: boolean;
  taches_base: { tache: string; etat: string; echecs: number }[];
};
async function sentinelle(): Promise<Sentinelle> {
  await service();
  const { rows: [{ s }] } = await db.query<{ s: Sentinelle }>("select public.sentinelle_relais() as s");
  return s;
}
/** Le journal d'exécution de pg_cron, tel que l'extension le crée, le temps de la transaction du cas. */
async function journalCron() {
  await proprietaire();
  await db.query(`create table cron.job_run_details (
    jobid bigint, runid bigserial primary key, job_pid integer, database text, username text, command text,
    status text, return_message text, start_time timestamptz, end_time timestamptz)`);
}
async function passage(tache: string, depuis: string, statut = "succeeded") {
  await proprietaire();
  await db.query(
    `insert into cron.job_run_details(jobid, status, start_time, end_time)
     select jobid, $2, now() - $3::interval, now() - $3::interval + interval '2 seconds' from cron.job where jobname = $1`,
    [tache, statut, depuis]
  );
}
/** Toutes les tâches programmées sont passées il y a une minute, avec succès. */
async function toutEstPasse() {
  await proprietaire();
  const { rows } = await db.query<{ jobname: string }>("select jobname from cron.job");
  for (const { jobname } of rows) await passage(jobname, "1 minute");
}
const etatDe = (s: Sentinelle, tache: string) => s.taches_base.find((t) => t.tache === tache);

describe.skipIf(!DB_URL)("D46-B — alerte e-mail du relais : la base", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });

  // ── La réservation du jour : idempotence ───────────────────────────────

  it("réserve le jour de Paris une seule fois : un second appel le même jour ne réserve rien", async () => {
    await proprietaire();
    const { rows: [{ j }] } = await db.query<{ j: string }>("select public.aujourdhui_paris()::text as j");
    const premier = await reserver();
    expect(premier).toMatchObject({ reserve: true, jour: j, tentative: 1 });
    const second = await reserver();
    expect(second).toMatchObject({ reserve: false, jour: j, statut: "en_cours" });
    await terminer(j, "rien_a_signaler");
    expect(await reserver()).toMatchObject({ reserve: false, statut: "rien_a_signaler" });
    await terminer(j, "envoye");
    // La passe close ne se réécrit pas : « envoye » ne remplace pas « rien_a_signaler ».
    await proprietaire();
    const { rows: [l] } = await db.query("select statut, tentatives from public.relais_alertes_envois where jour = $1::date", [j]);
    expect(l).toEqual({ statut: "rien_a_signaler", tentatives: 1 });
  });

  it("un envoi déjà fait ne se refait pas ; un échec se reprend, trois tentatives au plus", async () => {
    const { jour } = await reserver();
    await terminer(jour, "envoye");
    expect((await reserver()).reserve).toBe(false);

    await proprietaire();
    await db.query("delete from public.relais_alertes_envois");
    await reserver();
    await terminer(jour, "echec");
    expect(await reserver()).toMatchObject({ reserve: true, tentative: 2 });
    await terminer(jour, "envoi_partiel");
    expect(await reserver()).toMatchObject({ reserve: true, tentative: 3 });
    await terminer(jour, "echec");
    expect(await reserver()).toMatchObject({ reserve: false, statut: "echec" });
  });

  it("une passe restée « en cours » plus de 10 minutes se reprend ; avant, non", async () => {
    await reserver();
    await proprietaire();
    await db.query("update public.relais_alertes_envois set commence_le = now() - interval '9 minutes'");
    expect((await reserver()).reserve).toBe(false);
    await proprietaire();
    await db.query("update public.relais_alertes_envois set commence_le = now() - interval '11 minutes'");
    expect(await reserver()).toMatchObject({ reserve: true, tentative: 2 });
  });

  it("le résultat ne garde que des nombres : un texte, un statut inconnu ou « en cours » sont refusés", async () => {
    const { jour } = await reserver();
    await service();
    expect(await refusee("select public.terminer_alerte_relais($1::date,'envoye',1,1,1,$2::jsonb)", [jour, JSON.stringify({ adresse: "relais@example.com" })]))
      .toMatch(/nombres/);
    expect(await refusee("select public.terminer_alerte_relais($1::date,'en_cours',1,1,1,'{}'::jsonb)", [jour])).toMatch(/Résultat/);
    expect(await refusee("select public.terminer_alerte_relais($1::date,'parti',1,1,1,'{}'::jsonb)", [jour])).toMatch(/Résultat/);
    await terminer(jour, "envoye", { taches_en_echec: 1, alertes_ouvertes: 2 });
    await proprietaire();
    const { rows: [l] } = await db.query("select statut, destinataires, envoyes, points, compteurs, termine_le is not null as termine from public.relais_alertes_envois");
    expect(l).toEqual({ statut: "envoye", destinataires: 2, envoyes: 2, points: 1, compteurs: { taches_en_echec: 1, alertes_ouvertes: 2 }, termine: true });
  });

  it("garde six mois de passages : les plus anciens partent à la réservation suivante", async () => {
    await proprietaire();
    await db.query(`insert into public.relais_alertes_envois(jour, statut) values
      (public.aujourdhui_paris() - 200, 'envoye'), (public.aujourdhui_paris() - 30, 'rien_a_signaler')`);
    await reserver();
    await proprietaire();
    const { rows } = await db.query<{ age: number }>("select public.aujourdhui_paris() - jour as age from public.relais_alertes_envois order by 1");
    expect(rows.map((r) => r.age)).toEqual([0, 30]);
  });

  // ── Les droits ──────────────────────────────────────────────────────────

  it("seul le traitement réserve, termine et lit la sentinelle ; seul le superviseur permanent lit l'historique", async () => {
    const superviseur = await compte();
    const agent = await compte();
    await proprietaire();
    await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')", [superviseur]);
    await db.query("insert into public.relais_alertes_envois(jour, statut) values (public.aujourdhui_paris() - 1, 'envoye')");
    for (const role of ["anon", "authenticated"]) {
      await proprietaire();
      const { rows } = await db.query(
        `select p.proname, has_function_privilege($1, p.oid, 'EXECUTE') as peut from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('reserver_alerte_relais','terminer_alerte_relais','sentinelle_relais','cron_valeurs_champ','cron_derniere_echeance')`,
        [role]
      );
      expect(rows.length, role).toBe(5);
      expect(rows.filter((r) => r.peut), role).toEqual([]);
      const { rows: [t] } = await db.query(`select has_table_privilege($1, 'public.relais_alertes_envois', 'INSERT,UPDATE,DELETE') as ecrit`, [role]);
      expect(t.ecrit, role).toBe(false);
    }
    await proprietaire();
    const { rows: [s] } = await db.query(`select has_table_privilege('service_role', 'public.relais_alertes_envois', 'INSERT,UPDATE,DELETE') as ecrit`);
    expect(s.ecrit).toBe(false);
    await agir(agent);
    expect((await db.query("select * from public.relais_alertes_envois")).rows).toHaveLength(0);
    expect(await refusee("select public.reserver_alerte_relais()")).toMatch(/permission denied|refusé|réservé/i);
    await agir(superviseur);
    expect((await db.query("select statut from public.relais_alertes_envois")).rows).toEqual([{ statut: "envoye" }]);
    // Sans jeton (pg_cron, propriétaire) : la garde refuse aussi.
    await proprietaire();
    expect(await refusee("select public.reserver_alerte_relais()")).toMatch(/réservé au traitement/);
  });

  // ── La sentinelle ──────────────────────────────────────────────────────

  it("compte les alertes du mode vacances non accusées, sans leur texte", async () => {
    const createur = await compte();
    const responsable = await compte();
    await proprietaire();
    await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active'),($2,null,'super_admin','active')", [createur, responsable]);
    await agir(createur);
    const { rows: [p] } = await db.query(
      "select enregistrer_vacances(null,'Vacances TEST',now()-interval '1 hour',now()+interval '1 day','Europe/Paris',$1,null,60) id", [responsable]
    );
    await db.query("select traiter_vacances()");
    const avant = (await sentinelle()).alertes;
    await agir(createur);
    await db.query("select signaler_urgence_vacances($1,'incident-test','Urgence fictive : Mme Exemple, 12 rue Exemple') id", [p.id]);
    const s = await sentinelle();
    expect(s.alertes.ouvertes).toBe(avant.ouvertes + 1);
    expect(JSON.stringify(s)).not.toMatch(/Exemple|incident-test/);
    await agir(responsable);
    await db.query("select accuser_alerte_vacances(id) from supervision_alertes_internes where plan_id = $1", [p.id]);
    expect((await sentinelle()).alertes.ouvertes).toBe(avant.ouvertes);
  });

  it("dit l'arrêt d'urgence actif (clé et date), jamais son motif", async () => {
    const superviseur = await compte();
    await proprietaire();
    await db.query("delete from public.supervision_arrets");
    expect((await sentinelle()).arrets).toEqual([]);
    await proprietaire();
    await db.query("insert into public.supervision_arrets(cle,arrete,motif,auteur) values('global',true,'Motif confidentiel du dirigeant',$1),('purge',false,'Reprise',$1)", [superviseur]);
    const s = await sentinelle();
    expect(s.arrets.map((a) => a.cle)).toEqual(["global"]);
    expect(s.arrets[0].depuis).toBeTruthy();
    expect(JSON.stringify(s)).not.toContain("confidentiel");
  });

  it("sans journal d'exécution de pg_cron, dit que les tâches de la base sont illisibles plutôt que de les croire à l'heure", async () => {
    const s = await sentinelle();
    expect(s.taches_base_lisibles).toBe(false);
    expect(s.taches_base).toEqual([]);
  });

  it("toutes les tâches passées à l'heure : rien d'anormal", async () => {
    await journalCron();
    await toutEstPasse();
    const s = await sentinelle();
    expect(s.taches_base_lisibles).toBe(true);
    expect(s.taches_base.length).toBe(9);
    expect(s.taches_base.filter((t) => t.etat !== "ok")).toEqual([]);
  });

  it("détecte une tâche en échec, une tâche absente à son heure et une tâche qui n'est plus programmée", async () => {
    await journalCron();
    await toutEstPasse();
    // Rétention (03:00 UTC chaque jour) : dernier passage il y a deux jours.
    await proprietaire();
    await db.query("delete from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'retention-quotidienne')");
    await passage("retention-quotidienne", "2 days");
    // Alertes d'impayés : un échec dans les dernières 24 h, même suivi d'un succès.
    await passage("alertes-impayes-quotidiennes", "3 hours", "failed");
    // Maintenance des artisans : retirée de pg_cron (restauration dans un projet neuf, AUD-C-02).
    await proprietaire();
    await db.query("delete from cron.job where jobname = 'maintenance-artisans'");
    // Une tâche planifiée hors des migrations est suivie elle aussi.
    await db.query("insert into cron.job(jobname, schedule, command) values ('tache-hors-migrations', '0 * * * *', 'select 1')");
    const s = await sentinelle();
    expect(etatDe(s, "retention-quotidienne")).toEqual({ tache: "retention-quotidienne", etat: "absente", echecs: 0 });
    expect(etatDe(s, "alertes-impayes-quotidiennes")).toEqual({ tache: "alertes-impayes-quotidiennes", etat: "echec", echecs: 1 });
    expect(etatDe(s, "maintenance-artisans")).toEqual({ tache: "maintenance-artisans", etat: "non_programmee", echecs: 0 });
    expect(etatDe(s, "tache-hors-migrations")?.etat).toBe("absente");
    expect(etatDe(s, "cycle-mensuel")?.etat).toBe("ok");
  });

  it("un échec de plus de 24 h n'est plus compté ; une tâche hebdomadaire ou mensuelle n'est pas jugée absente hors de son jour", async () => {
    await journalCron();
    await proprietaire();
    await passage("alertes-impayes-quotidiennes", "30 hours", "failed");
    await passage("alertes-impayes-quotidiennes", "1 minute");
    const s = await sentinelle();
    expect(etatDe(s, "alertes-impayes-quotidiennes")?.etat).toBe("ok");
    // Aucun passage du tout : le cycle mensuel (le 1er) ne peut être absent qu'au lendemain du 1er.
    const { rows: [{ lendemain }] } = await db.query<{ lendemain: boolean }>(
      "select extract(day from (now() at time zone 'GMT') - interval '10 minutes') between 1 and 2 as lendemain"
    );
    if (!lendemain) expect(etatDe(s, "cycle-mensuel")?.etat).toBe("ok");
  });

  // ── Le calcul de l'échéance ────────────────────────────────────────────

  it("retrouve la dernière heure prévue d'un horaire pg_cron, en UTC", async () => {
    await proprietaire();
    const echeance = async (horaire: string, avant: string) => {
      const { rows: [{ e }] } = await db.query<{ e: string | null }>(
        "select to_char(public.cron_derniere_echeance($1, $2::timestamptz, interval '24 hours', 'GMT') at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as e",
        [horaire, avant]
      );
      return e;
    };
    expect(await echeance("0 3 * * *", "2026-10-15T05:00:00Z")).toBe("2026-10-15 03:00");
    expect(await echeance("0 3 * * *", "2026-10-15T02:59:00Z")).toBe("2026-10-14 03:00");
    expect(await echeance("*/5 5-19 * * *", "2026-10-15T03:00:00Z")).toBe("2026-10-14 19:55");
    expect(await echeance("30 4 * * *", "2026-10-15T04:30:00Z")).toBe("2026-10-15 04:30");
    // Hebdomadaire (lundi 06:00) : le 13/10/2026 est un mardi ; le dimanche s'écrit 0 ou 7.
    expect(await echeance("0 6 * * 1", "2026-10-13T03:00:00Z")).toBe("2026-10-12 06:00");
    expect(await echeance("0 6 * * 1", "2026-10-15T03:00:00Z")).toBeNull();
    expect(await echeance("0 6 * * 7", "2026-10-12T03:00:00Z")).toBe("2026-10-11 06:00");
    // Mensuelle (le 1er à 05:00) : dans la fenêtre seulement le lendemain.
    expect(await echeance("0 5 1 * *", "2026-11-02T03:00:00Z")).toBe("2026-11-01 05:00");
    expect(await echeance("0 5 1 * *", "2026-11-15T03:00:00Z")).toBeNull();
    // Jour du mois ET jour de semaine restreints : l'un OU l'autre (règle de cron).
    expect(await echeance("0 5 1 * 3", "2026-10-15T03:00:00Z")).toBe("2026-10-14 05:00");
    // Écritures que ce calcul ne lit pas : pas d'échéance, donc jamais « absente » à tort.
    for (const h of ["30 seconds", "0 3 * * MON", "0 3 $ * *", "0 3 * *", "99 3 * * *"]) expect(await echeance(h, "2026-10-15T05:00:00Z"), h).toBeNull();
  });

  it("lit l'heure de pg_cron dans son fuseau (cron.timezone), UTC par défaut", async () => {
    await proprietaire();
    const { rows: [{ e }] } = await db.query<{ e: string }>(
      "select to_char(public.cron_derniere_echeance('0 3 * * *', '2026-10-15T05:00:00Z'::timestamptz, interval '24 hours', 'Europe/Paris') at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as e"
    );
    expect(e).toBe("2026-10-15 01:00");
  });

  // ── Le rejeu ────────────────────────────────────────────────────────────

  it("se rejoue sans effet ni erreur, l'historique conservé", async () => {
    const { jour } = await reserver();
    await terminer(jour, "envoye");
    await proprietaire();
    const migration = readFileSync(CHEMIN_MIGRATION, "utf8");
    await db.query(migration);
    await db.query(migration);
    const { rows } = await db.query("select statut from public.relais_alertes_envois");
    expect(rows).toEqual([{ statut: "envoye" }]);
    expect(await reserver()).toMatchObject({ reserve: false, statut: "envoye" });
  });
});
