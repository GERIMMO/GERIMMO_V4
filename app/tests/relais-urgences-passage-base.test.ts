/**
 * D46-B, relecture du 15/10/2026 — le PASSAGE FRÉQUENT des urgences du relais (migration 20261014812000), en base.
 *
 * Constat des relecteurs : une urgence n'était constatée (`traiter_vacances`) qu'au passage d'une mission, une fois par
 * jour le matin : jusqu'à ~18 h entre l'événement et l'e-mail. Ce que la base garde désormais :
 *  — la TÂCHE pg_cron `relais-urgences`, toutes les 10 minutes, jour et nuit ; onze tâches pg_cron en tout depuis le 24/10 ;
 *  — le JETON, généré en base (64 hexadécimaux, distinct de celui du marketing), que seul le traitement lit ;
 *  — `declencher_relais_urgences` appelle par pg_net la route ?mode=urgences avec ce jeton, SANS lire l'arrêt
 *    d'urgence (arrêt global et toutes les clés posés : l'appel part) ; sans pg_net ou interrupteur coupé, rien, sans
 *    erreur ; jamais deux appels à moins de 4 minutes ;
 *  — la SENTINELLE de 5 h attend la tâche : retirée de pg_cron (« plus programmée »), pas passée à son heure
 *    (« absente »), en échec, ou appelée sans passage reçu par le serveur depuis 30 minutes (« sans passage ») ;
 *  — une clé saisie à la main qui imite celle du système ne change pas la nature de l'urgence (ni dans la file, ni dans
 *    le rappel de 5 h) ; un e-mail immédiat en échec n'est jamais rappelé « en cours » ; un envoi sans urgence est clos
 *    « abandonné », jamais « envoyé » ;
 * La concurrence (deux passages qui se chevauchent), le rejeu de la migration et le retour arrière sont dans
 * relais-urgences-passage-concurrence et relais-urgences-passage-retour (fixture validée, DDL : en série).
 *
 * Banc : ni pg_cron ni pg_net. `cron.job` y est une table d'enregistrement ; pg_net est posé en façade, dans la
 * transaction du cas, par un `net.http_get` qui note les appels. Rien ne part : aucun appel réseau, aucun e-mail.
 * Nécessite SUPABASE_DB_URL (base locale jetable). Chaque cas est joué dans une transaction annulée.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { HORAIRE_PASSAGE_URGENCES } from "../src/lib/relais-urgences";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const UUID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const CLES_ARRET = ["global", "consignes", "veille", "appels", "quittances", "relances", "rappels", "abonnements", "signatures", "marketing", "territoire", "purge", "orchestrateur"];

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
/** pg_cron s'exécute sans jeton, sous le propriétaire des fonctions. */
async function commeCron() {
  await proprietaire();
  await db.query("set local role postgres");
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
     values(gen_random_uuid(),'authenticated','authenticated','passage-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
  );
  return u.id;
}
/** Deux superviseurs permanents, un plan de vacances actif (créé par l'un, confié à l'autre). */
async function planActif() {
  const createur = await compte();
  const responsable = await compte();
  await proprietaire();
  await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active'),($2,null,'super_admin','active')", [createur, responsable]);
  await agir(createur);
  const { rows: [p] } = await db.query<{ id: string }>(
    "select enregistrer_vacances(null,'Vacances TEST',now()-interval '1 hour',now()+interval '1 day','Europe/Paris',$1,null,60) id", [responsable]
  );
  await service();
  await db.query("select traiter_vacances()");
  return { createur, responsable, plan: p.id };
}
async function signaler(createur: string, plan: string, cle: string) {
  await agir(createur);
  const { rows: [r] } = await db.query<{ id: string }>("select signaler_urgence_vacances($1,$2,'Urgence fictive') id", [plan, cle]);
  return r.id;
}
async function natureEnFile(alerte: string): Promise<string | undefined> {
  await proprietaire();
  return (await db.query<{ nature: string }>("select nature from public.relais_urgences where alerte_id=$1", [alerte])).rows[0]?.nature;
}
type Recente = { alerte: string; nature: string; email: string };
async function rappel(): Promise<Recente[]> {
  await service();
  const { rows: [{ r }] } = await db.query<{ r: { urgences: Recente[] } }>("select public.urgences_relais_recentes() as r");
  return r.urgences;
}

