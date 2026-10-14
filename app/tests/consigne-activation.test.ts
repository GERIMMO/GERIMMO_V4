/**
 * D10 (audit du 13/10, SUP-04), option C — « activation » tant qu'une consigne ne peut que lire deux compteurs,
 * approbateur DISTINCT du rédacteur dès qu'elle peut envoyer ou toucher un droit.
 *
 * Ce que peut faire une consigne aujourd'hui (relevé dans le code, verrouillé ici) : lire l'état d'une mission
 * et compter des passages. La contrainte de la table des tâches n'accepte rien d'autre, `enregistrer_consigne`
 * non plus, et `executer_tache_consigne` ne fait que ces deux lectures. Tant que c'est vrai, le rédacteur peut
 * activer sa propre consigne (un seul superviseur permanent rendrait l'approbateur distinct impraticable).
 * Le jour où un type de tâche agit, `decider_consigne` exige un autre approbateur — sans rien reconfigurer :
 * un type non classé « lecture seule » est supposé pouvoir agir.
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { TACHES_LECTURE_SEULE, estTacheLectureSeule } from "../src/lib/consignes-regles";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D10 — activer ou approuver une consigne", () => {
  let db: Client;
  let redacteur: string;
  let autre: string;

  async function compte() {
    const { rows: [u] } = await db.query(
      `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values(gen_random_uuid(),'authenticated','authenticated','consigne-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
    );
    return u.id as string;
  }
  async function agir(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text,true)", [id, aal]);
    await db.query("set local role authenticated");
  }
  async function essai(sql: string, args: unknown[] = []) {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, args);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  }
  /** Une version rédigée par `redacteur`, avec ces tâches de lecture. */
  async function version(types = ["lecture_missions", "lecture_passages"]) {
    await agir(redacteur);
    const { rows: [v] } = await db.query(
      "select enregistrer_consigne(null,0,'Consigne TEST','Lecture interne de contrôle uniquement','quittances',now()-interval '2 hours',now()+interval '3 days',$1,2,2,$2::text[]) id",
      [autre, types]
    );
    return v.id as string;
  }
  /** Fait « pouvoir agir » à une des tâches : ce que la contrainte interdit aujourd'hui, retiré le temps du test. */
  async function rendreAgissante(versionId: string, type = "envoi_test") {
    await db.query("reset role");
    const { rows } = await db.query(
      "select conname from pg_constraint where conrelid='public.supervision_consignes_taches'::regclass and contype='c' and pg_get_constraintdef(oid) like '%lecture_passages%'"
    );
    for (const { conname } of rows) await db.query(`alter table public.supervision_consignes_taches drop constraint "${conname}"`);
    await db.query("update public.supervision_consignes_taches set type=$2 where version_id=$1 and type='lecture_missions'", [versionId, type]);
  }
  async function accord(versionId: string) {
    await db.query("reset role");
    const { rows } = await db.query("select accepte, auteur from public.supervision_consignes_accords where version_id=$1", [versionId]);
    return rows as { accepte: boolean; auteur: string }[];
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    redacteur = await compte(); autre = await compte();
    await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active'),($2,null,'super_admin','active')", [redacteur, autre]);
  });
  beforeEach(async () => { await db.query("reset role"); await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); await db.query("release savepoint cas"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("aujourd'hui : une consigne ne peut que lire — c'est une activation", () => {
    it("les types de tâche que la base accepte sont tous des lectures seules (miroir TypeScript compris)", async () => {
      const { rows: [c] } = await db.query(
        "select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.supervision_consignes_taches'::regclass and contype='c' and pg_get_constraintdef(oid) like '%lecture_passages%'"
      );
      // La contrainte ne porte que sur la colonne « type » : toutes les valeurs citées sont des types de tâche.
      const types = [...(c.d as string).matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
      expect(types.sort(), "un nouveau type de tâche doit être classé (lecture seule ou non) AVANT d'exister").toEqual([...TACHES_LECTURE_SEULE].sort());
      for (const type of types) {
        const { rows: [r] } = await db.query("select public.tache_consigne_lecture_seule($1) ok", [type]);
        expect(r.ok, type).toBe(true);
        expect(estTacheLectureSeule(type), type).toBe(true);
      }
    });

    it("un type inconnu, vide ou nul n'est jamais « lecture seule »", async () => {
      for (const type of ["envoi_courriel", "paiement", "droit_acces", "", "Lecture_missions"]) {
        const { rows: [r] } = await db.query("select public.tache_consigne_lecture_seule($1) ok", [type]);
        expect(r.ok, type).toBe(false);
        expect(estTacheLectureSeule(type), type).toBe(false);
      }
      const { rows: [n] } = await db.query("select public.tache_consigne_lecture_seule(null) ok");
      expect(n.ok).toBe(false);
    });

    it("le rédacteur peut activer sa propre consigne de lecture", async () => {
      const v = await version();
      await agir(redacteur);
      await db.query("select decider_consigne($1,true)", [v]);
      expect(await accord(v)).toEqual([{ accepte: true, auteur: redacteur }]);
    });

    it("un autre superviseur permanent peut l'activer aussi", async () => {
      const v = await version();
      await agir(autre);
      await db.query("select decider_consigne($1,true)", [v]);
      expect(await accord(v)).toEqual([{ accepte: true, auteur: autre }]);
    });
  });

  describe("dès qu'une tâche peut agir : un approbateur distinct du rédacteur", () => {
    it("le rédacteur ne peut pas approuver sa propre consigne, et rien n'est enregistré", async () => {
      const v = await version();
      await rendreAgissante(v);
      await agir(redacteur);
      await expect(essai("select decider_consigne($1,true)", [v])).rejects.toThrow(/autre personne que son rédacteur/);
      expect(await accord(v)).toEqual([]);
      await db.query("reset role");
      const { rows } = await db.query("select etat from public.supervision_consignes_taches where version_id=$1 order by type", [v]);
      expect(rows.map((r) => r.etat)).toEqual(["proposee", "proposee"]);
    });

    it("un autre superviseur permanent l'approuve : l'approbation porte son nom", async () => {
      const v = await version();
      await rendreAgissante(v);
      await agir(autre);
      await db.query("select decider_consigne($1,true)", [v]);
      expect(await accord(v)).toEqual([{ accepte: true, auteur: autre }]);
    });

    it("la règle vaut dès UNE tâche qui agit, même mêlée à des lectures", async () => {
      const v = await version(["lecture_missions", "lecture_passages"]);
      await rendreAgissante(v);
      await agir(redacteur);
      await expect(essai("select decider_consigne($1,true)", [v])).rejects.toThrow(/autre personne que son rédacteur/);
    });

    it("le rédacteur peut refuser sa propre version : refuser n'active rien", async () => {
      const v = await version();
      await rendreAgissante(v);
      await agir(redacteur);
      await db.query("select decider_consigne($1,false)", [v]);
      expect(await accord(v)).toEqual([{ accepte: false, auteur: redacteur }]);
    });

    it("les gardes d'avant restent : second facteur, version remplacée, décision déjà prise", async () => {
      const v = await version();
      await agir(autre, "aal1");
      await expect(essai("select decider_consigne($1,true)", [v])).rejects.toThrow(/double vérification/);
      await agir(autre);
      await expect(essai("select decider_consigne($1,null)", [v])).rejects.toThrow(/Décision requise/);
      await db.query("select decider_consigne($1,true)", [v]);
      await expect(essai("select decider_consigne($1,false)", [v])).rejects.toThrow(/déjà enregistrée/);
    });
  });
});
