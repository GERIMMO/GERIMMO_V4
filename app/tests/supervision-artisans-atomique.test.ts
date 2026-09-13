import { randomInt } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const APPEL = "select public.traiter_inscription_artisan_atomique($1,$2,$3,$4,$5)";

async function compte(db: Client, superAdmin = false) {
  const { rows: [utilisateur] } = await db.query(
    `insert into auth.users (id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), 'authenticated', 'authenticated',
       'supervision-' || gen_random_uuid() || '@test.local', 'x', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()) returning id`
  );
  if (superAdmin) await db.query(
    "insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')",
    [utilisateur.id]
  );
  return utilisateur.id as string;
}

async function fiche(db: Client, siretVerifie = false) {
  const { rows: [artisan] } = await db.query(
    `insert into public.artisans (raison_sociale, siret, telephone, siret_etat)
     values ('Artisan recette supervision', $1, '0600000000', $2) returning id`,
    [String(randomInt(10_000_000_000_000, 100_000_000_000_000)), siretVerifie ? "verifie" : "non_verifie"]
  );
  return artisan.id as string;
}

async function agir(db: Client, utilisateur: string) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims',
    json_build_object('sub',$1::text,'role','authenticated')::text,true)`, [utilisateur]);
  await db.query("set local role authenticated");
}

async function essai(db: Client, params: unknown[]) {
  await db.query("savepoint essai");
  try {
    const resultat = await db.query(APPEL, params);
    await db.query("release savepoint essai");
    return resultat;
  } catch (erreur) {
    await db.query("rollback to savepoint essai");
    throw erreur;
  }
}

describe.skipIf(!DB_URL)("Supervision artisan — décisions atomiques", () => {
  let db: Client;
  let sa: string;
  let autre: string;
  let artisan: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    sa = await compte(db, true);
    autre = await compte(db);
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
    artisan = await fiche(db);
  });
  afterEach(async () => { await db.query("rollback to savepoint cas"); });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("refuse un compte ordinaire et n’accorde aucun accès anonyme", async () => {
    const { rows: [acces] } = await db.query(`select has_function_privilege('anon',
      'public.traiter_inscription_artisan_atomique(uuid,text,text,boolean,boolean)', 'execute') as autorise`);
    expect(acces.autorise).toBe(false);
    await agir(db, autre);
    await expect(essai(db, [artisan, "verifier_siret", null, true, false])).rejects.toThrow(/réservé à la supervision/);
    await db.query("reset role");
    const { rows: [a] } = await db.query("select siret_etat from public.artisans where id=$1", [artisan]);
    expect(a.siret_etat).toBe("non_verifie");
    const { rows } = await db.query("select id from public.audit_log where details->>'artisan_id'=$1", [artisan]);
    expect(rows).toHaveLength(0);
  });

  it("rejette une opération étrangère à la file et une inscription inexistante", async () => {
    await agir(db, sa);
    await expect(essai(db, [artisan, "blacklist_globale", "Motif", true, true])).rejects.toThrow(/décision proposée/);
    await expect(essai(db, [artisan, null, null, true, true])).rejects.toThrow(/décision proposée/);
    await expect(essai(db, [crypto.randomUUID(), "validation", null, false, true])).rejects.toThrow(/introuvable/);
  });

  it("exige un constat explicite de SIRET et laisse l’inscription en attente", async () => {
    await agir(db, sa);
    await expect(essai(db, [artisan, "verifier_siret", null, null, false])).rejects.toThrow(/Confirmez avoir vérifié/);
    await db.query(APPEL, [artisan, "verifier_siret", null, true, false]);
    const { rows: [a] } = await db.query("select siret_etat, statut_plateforme, visibilite from public.artisans where id=$1", [artisan]);
    expect(a).toEqual({ siret_etat: "verifie", statut_plateforme: "en_attente", visibilite: "privee" });
    const { rows: traces } = await db.query("select details from public.audit_log where details->>'artisan_id'=$1", [artisan]);
    expect(traces.map((r) => r.details.operation_demandee)).toEqual(["verifier_siret"]);
  });

  it("exige le SIRET vérifié et la relecture, sans ajouter de condition d’assurance globale", async () => {
    await agir(db, sa);
    await expect(essai(db, [artisan, "validation", null, false, true])).rejects.toThrow(/Vérifiez d’abord le SIRET/);
    await db.query(APPEL, [artisan, "verifier_siret", null, true, false]);
    await expect(essai(db, [artisan, "validation", null, false, null])).rejects.toThrow(/Confirmez avoir relu/);
    await db.query(APPEL, [artisan, "validation", null, false, true]);
    const { rows: [a] } = await db.query("select statut_plateforme, visibilite from public.artisans where id=$1", [artisan]);
    expect(a).toEqual({ statut_plateforme: "valide", visibilite: "privee" });
    const { rows: decisions } = await db.query("select decision from public.artisan_validations where artisan_id=$1", [artisan]);
    expect(decisions.map((r) => r.decision)).toEqual(["validation"]);
  });

  it("motive le refus, empêche une décision périmée et permet son réexamen explicite", async () => {
    await agir(db, sa);
    await expect(essai(db, [artisan, "refus", "   ", false, false])).rejects.toThrow(/motif objectif/);
    await expect(essai(db, [artisan, "remise_en_attente", null, false, false])).rejects.toThrow(/déjà changé d’état/);
    await db.query(APPEL, [artisan, "refus", "  Justificatif illisible  ", false, false]);
    await expect(essai(db, [artisan, "validation", null, false, true])).rejects.toThrow(/déjà changé d’état/);
    const { rows: [refus] } = await db.query("select statut_plateforme, statut_motif from public.artisans where id=$1", [artisan]);
    expect(refus).toEqual({ statut_plateforme: "refuse", statut_motif: "Justificatif illisible" });
    await db.query(APPEL, [artisan, "remise_en_attente", null, false, false]);
    const { rows: [a] } = await db.query("select statut_plateforme, siret_etat from public.artisans where id=$1", [artisan]);
    expect(a).toEqual({ statut_plateforme: "en_attente", siret_etat: "non_verifie" });
    const { rows: decisions } = await db.query("select decision, motif from public.artisan_validations where artisan_id=$1 order by decision", [artisan]);
    expect(decisions).toHaveLength(2);
    expect(decisions).toContainEqual({ decision: "refus", motif: "Justificatif illisible" });
    expect(decisions).toContainEqual({ decision: "remise_en_attente", motif: null });
  });
});

// Les deux sessions doivent voir le même décor : ces seuls comptes et fiches
// sont validés dans une base de test puis supprimés par leurs identifiants.
// Aucun dossier applicatif existant n'est utilisé ni modifié.
describe.skipIf(!DB_URL)("Supervision artisan — deux examens simultanés", () => {
  let semeur: Client;
  let premiere: Client;
  let seconde: Client;
  let sa: string | undefined;
  const artisans: string[] = [];

  beforeAll(async () => {
    semeur = new Client({ connectionString: DB_URL });
    premiere = new Client({ connectionString: DB_URL });
    seconde = new Client({ connectionString: DB_URL });
    await Promise.all([semeur.connect(), premiere.connect(), seconde.connect()]);
    sa = await compte(semeur, true);
  });
  afterEach(async () => {
    await Promise.all([premiere.query("rollback"), seconde.query("rollback")]);
  });
  afterAll(async () => {
    await Promise.all([premiere?.query("rollback"), seconde?.query("rollback")]);
    if (semeur && sa) {
      await semeur.query("delete from public.artisans where id=any($1::uuid[])", [artisans]);
      await semeur.query("delete from public.audit_log where account_id=$1", [sa]);
      await semeur.query("delete from auth.users where id=$1", [sa]);
    }
    await Promise.all([premiere?.end(), seconde?.end(), semeur?.end()]);
  });

  it.each([
    ["validation", "refus", "valide"],
    ["refus", "validation", "refuse"],
    ["refus", "verifier_siret", "refuse"],
  ])("%s déjà en cours bloque puis rejette %s", async (operationA, operationB, statutFinal) => {
    const artisan = await fiche(semeur, true);
    artisans.push(artisan);
    await Promise.all([premiere.query("begin"), seconde.query("begin")]);
    await Promise.all([agir(premiere, sa!), agir(seconde, sa!)]);
    await seconde.query("set local statement_timeout = '8s'");
    const { rows: [session] } = await seconde.query("select pg_backend_pid() as pid");

    await premiere.query(APPEL, [artisan, operationA, operationA === "refus" ? "Pièce illisible" : null, true, true]);
    const suite = seconde.query(APPEL, [artisan, operationB, operationB === "refus" ? "Autre décision" : null, true, true])
      .then(() => ({ erreur: null }), (erreur: Error) => ({ erreur: erreur.message }));

    let attendLeVerrou = false;
    for (let i = 0; i < 100; i++) {
      const { rows: [activite] } = await semeur.query(
        "select wait_event_type from pg_stat_activity where pid=$1", [session.pid]
      );
      if (activite?.wait_event_type === "Lock") { attendLeVerrou = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(attendLeVerrou, "le second examen doit attendre la décision déjà verrouillée").toBe(true);
    await premiere.query("commit");
    expect((await suite).erreur).toMatch(/déjà changé d’état/);
    await seconde.query("rollback");

    const { rows: [a] } = await semeur.query("select statut_plateforme from public.artisans where id=$1", [artisan]);
    expect(a.statut_plateforme).toBe(statutFinal);
    const { rows: decisions } = await semeur.query("select decision from public.artisan_validations where artisan_id=$1", [artisan]);
    expect(decisions.map((r) => r.decision)).toEqual([operationA]);
    const { rows: traces } = await semeur.query("select details from public.audit_log where details->>'artisan_id'=$1", [artisan]);
    expect(traces.map((r) => r.details.operation_demandee)).toEqual([operationA]);
  });
});