/** pg_net en façade, le temps de la transaction du cas : `net.http_get` note chaque appel au lieu de le faire. */
async function pgNetDeFacade() {
  await proprietaire();
  await db.query("create schema if not exists net");
  await db.query("create temp table appels_http (url text, entetes jsonb, delai integer)");
  await db.query(
    `create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint
     language plpgsql as $f$ begin insert into pg_temp.appels_http values (url, headers, timeout_milliseconds); return 1; end $f$`
  );
  await db.query(
    `insert into pg_catalog.pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
     select ((select max(oid)::text::bigint + 1000 from pg_catalog.pg_extension)::text)::oid, 'pg_net', 10, 'net'::regnamespace, false, '0.0'
      where not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')`
  );
}
async function appelsHttp(): Promise<{ url: string; entetes: Record<string, string>; delai: number }[]> {
  await proprietaire();
  return (await db.query("select url, entetes, delai from pg_temp.appels_http")).rows;
}
async function jeton(): Promise<string> {
  await proprietaire();
  return (await db.query<{ j: string }>("select jeton j from public.declencheur_relais_urgences where singleton")).rows[0].j;
}
async function declencher() {
  await commeCron();
  await db.query("select public.declencher_relais_urgences()");
}

// La sentinelle : le journal d'exécution de pg_cron, tel que l'extension le crée, le temps de la transaction du cas.
type Sentinelle = { taches_base_lisibles: boolean; taches_base: { tache: string; etat: string; echecs: number }[] };
async function journalCron() {
  await proprietaire();
  await db.query(`create table cron.job_run_details (
    jobid bigint, runid bigserial primary key, job_pid integer, database text, username text, command text,
    status text, return_message text, start_time timestamptz, end_time timestamptz)`);
}
async function passageCron(tache: string, depuis: string, statut = "succeeded") {
  await proprietaire();
  await db.query(
    `insert into cron.job_run_details(jobid, status, start_time, end_time)
     select jobid, $2, now() - $3::interval, now() - $3::interval + interval '2 seconds' from cron.job where jobname = $1`,
    [tache, statut, depuis]
  );
}
async function toutEstPasse() {
  await proprietaire();
  const { rows } = await db.query<{ jobname: string }>("select jobname from cron.job");
  for (const { jobname } of rows) await passageCron(jobname, "1 minute");
}
async function passageRecu(depuis: string | null) {
  await proprietaire();
  await db.query("update public.declencheur_relais_urgences set dernier_passage_le = now() - $1::interval where singleton", [depuis ?? "1000 years"]);
  if (depuis === null) await db.query("update public.declencheur_relais_urgences set dernier_passage_le = null where singleton");
}
async function etatDuPassage(): Promise<string | undefined> {
  await service();
  const { rows: [{ s }] } = await db.query<{ s: Sentinelle }>("select public.sentinelle_relais() as s");
  expect(s.taches_base_lisibles).toBe(true);
  return s.taches_base.find((t) => t.tache === "relais-urgences")?.etat;
}

