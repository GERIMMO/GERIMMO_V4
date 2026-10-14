/**
 * D09 (audit du 13/10, SUP-03) — seul le destinataire d'une alerte de relais peut en accuser réception.
 *
 * Avant : n'importe quel super-administrateur permanent pouvait « accuser la prise en compte » d'une alerte
 * adressée à un autre responsable (la fonction ne comparait pas auth.uid() au destinataire) : une urgence du
 * mode vacances passait à « accusée » sans que le responsable l'ait vue, et l'écran ne disait pas par qui.
 *
 * Maintenant : le destinataire seulement. Après une escalade, `destinataire` est changé pour la personne vers
 * qui l'alerte est escaladée : c'est elle, et elle seule, qui peut l'accuser. Une alerte « non acheminée »
 * (son destinataire n'est plus habilité, donc ne peut rien faire) peut être reprise par un autre superviseur
 * permanent — sans cela elle ne pourrait jamais être refermée.
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("D09 — accuser réception d'une alerte de relais", () => {
  let db: Client;
  let createur: string;      // crée le plan : destinataire après escalade
  let responsable: string;   // désigné par le plan : destinataire de l'alerte
  let tiers: string;         // un autre superviseur permanent, sans lien avec l'alerte
  let etranger: string;      // aucun rôle de supervision

  async function compte() {
    const { rows: [u] } = await db.query(
      `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values(gen_random_uuid(),'authenticated','authenticated','relais-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
    );
    return u.id as string;
  }
  async function agir(id: string, aal = "aal2") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text,true)", [id, aal]);
    await db.query("set local role authenticated");
  }
  async function service() {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    await db.query("set local role service_role");
  }
  async function ecrire(sql: string, args: unknown[] = []) {
    await db.query("reset role");
    return db.query(sql, args);
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
  /** Un plan actif créé par `createur`, confié à `responsable`, et une alerte ouverte qui lui est adressée. */
  async function alerteOuverte() {
    await agir(createur);
    const { rows: [p] } = await db.query(
      "select enregistrer_vacances(null,'Vacances TEST',now()-interval '1 hour',now()+interval '1 day','Europe/Paris',$1,null,60) id", [responsable]
    );
    await db.query("select traiter_vacances()");
    const { rows: [a] } = await db.query("select signaler_urgence_vacances($1,'incident-test','Urgence fictive à examiner') id", [p.id]);
    return { plan: p.id as string, alerte: a.id as string };
  }
  async function etat(alerte: string) {
    await ecrire("select 1");
    const { rows: [r] } = await db.query("select statut, destinataire, accusee_par from supervision_alertes_internes where id=$1", [alerte]);
    return r as { statut: string; destinataire: string; accusee_par: string | null };
  }
  async function operations(alerte: string) {
    await ecrire("select 1");
    const { rows } = await db.query("select auteur from supervision_operations where objet=$1 and action='alerte_accusee'", [alerte]);
    return rows as { auteur: string }[];
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    createur = await compte(); responsable = await compte(); tiers = await compte(); etranger = await compte();
    await db.query("insert into memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active'),($2,null,'super_admin','active'),($3,null,'super_admin','active')", [createur, responsable, tiers]);
  });
  beforeEach(async () => { await db.query("reset role"); await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); await db.query("release savepoint cas"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("un autre superviseur permanent ne peut pas accuser une alerte adressée au responsable", async () => {
    const { alerte } = await alerteOuverte();
    await agir(tiers);
    await expect(essai("select accuser_alerte_vacances($1)", [alerte])).rejects.toThrow(/autre responsable/);
    expect(await etat(alerte)).toEqual({ statut: "ouverte", destinataire: responsable, accusee_par: null });
    expect(await operations(alerte)).toEqual([]);
  });

  it("le créateur du plan, qui n'est pas le destinataire, ne le peut pas non plus", async () => {
    const { alerte } = await alerteOuverte();
    await agir(createur);
    await expect(essai("select accuser_alerte_vacances($1)", [alerte])).rejects.toThrow(/autre responsable/);
    expect((await etat(alerte)).statut).toBe("ouverte");
  });

  it("le destinataire accuse : l'accusé porte son nom et laisse une trace", async () => {
    const { alerte } = await alerteOuverte();
    await agir(responsable);
    await db.query("select accuser_alerte_vacances($1)", [alerte]);
    expect(await etat(alerte)).toEqual({ statut: "accusee", destinataire: responsable, accusee_par: responsable });
    expect(await operations(alerte)).toEqual([{ auteur: responsable }]);
  });

  it("une alerte déjà accusée le reste, sans erreur ni nouvelle trace, quel que soit l'appelant", async () => {
    const { alerte } = await alerteOuverte();
    await agir(responsable);
    await db.query("select accuser_alerte_vacances($1)", [alerte]);
    await agir(tiers);
    await db.query("select accuser_alerte_vacances($1)", [alerte]);
    expect(await etat(alerte)).toMatchObject({ statut: "accusee", accusee_par: responsable });
    expect(await operations(alerte)).toHaveLength(1);
  });

  it("une alerte inconnue ne fait rien, comme avant", async () => {
    await agir(tiers);
    await db.query("select accuser_alerte_vacances(gen_random_uuid())");
  });

  it("après l'escalade, seule la personne vers qui l'alerte est escaladée peut l'accuser", async () => {
    const { alerte } = await alerteOuverte();
    await ecrire("update supervision_alertes_internes set echeance=now()-interval '1 minute' where id=$1", [alerte]);
    await service();
    await db.query("select traiter_vacances()");
    expect(await etat(alerte)).toEqual({ statut: "escalade", destinataire: createur, accusee_par: null });
    // Le responsable d'origine n'est plus le destinataire : il ne peut plus l'accuser.
    await agir(responsable);
    await expect(essai("select accuser_alerte_vacances($1)", [alerte])).rejects.toThrow(/autre responsable/);
    await agir(tiers);
    await expect(essai("select accuser_alerte_vacances($1)", [alerte])).rejects.toThrow(/autre responsable/);
    await agir(createur);
    await db.query("select accuser_alerte_vacances($1)", [alerte]);
    expect(await etat(alerte)).toEqual({ statut: "accusee", destinataire: createur, accusee_par: createur });
  });

  it("une alerte non acheminée (destinataire plus habilité) peut être reprise par un autre superviseur permanent", async () => {
    const { plan } = await alerteOuverte();
    await ecrire("update memberships set status='inactive' where account_id=$1", [responsable]);
    await service();
    await db.query("select traiter_vacances()");
    const { rows: [a] } = await db.query("select id,statut,destinataire from supervision_alertes_internes where plan_id=$1 and cle='responsable_non_habilite'", [plan]);
    expect(a).toMatchObject({ statut: "non_acheminee", destinataire: responsable });
    await agir(tiers);
    await db.query("select accuser_alerte_vacances($1)", [a.id]);
    expect(await etat(a.id)).toEqual({ statut: "accusee", destinataire: responsable, accusee_par: tiers });
  });

  it("si le destinataire d'une alerte non acheminée est de nouveau habilité, lui seul l'accuse", async () => {
    const { plan } = await alerteOuverte();
    await ecrire("update memberships set status='inactive' where account_id=$1", [responsable]);
    await service();
    await db.query("select traiter_vacances()");
    const { rows: [a] } = await db.query("select id from supervision_alertes_internes where plan_id=$1 and cle='responsable_non_habilite'", [plan]);
    await ecrire("update memberships set status='active' where account_id=$1", [responsable]);
    await agir(tiers);
    await expect(essai("select accuser_alerte_vacances($1)", [a.id])).rejects.toThrow(/autre responsable/);
    await agir(responsable);
    await db.query("select accuser_alerte_vacances($1)", [a.id]);
    expect((await etat(a.id)).accusee_par).toBe(responsable);
  });

  it("les gardes d'avant restent : second facteur et rôle de supervision exigés", async () => {
    const { alerte } = await alerteOuverte();
    await agir(responsable, "aal1");
    await expect(essai("select accuser_alerte_vacances($1)", [alerte])).rejects.toThrow(/double vérification/);
    await agir(etranger);
    await expect(essai("select accuser_alerte_vacances($1)", [alerte])).rejects.toThrow(/double vérification/);
    expect((await etat(alerte)).statut).toBe("ouverte");
  });
});
