/**
 * D46-B, suite (décision du dirigeant du 15/10/2026, « envoi immédiat pour les urgences ») — la base.
 *
 * Ce que la base garde :
 *  — la FILE : chaque alerte interne NOUVELLE du mode vacances (`signaler_urgence_vacances`, seule à en écrire : appelée
 *    par `traiter_vacances` ou par la console) y entre « à envoyer », par déclencheur, avec sa nature et son heure, jamais
 *    son titre. Même dédoublonnage que l'alerte : la même clé dans le même plan n'ajoute rien. Une escalade, un accusé,
 *    une tâche en échec, un arrêt d'urgence n'y entrent pas (ils restent dans l'e-mail de 5 h) ;
 *  — l'ENVOI : `prendre_urgences_relais` prend les urgences en attente une seule fois (un second appel ne reprend rien),
 *    reprend un envoi inachevé avec le même identifiant (donc les mêmes clés d'envoi), trois tentatives au plus ;
 *  — le PLAFOND : 6 envois créés par heure glissante ; au-delà, rien n'est pris, le surplus attend et part groupé ;
 *  — le RAPPEL de 5 h : les urgences des dernières 24 h, envoyées ou non, sans titre ;
 *  — l'arrêt d'urgence ne coupe rien de tout cela ; une erreur de la file n'empêche jamais l'alerte d'être posée.
 * La concurrence (deux sessions) est dans relais-urgences-concurrence.test.ts (fixture validée, en série) ; la file en
 * panne et le retour arrière (DDL sur la file et sur `supervision_alertes_internes`) dans relais-urgences-retour.test.ts.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Chaque cas est joué dans une transaction annulée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";
import { envoyerUrgencesRelais } from "../src/lib/relais-urgences-envoi";
import { lireAdressesRelais } from "../src/lib/relais-alerte";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const CHEMIN_MIGRATION = "supabase/migrations/20261014811000_relais_urgences_immediates.sql";
const UUID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

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
     values(gen_random_uuid(),'authenticated','authenticated','urgence-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
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
  await db.query("select traiter_vacances()");
  return { createur, responsable, plan: p.id };
}
async function signaler(createur: string, plan: string, cle: string, titre = "Urgence fictive") {
  await agir(createur);
  const { rows: [r] } = await db.query<{ id: string }>("select signaler_urgence_vacances($1,$2,$3) id", [plan, cle, titre]);
  return r.id;
}
type File = { alerte_id: string; nature: string; statut: string; envoi_id: string | null };
async function file(): Promise<File[]> {
  await proprietaire();
  return (await db.query<File>("select alerte_id, nature, statut, envoi_id from public.relais_urgences order by posee_le, alerte_id")).rows;
}
type Prise = { pris: boolean; motif?: string; envoi?: string; tentative?: number; reprise?: boolean; urgences?: { nature: string; posee_le: string }[]; en_attente: number };
async function prendre(plafond = 6): Promise<Prise> {
  await service();
  const { rows: [{ r }] } = await db.query<{ r: Prise }>("select public.prendre_urgences_relais($1) as r", [plafond]);
  return r;
}
async function terminer(envoi: string, destinataires: number, envoyes: number) {
  await service();
  const { rows: [{ r }] } = await db.query<{ r: { termine: boolean; statut?: string } }>("select public.terminer_urgences_relais($1,$2,$3) as r", [envoi, destinataires, envoyes]);
  return r;
}
type Recente = { alerte: string; nature: string; posee_le: string; email: string };
async function recentes(): Promise<{ urgences: Recente[]; total: number }> {
  await service();
  const { rows: [{ r }] } = await db.query<{ r: { urgences: Recente[]; total: number } }>("select public.urgences_relais_recentes() as r");
  return r;
}

describe.skipIf(!DB_URL)("D46-B — e-mail immédiat des urgences du relais : la base", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    // Chaque cas part d'une file vide (seules ses propres lignes, dans sa transaction).
    await proprietaire();
    await db.query("delete from public.relais_urgences");
    await db.query("delete from public.relais_urgences_envois");
  });
  afterEach(async () => { await db.query("rollback"); });

  // ── La file ─────────────────────────────────────────────────────────────

  it("une urgence signalée entre dans la file « à envoyer », sans son titre ; la même clé une seconde fois n'ajoute rien", async () => {
    const { createur, plan } = await planActif();
    const avant = (await file()).length;
    const id = await signaler(createur, plan, "incident-test", "Urgence fictive : Mme Exemple, 12 rue Exemple, 1 250 €");
    const apres = await file();
    expect(apres).toHaveLength(avant + 1);
    expect(apres.find((l) => l.alerte_id === id)).toEqual({ alerte_id: id, nature: "signalement_manuel", statut: "a_envoyer", envoi_id: null });
    // Dédoublonnage de l'alerte (plan, clé) : pas de seconde alerte, donc pas de seconde ligne.
    expect(await signaler(createur, plan, "incident-test", "Autre titre")).toBe(id);
    expect(await file()).toHaveLength(avant + 1);
    await proprietaire();
    const { rows } = await db.query("select row_to_json(u)::text as t from public.relais_urgences u");
    expect(rows.map((r) => r.t).join(" ")).not.toMatch(/Exemple|1 250|incident-test/);
  });

  it("les urgences que pose traiter_vacances : passage à reprendre, responsable qui perd son habilitation", async () => {
    const { responsable, plan } = await planActif();
    await proprietaire();
    await db.query("insert into public.agent_passages(mission, debut, etat) values ('quittances', now(), 'a_reprendre')");
    await service();
    await db.query("select traiter_vacances()");
    expect((await file()).map((l) => l.nature)).toContain("passage_a_reprendre");
    // Le passage n'est signalé qu'une fois : un nouveau passage de traiter_vacances n'ajoute rien.
    const n = (await file()).length;
    await service();
    await db.query("select traiter_vacances()");
    expect(await file()).toHaveLength(n);
    await proprietaire();
    await db.query("update memberships set status='inactive' where account_id=$1 and organization_id is null", [responsable]);
    await service();
    await db.query("select traiter_vacances()");
    const natures = (await file()).map((l) => l.nature);
    expect(natures).toContain("responsable_non_habilite");
    await proprietaire();
    const { rows: [a] } = await db.query("select statut from supervision_alertes_internes where plan_id=$1 and cle='responsable_non_habilite'", [plan]);
    // Non acheminée dans la console : l'e-mail immédiat part quand même (c'est justement là qu'il sert).
    expect(a.statut).toBe("non_acheminee");
  });

  it("la nature se lit dans la clé, jamais dans le titre ; une clé libre est un signalement fait à la main", async () => {
    await proprietaire();
    const { rows } = await db.query<{ n: string }>(
      `select public.nature_urgence_relais(c) n from unnest(array['responsable_non_habilite','passage:${UUID}','tache:${UUID}','passage:abc','libre']) c`
    );
    expect(rows.map((r) => r.n)).toEqual(["responsable_non_habilite", "passage_a_reprendre", "lecture_bloquee", "signalement_manuel", "signalement_manuel"]);
  });

  it("rien pour ce qui n'est pas une urgence : escalade, accusé, arrêt d'urgence ne remettent rien en file", async () => {
    const { createur, responsable, plan } = await planActif();
    await signaler(createur, plan, "incident-escalade");
    await signaler(createur, plan, "incident-accuse");
    const n = (await file()).length;
    await proprietaire();
    await db.query("update supervision_alertes_internes set echeance = now() - interval '1 minute' where plan_id=$1 and cle='incident-escalade'", [plan]);
    await service();
    await db.query("select traiter_vacances()");
    await proprietaire();
    expect((await db.query("select statut from supervision_alertes_internes where plan_id=$1 and cle='incident-escalade'", [plan])).rows[0].statut).toBe("escalade");
    await agir(responsable);
    await db.query("select accuser_alerte_vacances(id) from supervision_alertes_internes where plan_id=$1 and cle='incident-accuse'", [plan]);
    await agir(createur);
    await db.query("select commander_arret_supervision('global',null,true,'Arrêt d''essai du relais')");
    expect(await file()).toHaveLength(n);
  });

  // ── L'envoi : une seule fois par alerte ──────────────────────────────────

  it("prend les urgences en attente une seule fois ; un second appel ne reprend rien (rejeu)", async () => {
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-1");
    await signaler(createur, plan, "incident-2");
    const p = await prendre();
    expect(p).toMatchObject({ pris: true, tentative: 1, reprise: false, en_attente: 0 });
    expect(p.urgences).toHaveLength(2);
    expect(p.urgences!.every((u) => u.nature === "signalement_manuel" && u.posee_le)).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/incident-|Urgence fictive/);
    // Le temps de l'envoi (moins de 10 minutes), un second appel ne prend rien.
    expect(await prendre()).toEqual({ pris: false, motif: "rien", en_attente: 0 });
    expect(await terminer(p.envoi!, 2, 2)).toEqual({ termine: true, statut: "envoye" });
    expect((await file()).every((l) => l.statut === "envoyee" && l.envoi_id === p.envoi)).toBe(true);
    // Rejouer la fin, puis prendre de nouveau : rien ne bouge, rien ne repart.
    expect(await terminer(p.envoi!, 2, 2)).toEqual({ termine: false });
    expect(await prendre()).toEqual({ pris: false, motif: "rien", en_attente: 0 });
    // Une urgence posée ensuite part dans un nouvel envoi, seule.
    await signaler(createur, plan, "incident-3");
    const q = await prendre();
    expect(q.pris).toBe(true);
    expect(q.envoi).not.toBe(p.envoi);
    expect(q.urgences).toHaveLength(1);
  });

  it("un envoi incomplet se reprend tel quel (même identifiant, donc mêmes clés), trois tentatives au plus", async () => {
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-1");
    const p = await prendre();
    expect(await terminer(p.envoi!, 2, 1)).toEqual({ termine: true, statut: "a_reprendre" });
    // Une urgence arrivée entre-temps ne s'ajoute pas à l'envoi repris : son contenu reste figé.
    await signaler(createur, plan, "incident-2");
    const r2 = await prendre();
    expect(r2).toMatchObject({ pris: true, envoi: p.envoi, tentative: 2, reprise: true, en_attente: 1 });
    expect(r2.urgences).toEqual(p.urgences);
    expect(await terminer(p.envoi!, 2, 0)).toEqual({ termine: true, statut: "a_reprendre" });
    const r3 = await prendre();
    expect(r3).toMatchObject({ envoi: p.envoi, tentative: 3 });
    expect(await terminer(p.envoi!, 2, 1)).toEqual({ termine: true, statut: "abandonne" });
    const lignes = await file();
    expect(lignes.find((l) => l.envoi_id === p.envoi)?.statut).toBe("non_envoyee");
    // L'urgence suivante part dans son propre envoi ; l'abandonnée reste au rappel de 5 h.
    const r4 = await prendre();
    expect(r4).toMatchObject({ pris: true, tentative: 1, reprise: false });
    expect(r4.envoi).not.toBe(p.envoi);
    const rappel = await recentes();
    expect(rappel.urgences.map((u) => u.email).sort()).toEqual(["echec", "en_cours"]);
  });

  it("une passe coupée (en cours depuis plus de 10 minutes) se reprend ; avant, non", async () => {
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-1");
    const p = await prendre();
    expect(await prendre()).toMatchObject({ pris: false, motif: "rien" });
    await proprietaire();
    await db.query("update public.relais_urgences_envois set essaye_le = now() - interval '11 minutes' where id=$1", [p.envoi]);
    expect(await prendre()).toMatchObject({ pris: true, envoi: p.envoi, tentative: 2, reprise: true });
  });

  // ── Le plafond anti-rafale ───────────────────────────────────────────────

  it("au-delà de 6 envois créés dans l'heure, rien n'est pris ; le surplus attend, puis part groupé dans l'envoi suivant", async () => {
    const { createur, plan } = await planActif();
    for (let i = 1; i <= 6; i++) {
      await signaler(createur, plan, `rafale-${i}`);
      const p = await prendre();
      expect(p, `envoi ${i}`).toMatchObject({ pris: true, tentative: 1 });
      expect(p.urgences).toHaveLength(1);
      await terminer(p.envoi!, 2, 2);
    }
    for (let i = 7; i <= 9; i++) await signaler(createur, plan, `rafale-${i}`);
    expect(await prendre()).toEqual({ pris: false, motif: "plafond", en_attente: 3, envois_dans_l_heure: 6 });
    expect((await file()).filter((l) => l.statut === "a_envoyer")).toHaveLength(3);
    // Une heure plus tard (les envois vieillissent), les trois partent ensemble, dans un seul envoi.
    await proprietaire();
    await db.query("update public.relais_urgences_envois set commence_le = commence_le - interval '61 minutes', essaye_le = essaye_le - interval '61 minutes'");
    const groupe = await prendre();
    expect(groupe).toMatchObject({ pris: true, en_attente: 0 });
    expect(groupe.urgences).toHaveLength(3);
    // Le plafond se règle par appel, borné de 1 à 60.
    await terminer(groupe.envoi!, 2, 2);
    await signaler(createur, plan, "rafale-10");
    expect(await prendre(1)).toMatchObject({ pris: false, motif: "plafond" });
    expect(await prendre(0)).toMatchObject({ pris: false, motif: "plafond" });
    expect(await prendre(2)).toMatchObject({ pris: true });
  });

  it("une reprise ne compte pas dans le plafond (elle ne fait pas partir de second message)", async () => {
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-1");
    const p = await prendre(1);
    await terminer(p.envoi!, 2, 1);
    expect(await prendre(1)).toMatchObject({ pris: true, envoi: p.envoi, reprise: true });
  });

  it("l'arrêt d'urgence actif ne retient ni la file ni l'envoi", async () => {
    const { createur, plan } = await planActif();
    await agir(createur);
    await db.query("select commander_arret_supervision('global',null,true,'Arrêt d''essai du relais')");
    await signaler(createur, plan, "incident-pendant-arret");
    expect((await file()).some((l) => l.statut === "a_envoyer")).toBe(true);
    expect(await prendre()).toMatchObject({ pris: true });
  });

  // ── Le rappel de 5 h ─────────────────────────────────────────────────────

  it("rappelle les urgences des dernières 24 h, envoyées ou non, sans titre ; au-delà de 24 h, plus rien", async () => {
    const { createur, plan } = await planActif();
    const envoyee = await signaler(createur, plan, "incident-envoye", "Mme Exemple, 3 rue Exemple");
    const p = await prendre();
    await terminer(p.envoi!, 1, 1);
    const attente = await signaler(createur, plan, "incident-attente");
    const ancienne = await signaler(createur, plan, "incident-ancien");
    await proprietaire();
    await db.query("update supervision_alertes_internes set cree_le = now() - interval '25 hours' where id=$1", [ancienne]);
    const r = await recentes();
    const ids = r.urgences.map((u) => u.alerte);
    expect(ids).toContain(envoyee);
    expect(ids).toContain(attente);
    expect(ids).not.toContain(ancienne);
    expect(r.urgences.find((u) => u.alerte === envoyee)).toMatchObject({ nature: "signalement_manuel", email: "envoye" });
    expect(r.urgences.find((u) => u.alerte === attente)).toMatchObject({ email: "en_attente" });
    expect(JSON.stringify(r)).not.toMatch(/Exemple|incident-/);
  });

  it("après un e-mail de 5 h complet, les urgences qu'il a reprises en attente ne repartent plus ; les autres, si", async () => {
    const { createur, plan } = await planActif();
    const a = await signaler(createur, plan, "incident-a");
    const b = await signaler(createur, plan, "incident-b");
    await service();
    const { rows: [{ n }] } = await db.query<{ n: number }>("select public.urgences_relais_au_quotidien($1::uuid[]) n", [[a]]);
    expect(n).toBe(1);
    const lignes = await file();
    expect(lignes.find((l) => l.alerte_id === a)?.statut).toBe("quotidien");
    const p = await prendre();
    expect(p.urgences).toHaveLength(1);
    expect((await file()).find((l) => l.alerte_id === b)?.statut).toBe("en_envoi");
    // Une urgence déjà en cours d'envoi n'est pas reprise par le quotidien.
    await service();
    expect((await db.query<{ n: number }>("select public.urgences_relais_au_quotidien($1::uuid[]) n", [[b]])).rows[0].n).toBe(0);
  });

  // ── Les droits ───────────────────────────────────────────────────────────

  it("le traitement et le superviseur permanent (double vérification) prennent et terminent ; personne d'autre ; personne n'écrit les tables", async () => {
    const { createur, plan } = await planActif();
    const agent = await compte();
    await signaler(createur, plan, "incident-droits");
    for (const role of ["anon", "authenticated", "service_role"]) {
      await proprietaire();
      const { rows } = await db.query(
        `select t, has_table_privilege($1, t, 'INSERT,UPDATE,DELETE') as ecrit from unnest(array['public.relais_urgences','public.relais_urgences_envois']) t`, [role]
      );
      expect(rows.filter((r) => r.ecrit), role).toEqual([]);
    }
    await proprietaire();
    const { rows: anon } = await db.query(
      `select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
          and p.proname in ('prendre_urgences_relais','terminer_urgences_relais','urgences_relais_recentes','urgences_relais_au_quotidien','nature_urgence_relais','relais_urgence_a_envoyer')`
    );
    expect(anon).toEqual([]);
    await agir(agent);
    expect(await refusee("select public.prendre_urgences_relais(6)")).toMatch(/Accès refusé/);
    expect(await refusee(`select public.terminer_urgences_relais('${UUID}',1,1)`)).toMatch(/Accès refusé/);
    expect((await db.query("select * from public.relais_urgences")).rows).toHaveLength(0);
    await agir(createur, "aal1");
    expect(await refusee("select public.prendre_urgences_relais(6)")).toMatch(/Accès refusé/);
    await agir(createur);
    expect(await refusee("select public.urgences_relais_recentes()")).toMatch(/permission denied|réservé/);
    expect(await refusee("select public.urgences_relais_au_quotidien('{}'::uuid[])")).toMatch(/permission denied|réservé/);
    const { rows: [{ r }] } = await db.query("select public.prendre_urgences_relais(6) r");
    expect(r).toMatchObject({ pris: true });
    expect((await db.query("select statut from public.relais_urgences")).rows).toEqual([{ statut: "en_envoi" }]);
    // Sans jeton (propriétaire, pg_cron) : refusé aussi.
    await proprietaire();
    expect(await refusee("select public.prendre_urgences_relais(6)")).toMatch(/Accès refusé/);
    expect(await refusee("select public.urgences_relais_recentes()")).toMatch(/réservé au traitement/);
  });

  // ── Le rejeu ────────────────────────────────────────────────────────────

  it("la migration se rejoue sans effet ni erreur : un seul déclencheur, la file et les envois conservés", async () => {
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-rejeu");
    const p = await prendre();
    await terminer(p.envoi!, 1, 1);
    await proprietaire();
    const migration = readFileSync(CHEMIN_MIGRATION, "utf8");
    await db.query(migration);
    await db.query(migration);
    const { rows: [{ n }] } = await db.query<{ n: number }>(
      "select count(*)::int n from pg_trigger where tgrelid='public.supervision_alertes_internes'::regclass and tgname='relais_urgence_a_envoyer'"
    );
    expect(n).toBe(1);
    expect((await file()).map((l) => l.statut)).toEqual(["envoyee"]);
    // Une urgence posée après le rejeu entre une seule fois dans la file.
    await signaler(createur, plan, "incident-apres-rejeu");
    expect((await file()).filter((l) => l.statut === "a_envoyer")).toHaveLength(1);
  });
});

/** Le client de la base vu par le serveur (`rpc`), branché sur la transaction du test, au nom du traitement. */
function clientDuTraitement() {
  return {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      await service();
      const cles = Object.keys(args);
      await db.query("savepoint rpc");
      try {
        const { rows: [{ r }] } = await db.query(`select public.${fn}(${cles.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, cles.map((k) => args[k]));
        await db.query("release savepoint rpc");
        return { data: r as unknown, error: null };
      } catch (err) {
        await db.query("rollback to savepoint rpc");
        return { data: null, error: { message: (err as Error).message } };
      }
    },
  };
}

describe.skipIf(!DB_URL)("D46-B — e-mail immédiat des urgences : le serveur sur la vraie base (aucun envoi réel)", () => {
  const ADRESSES = lireAdressesRelais("relais@example.com, second@example.org");
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
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  });
  afterEach(async () => {
    await db.query("rollback");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("une urgence posée : un e-mail par adresse, une seule fois ; un second passage n'envoie rien ; la file dit « envoyée »", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-bout-en-bout", "Urgence fictive : Mme Exemple, 1 250 €");
    const r = await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r).toEqual({ arret: "rien", envois: [{ urgences: 1, destinataires: 2, envoyes: 2, reprise: false, statut: "envoye" }] });
    expect(fournisseur.acceptes.map((a) => a.to[0]).sort()).toEqual(["relais@example.com", "second@example.org"]);
    expect(await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: ADRESSES, site: "https://gerimmo.test" })).toEqual({ arret: "rien", envois: [] });
    expect(fournisseur.acceptes).toHaveLength(2);
    expect((await file()).map((l) => l.statut)).toEqual(["envoyee"]);
    expect((await recentes()).urgences.map((u) => u.email)).toEqual(["envoye"]);
  });

  it("relais non configuré : rien ne part, la file est conservée ; configuré ensuite, l'urgence part", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-sans-relais");
    expect(await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: lireAdressesRelais(undefined), site: "https://gerimmo.test" }))
      .toEqual({ arret: "non_configure", envois: [] });
    expect(fournisseur.appels).toEqual([]);
    expect((await file()).map((l) => l.statut)).toEqual(["a_envoyer"]);
    const r = await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r.envois).toHaveLength(1);
    expect(fournisseur.acceptes).toHaveLength(2);
  });

  it("plafond : sept urgences en sept passages, six e-mails dans l'heure ; la septième attend, puis part groupée", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const { createur, plan } = await planActif();
    const un = lireAdressesRelais("relais@example.com");
    for (let i = 1; i <= 7; i++) {
      await signaler(createur, plan, `rafale-${i}`);
      await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: un, site: "https://gerimmo.test" });
    }
    expect(fournisseur.acceptes).toHaveLength(6);
    await signaler(createur, plan, "rafale-8");
    expect(await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: un, site: "https://gerimmo.test" })).toEqual({ arret: "plafond", envois: [], en_attente: 2 });
    await proprietaire();
    await db.query("update public.relais_urgences_envois set commence_le = commence_le - interval '61 minutes'");
    const r = await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: un, site: "https://gerimmo.test" });
    expect(r.envois).toEqual([{ urgences: 2, destinataires: 1, envoyes: 1, reprise: false, statut: "envoye" }]);
    expect(fournisseur.acceptes).toHaveLength(7);
    expect(fournisseur.acceptes[6].subject).toBe("Gerimmo — 2 urgences du relais");
  });

  it("service muet puis revenu : l'envoi est repris sous les mêmes clés, sans second message", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { createur, plan } = await planActif();
    await signaler(createur, plan, "incident-muet");
    fournisseur.definirMode("accepte-puis-muet");
    const r1 = await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: ADRESSES, site: "https://gerimmo.test", delaiMaxMs: 20 });
    expect(r1).toMatchObject({ arret: "echec", envois: [{ envoyes: 0, statut: "a_reprendre" }] });
    expect(fournisseur.acceptes).toHaveLength(2);
    fournisseur.definirMode("normal");
    const r2 = await envoyerUrgencesRelais({ db: clientDuTraitement(), adresses: ADRESSES, site: "https://gerimmo.test" });
    expect(r2.envois[0]).toMatchObject({ envoyes: 2, reprise: true, statut: "envoye" });
    // Le service a reconnu les clés : toujours deux messages, un par adresse.
    expect(fournisseur.acceptes).toHaveLength(2);
    expect(new Set(fournisseur.cles()).size).toBe(2);
    vi.restoreAllMocks();
  });
});