describe.skipIf(!DB_URL)("D46-B — passage fréquent des urgences du relais : la base", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await proprietaire();
    await db.query("delete from public.relais_urgences");
    await db.query("delete from public.relais_urgences_envois");
  });
  afterEach(async () => { await db.query("rollback"); });

  // ── La tâche pg_cron et le jeton ─────────────────────────────────────────

  it("la tâche pg_cron est là : toutes les 10 minutes, jour et nuit, elle appelle le déclencheur ; onze tâches en tout", async () => {
    await proprietaire();
    const { rows } = await db.query<{ jobname: string; schedule: string; command: string }>("select jobname, schedule, command from cron.job order by jobname");
    // Onze depuis la fermeture des comptes (20261024130000, lot 1E de conformité du 24/10).
    expect(rows).toHaveLength(11);
    expect(rows.find((j) => j.jobname === "relais-urgences")).toEqual({
      jobname: "relais-urgences", schedule: "*/10 * * * *", command: "select public.declencher_relais_urgences()",
    });
    expect(HORAIRE_PASSAGE_URGENCES).toBe("*/10 * * * *");
    // L'horaire se lit comme toutes les 10 minutes de chaque heure, chaque jour (même calcul que la sentinelle).
    const { rows: [{ v }] } = await db.query<{ v: number[] }>("select public.cron_valeurs_champ('*/10', 0, 59) v");
    expect(v).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("le jeton : 64 hexadécimaux générés en base, distinct de celui du marketing ; aucun rôle ne lit la table, seul le traitement le reçoit", async () => {
    const j = await jeton();
    expect(j).toMatch(/^[0-9a-f]{64}$/);
    const { rows: [{ m }] } = await db.query<{ m: string }>("select jeton m from public.declencheur_marketing where singleton");
    expect(j).not.toBe(m);
    const droits = await db.query<{ role: string; lit: boolean; ecrit: boolean }>(
      `select r.rolname as role, has_table_privilege(r.rolname, 'public.declencheur_relais_urgences', 'SELECT') as lit,
              has_table_privilege(r.rolname, 'public.declencheur_relais_urgences', 'INSERT,UPDATE,DELETE') as ecrit
         from (values ('anon'),('authenticated'),('service_role')) r(rolname) order by 1`
    );
    expect(droits.rows).toEqual([
      { role: "anon", lit: false, ecrit: false },
      { role: "authenticated", lit: false, ecrit: false },
      { role: "service_role", lit: false, ecrit: false },
    ]);
    await service();
    expect((await db.query<{ j: string }>("select public.jeton_declencheur_relais_urgences() j")).rows[0].j).toBe(j);
    // Un superviseur permanent (double vérification) n'y a pas accès, ni personne d'autre.
    const { createur } = await planActif();
    await agir(createur);
    expect(await refusee("select public.jeton_declencheur_relais_urgences()")).toMatch(/permission denied/);
    await db.query("reset role");
    await db.query("set local role anon");
    expect(await refusee("select public.jeton_declencheur_relais_urgences()")).toMatch(/permission denied/);
  });

  it("les fonctions du passage sont fermées aux rôles d'API : le déclencheur à tous, la consignation au seul traitement", async () => {
    await proprietaire();
    const { rows } = await db.query<{ f: string; anon: boolean; connecte: boolean; service: boolean }>(
      `select f, has_function_privilege('anon', f, 'EXECUTE') anon, has_function_privilege('authenticated', f, 'EXECUTE') connecte,
              has_function_privilege('service_role', f, 'EXECUTE') service
         from unnest(array['public.declencher_relais_urgences()', 'public.consigner_passage_urgences_relais()',
                           'public.jeton_declencheur_relais_urgences()', 'public.urgence_constatee_par_le_relais()',
                           'public.clore_envoi_urgences_vide(uuid)']) f order by 1`
    );
    expect(rows).toEqual([
      { f: "public.clore_envoi_urgences_vide(uuid)", anon: false, connecte: true, service: true },
      { f: "public.consigner_passage_urgences_relais()", anon: false, connecte: false, service: true },
      { f: "public.declencher_relais_urgences()", anon: false, connecte: false, service: false },
      { f: "public.jeton_declencheur_relais_urgences()", anon: false, connecte: false, service: true },
      { f: "public.urgence_constatee_par_le_relais()", anon: false, connecte: false, service: false },
    ]);
    await service();
    await db.query("select public.consigner_passage_urgences_relais()");
    await proprietaire();
    const { rows: [{ recu }] } = await db.query("select dernier_passage_le > now() - interval '1 minute' recu from public.declencheur_relais_urgences");
    expect(recu).toBe(true);
  });

  // ── Le déclencheur ───────────────────────────────────────────────────────

  it("appelle la route ?mode=urgences du site avec son jeton, une fois ; pas un second appel à moins de 4 minutes", async () => {
    await pgNetDeFacade();
    await declencher();
    const appels = await appelsHttp();
    expect(appels).toEqual([{
      url: "https://www.gerimmo.app/api/cron/relais?mode=urgences",
      entetes: { authorization: `Bearer ${await jeton()}` },
      delai: 30000,
    }]);
    await declencher();
    expect(await appelsHttp()).toHaveLength(1);
    // Dernier appel il y a 5 minutes : le suivant part.
    await proprietaire();
    await db.query("update public.declencheur_relais_urgences set dernier_appel_le = now() - interval '5 minutes'");
    await declencher();
    expect(await appelsHttp()).toHaveLength(2);
  });

  it("l'arrêt d'urgence actif ne coupe pas ce passage : arrêt global et toutes les clés posés, l'appel part quand même", async () => {
    await pgNetDeFacade();
    const auteur = await compte();
    await proprietaire();
    for (const cle of CLES_ARRET) {
      await db.query(
        `insert into public.supervision_arrets (cle, arrete, motif, auteur) values ($1, true, 'Essai de contrôle', $2)
         on conflict (cle) do update set arrete = true`, [cle, auteur]
      );
    }
    await declencher();
    expect(await appelsHttp()).toHaveLength(1);
    // Le prédicat des tâches arrêtées ne la connaît pas (elle n'est pas dans supervision_taches_arret) : elle est recensée
    // hors arrêt, avec son motif.
    await proprietaire();
    expect(await refusee("select public.tache_planifiee_autorisee('relais-urgences')")).toMatch(/Tâche planifiée inconnue de la table d'arrêt/);
    const { rows } = await db.query("select tache, motif from public.supervision_taches_hors_arret");
    expect(rows).toEqual([{ tache: "relais-urgences", motif: expect.stringContaining("l'arrêt d'urgence fait partie de ce qu'elle signale") }]);
    expect((await db.query("select count(*)::int n from public.supervision_taches_arret where tache = 'relais-urgences'")).rows[0].n).toBe(0);
    const { rows: [{ src }] } = await db.query<{ src: string }>("select prosrc src from pg_proc where oid = 'public.declencher_relais_urgences()'::regprocedure");
    expect(src).not.toMatch(/supervision_arrets|tache_planifiee_autorisee|verifier_arret_supervision/);
  });

  it("sans pg_net, ou interrupteur coupé : rien n'est appelé, rien ne lève", async () => {
    await declencher();
    await proprietaire();
    expect((await db.query("select dernier_appel_le from public.declencheur_relais_urgences")).rows[0].dernier_appel_le).toBeNull();
    await pgNetDeFacade();
    await db.query("update public.declencheur_relais_urgences set actif = false");
    await declencher();
    expect(await appelsHttp()).toEqual([]);
  });

  // ── La sentinelle de 5 h ─────────────────────────────────────────────────

  it("la sentinelle : à l'heure et reçue par le serveur, rien à signaler", async () => {
    await journalCron();
    await toutEstPasse();
    await passageRecu("2 minutes");
    expect(await etatDuPassage()).toBe("ok");
  });

  it("la sentinelle signale la tâche retirée de pg_cron (« plus programmée »), même sans aucun passage", async () => {
    await journalCron();
    await toutEstPasse();
    await proprietaire();
    await db.query("delete from cron.job where jobname = 'relais-urgences'");
    expect(await etatDuPassage()).toBe("non_programmee");
  });

  it("la sentinelle signale la tâche absente (pas passée à son heure) et la tâche en échec", async () => {
    await journalCron();
    await toutEstPasse();
    await passageRecu("2 minutes");
    await proprietaire();
    await db.query("delete from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'relais-urgences')");
    await passageCron("relais-urgences", "35 minutes");
    expect(await etatDuPassage()).toBe("absente");
    await passageCron("relais-urgences", "1 minute");
    await passageCron("relais-urgences", "3 hours", "failed");
    expect(await etatDuPassage()).toBe("echec");
  });

  it("la sentinelle signale un passage appelé à l'heure mais jamais reçu par le serveur depuis 30 minutes (« sans passage »)", async () => {
    await journalCron();
    await toutEstPasse();
    await passageRecu(null);
    expect(await etatDuPassage()).toBe("sans_passage");
    await passageRecu("45 minutes");
    expect(await etatDuPassage()).toBe("sans_passage");
    await passageRecu("20 minutes");
    expect(await etatDuPassage()).toBe("ok");
  });

  // ── La clé imitée ────────────────────────────────────────────────────────

  it("une clé saisie à la main qui imite une clé du système reste un « signalement manuel », dans la file et dans le rappel de 5 h", async () => {
    const { createur, plan } = await planActif();
    const imitations = [];
    for (const cle of ["responsable_non_habilite", `passage:${UUID}`, `tache:${UUID}`]) imitations.push(await signaler(createur, plan, cle));
    for (const id of imitations) expect(await natureEnFile(id)).toBe("signalement_manuel");
    const r = await rappel();
    for (const id of imitations) expect(r.find((u) => u.alerte === id)?.nature).toBe("signalement_manuel");
  });

  it("une urgence posée par traiter_vacances garde la nature de sa clé (le responsable perd son habilitation)", async () => {
    const { responsable, plan } = await planActif();
    await proprietaire();
    await db.query("update memberships set status='inactive' where account_id=$1 and organization_id is null", [responsable]);
    await service();
    await db.query("select traiter_vacances()");
    await proprietaire();
    const { rows: [a] } = await db.query<{ id: string }>("select id from supervision_alertes_internes where plan_id=$1 and cle='responsable_non_habilite'", [plan]);
    expect(await natureEnFile(a.id)).toBe("responsable_non_habilite");
    expect((await rappel()).find((u) => u.alerte === a.id)?.nature).toBe("responsable_non_habilite");
  });

  it("hors file, le rappel de 5 h n'affirme pas la nature d'une clé qui imite le système ; une clé libre reste « signalement manuel »", async () => {
    const { createur, plan } = await planActif();
    const imitee = await signaler(createur, plan, "responsable_non_habilite");
    const libre = await signaler(createur, plan, "incident-hors-file");
    // « Hors file » : posée avant la mise en place de la file, ou file en panne.
    await proprietaire();
    await db.query("delete from public.relais_urgences where alerte_id = any($1::uuid[])", [[imitee, libre]]);
    const r = await rappel();
    expect(r.find((u) => u.alerte === imitee)).toMatchObject({ nature: "inconnue", email: "hors_file" });
    expect(r.find((u) => u.alerte === libre)).toMatchObject({ nature: "signalement_manuel", email: "hors_file" });
  });

  // ── Le rappel de 5 h et l'envoi vide ─────────────────────────────────────

  it("le rappel de 5 h ne dit jamais « en cours » d'un e-mail immédiat en échec (à reprendre, ou passe coupée depuis plus de 10 minutes)", async () => {
    const { createur, plan } = await planActif();
    const id = await signaler(createur, plan, "incident-echec");
    await service();
    const { rows: [{ p }] } = await db.query<{ p: { envoi: string } }>("select public.prendre_urgences_relais(6) p");
    expect((await rappel()).find((u) => u.alerte === id)?.email).toBe("en_cours");
    // Une adresse sur deux : l'envoi est à reprendre.
    await service();
    await db.query("select public.terminer_urgences_relais($1, 2, 1)", [p.envoi]);
    expect((await rappel()).find((u) => u.alerte === id)?.email).toBe("echec_reprise");
    // Reprise commencée il y a plus de 10 minutes et jamais terminée (fonction coupée) : en échec, pas « en cours ».
    await proprietaire();
    await db.query("update public.relais_urgences_envois set statut = 'en_cours', essaye_le = now() - interval '11 minutes' where id = $1", [p.envoi]);
    expect((await rappel()).find((u) => u.alerte === id)?.email).toBe("echec_reprise");
  });

  it("un envoi resté sans urgence est clos « abandonné », zéro destinataire, jamais « envoyé » ; un envoi qui porte des urgences ne l'est pas", async () => {
    const { createur, plan } = await planActif();
    const id = await signaler(createur, plan, "incident-vide");
    await service();
    const { rows: [{ p }] } = await db.query<{ p: { envoi: string } }>("select public.prendre_urgences_relais(6) p");
    expect((await db.query("select public.clore_envoi_urgences_vide($1) r", [p.envoi])).rows[0].r).toEqual({ termine: false, motif: "urgences" });
    // Ses urgences disparaissent (l'alerte est supprimée : la file suit en cascade).
    await proprietaire();
    await db.query("delete from supervision_alertes_internes where id = $1", [id]);
    await service();
    expect((await db.query("select public.clore_envoi_urgences_vide($1) r", [p.envoi])).rows[0].r).toEqual({ termine: true, statut: "abandonne" });
    await proprietaire();
    expect((await db.query("select statut, urgences, destinataires, envoyes from public.relais_urgences_envois where id = $1", [p.envoi])).rows[0])
      .toEqual({ statut: "abandonne", urgences: 0, destinataires: 0, envoyes: 0 });
    // Déjà clos : rien ne se réécrit.
    await service();
    expect((await db.query("select public.clore_envoi_urgences_vide($1) r", [p.envoi])).rows[0].r).toEqual({ termine: false });
    // Un compte quelconque n'y touche pas.
    const quelconque = await compte();
    await agir(quelconque);
    expect(await refusee("select public.clore_envoi_urgences_vide($1)", [p.envoi])).toMatch(/Accès refusé/);
  });
});
