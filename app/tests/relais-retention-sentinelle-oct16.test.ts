import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const fichier = "20261016180000_relais_retention_sentinelle";
const lire = (retour = false) => readFileSync(`supabase/${retour ? "retours-arriere" : "migrations"}/${fichier}${retour ? ".retour" : ""}.sql`, "utf8");
const signatures = ["public.sentinelle_relais()", "public.reserver_alerte_relais()", "public.prendre_urgences_relais(integer)", "public.appliquer_retention()", "public.purger_journal_cron()"];

describe.skipIf(!url)("T12 — sentinelle et conservation du relais", () => {
  let db: Client;
  const service = () => db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',true)`);
  const empreinte = async () => (await db.query("select md5(string_agg(pg_get_functiondef(s::regprocedure)||coalesce((select proacl::text from pg_proc where oid=s::regprocedure),''),'|' order by s)) e from unnest($1::text[]) s", [signatures])).rows[0].e;
  const journal = () => db.query(`create table cron.job_run_details(jobid bigint, runid bigserial primary key, status text, start_time timestamptz, end_time timestamptz)`);
  const compte = async () => Number((await db.query("select count(*) n from cron.job_run_details")).rows[0].n);
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("une tâche désactivée n'est plus annoncée absente ; une tâche attendue supprimée reste signalée", async () => {
    await journal();
    await db.query("update cron.job set active=false where jobname='relais-urgences'");
    await db.query("delete from cron.job where jobname='alertes-assurance-quotidiennes'");
    await service();
    const s = (await db.query("select public.sentinelle_relais() s")).rows[0].s;
    expect(s.taches_base_lisibles).toBe(true);
    expect(s.taches_base.some((t: { tache: string }) => t.tache === "relais-urgences")).toBe(false);
    expect(s.taches_base).toContainEqual(expect.objectContaining({ tache: "alertes-assurance-quotidiennes", etat: "non_programmee" }));
  });

  it.each(["desactivee", "douze_mois", "absente"])("réservation quotidienne : règle %s, le registre de sept mois reste", async (regle) => {
    await db.query("insert into public.relais_alertes_envois(jour,statut) values ((public.aujourdhui_paris()-interval '7 months')::date,'envoye')");
    if (regle === "absente") await db.query("delete from public.retention_rules where data_type='journal:relais_alertes_envois'");
    else await db.query("update public.retention_rules set actif=$1,duree_mois=$2 where data_type='journal:relais_alertes_envois'", [regle !== "desactivee", regle === "douze_mois" ? 12 : 6]);
    await service(); await db.query("select public.reserver_alerte_relais()");
    expect(Number((await db.query("select count(*) n from public.relais_alertes_envois where jour < public.aujourdhui_paris()-100")).rows[0].n)).toBe(1);
  });

  it.each(["desactivee", "douze_mois", "absente", "six_mois"])("prise d'urgence : les trois registres suivent la règle %s", async (regle) => {
    const utilisateur = (await db.query("insert into auth.users(id,email) values(gen_random_uuid(),'t12-'||gen_random_uuid()||'@example.invalid') returning id")).rows[0].id;
    const plan = (await db.query("insert into public.supervision_vacances(titre,debut,fin,responsable,delai_minutes,cree_par) values('T12',now()-interval '1 day',now()+interval '1 day',$1,60,$1) returning id", [utilisateur])).rows[0].id;
    const alerte = (await db.query("insert into public.supervision_alertes_internes(plan_id,cle,titre,destinataire,echeance) values($1,'test-t12','T12',$2,now()) returning id", [plan, utilisateur])).rows[0].id;
    const envoi = (await db.query("insert into public.relais_urgences_envois(statut,commence_le) values('envoye',now()-interval '7 months') returning id")).rows[0].id;
    await db.query("insert into public.relais_urgences(alerte_id,nature,posee_le) values($1,'signalement_manuel',now()) on conflict do nothing", [alerte]);
    await db.query("update public.relais_urgences set statut='envoyee',traitee_le=now()-interval '7 months',envoi_id=$2 where alerte_id=$1", [alerte, envoi]);
    if (regle === "absente") await db.query("delete from public.retention_rules where data_type in ('journal:relais_urgences','journal:relais_urgences_envois')");
    else await db.query("update public.retention_rules set actif=$1,duree_mois=$2 where data_type in ('journal:relais_urgences','journal:relais_urgences_envois')", [regle !== "desactivee", regle === "douze_mois" ? 12 : 6]);
    await service(); await db.query("select public.prendre_urgences_relais()");
    for (const [table, champ, id] of [["relais_urgences", "alerte_id", alerte], ["relais_urgences_envois", "id", envoi]]) {
      expect(Number((await db.query(`select count(*) n from public.${table} where ${champ}=$1`, [id])).rows[0].n)).toBe(regle === "six_mois" ? 0 : 1);
    }
  });

  it("appliquer_retention purge les succès et échecs cron anciens, garde les tâches en cours et les journaux récents", async () => {
    await journal();
    await db.query(`insert into cron.job_run_details(status,start_time,end_time) values
      ('succeeded',now()-interval '7 months',now()-interval '7 months'),
      ('failed',now()-interval '7 months',now()-interval '7 months'),
      ('running',now()-interval '7 months',null),
      ('succeeded',now()-interval '7 months',null),
      ('succeeded',now()-interval '1 day',now()-interval '1 day')`);
    const bilan = (await db.query("select public.appliquer_retention() r")).rows[0].r;
    expect(bilan.journaux.cron_job_run_details).toBe(2);
    expect(await compte()).toBe(3);
    const trace = (await db.query("select details from public.tech_log where evenement='purge_journal_cron'")).rows;
    expect(trace).toEqual([{ details: { cron_job_run_details: 2 } }]);
  });

  it.each(["desactivee", "douze_mois", "absente"])("journal cron : règle %s ne purge pas les lignes de sept mois", async (regle) => {
    await journal();
    await db.query("insert into cron.job_run_details(status,end_time) values('succeeded',now()-interval '7 months')");
    if (regle === "absente") await db.query("delete from public.retention_rules where data_type='journal:cron_job_run_details'");
    else await db.query("update public.retention_rules set actif=$1,duree_mois=$2 where data_type='journal:cron_job_run_details'", [regle !== "desactivee", regle === "douze_mois" ? 12 : 6]);
    await db.query("select public.appliquer_retention()");
    expect(await compte()).toBe(1);
  });

  it("journal absent : le nettoyage reste utilisable ; helper fermé aux comptes ordinaires", async () => {
    await db.query("select public.appliquer_retention()");
    for (const role of ["anon", "authenticated"]) expect((await db.query("select has_function_privilege($1,'public.purger_journal_cron()','execute') p", [role])).rows[0].p).toBe(false);
    expect((await db.query("select has_function_privilege('service_role','public.purger_journal_cron()','execute') p")).rows[0].p).toBe(true);
  });

  it("rejeu conserve les réglages ; retour répété et réapplication conservent fonctions et droits", async () => {
    await db.query("update public.retention_rules set duree_mois=12,actif=false where data_type='journal:cron_job_run_details'");
    const avant = await empreinte();
    await db.query(lire()); await db.query(lire());
    expect(await empreinte()).toBe(avant);
    expect((await db.query("select duree_mois,actif from public.retention_rules where data_type='journal:cron_job_run_details'")).rows[0]).toEqual({ duree_mois: 12, actif: false });
    await db.query(lire(true)); await db.query(lire(true));
    expect((await db.query("select to_regprocedure('public.purger_journal_cron()') p")).rows[0].p).toBeNull();
    await db.query(lire());
    expect(await empreinte()).toBe(avant);
  });
});
