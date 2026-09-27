/**
 * Audit console du 27/09 — les corrections en base, vérifiées sur une base de
 * test (transaction annulée à la fin) :
 * - majeur 1 : une décision du point du matin suit l'état réel de sa source,
 *   et `decider_veille` ne diffuse jamais une information écartée ;
 * - majeurs 5 et 6 : chaque geste de la console laisse sa ligne d'audit, une
 *   visite de fiche n'en écrit qu'une, une demande déjà traitée se dit ;
 * - majeur 8 : les gestes de contrôle d'une organisation, gardés et journalisés.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function compte(db: Client, superAdmin = false) {
  const { rows: [u] } = await db.query(
    `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), 'authenticated', 'authenticated', 'console-' || gen_random_uuid() || '@test.local', 'x', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()) returning id`
  );
  if (superAdmin) await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')", [u.id]);
  return u.id as string;
}

async function agir(db: Client, utilisateur: string, aal = "aal2") {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal',$2::text)::text, true)`, [utilisateur, aal]);
  await db.query("set local role authenticated");
}

async function essai(db: Client, sql: string, params: unknown[] = []) {
  await db.query("savepoint essai");
  try {
    const r = await db.query(sql, params);
    await db.query("release savepoint essai");
    return r;
  } catch (e) {
    await db.query("rollback to savepoint essai");
    throw e;
  }
}

const audit = async (db: Client, action: string, sa: string) =>
  (await db.query("select details from public.audit_log where action=$1 and account_id=$2 order by created_at", [action, sa])).rows.map((r) => r.details);

describe.skipIf(!DB_URL)("Console de supervision — corrections en base (audit 27/09)", () => {
  let db: Client;
  let sa: string;
  let autre: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    sa = await compte(db, true);
    autre = await compte(db);
  });
  beforeEach(async () => { await db.query("reset role"); await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  async function veilleEtPoint() {
    const { rows: [v] } = await db.query(
      `insert into public.regulatory_watch (source_url, titre, source_nom, statut, etude, analyse_le)
       values ('https://www.service-public.gouv.fr/test/' || gen_random_uuid(), 'Encadrement des loyers', 'Service Public', 'a_examiner',
               '{"resume":"Un résumé suffisamment long pour être diffusé.","action":"Vérifier les baux.","publics":["bailleur"]}', now()) returning id`
    );
    const { rows: [p] } = await db.query(
      "insert into public.points_du_matin (jour, equipe, contenu) values (current_date + 1000 + (random()*1000)::int, 'conformite', '{}') returning id"
    );
    const { rows: [d] } = await db.query(
      `insert into public.decisions_du_matin (point_id, cle, titre, pourquoi, source, source_id, gestes)
       values ($1, 'veille:' || $2::text, 'Diffuser « Encadrement des loyers »', '', 'veille', $2::uuid, '{"validation":true,"refus":true}') returning id`,
      [p.id, v.id]
    );
    return { veille: v.id as string, point: p.id as string, decision: d.id as string };
  }

  it("une veille écartée sur son écran passe la décision du point en « sans objet », et ne se diffuse plus", async () => {
    const { veille, decision } = await veilleEtPoint();
    await agir(db, sa);
    // L'écran de la veille écarte (onglet « À examiner »).
    await db.query("select public.decider_veille($1,false,'','',array[]::text[],null,'a_examiner')", [veille]);
    await db.query("reset role");
    const { rows: [d] } = await db.query("select statut, motif from public.decisions_du_matin where id=$1", [decision]);
    expect(d.statut).toBe("sans_objet");
    expect(d.motif).toMatch(/Tranchée sur son écran/);
    // « Valider » depuis le point, préparé avant : la base relit l'état courant et refuse.
    await agir(db, sa);
    await expect(essai(db, "select public.decider_veille($1,true,'Un résumé suffisamment long pour être diffusé.','Vérifier les baux.',array['bailleur'],null,'a_examiner')", [veille]))
      .rejects.toThrow(/changé d’état/);
    await db.query("reset role");
    const { rows: [v] } = await db.query("select statut from public.regulatory_watch where id=$1", [veille]);
    expect(v.statut).toBe("ecarte");
    expect((await audit(db, "veille_ecartee", sa)).map((x) => x.avant)).toEqual(["a_examiner"]);
  });

  it("une décision appliquée depuis le point garde sa trace « validée »", async () => {
    const { veille, decision } = await veilleEtPoint();
    await agir(db, sa);
    await db.query("select public.decider_veille($1,true,'Un résumé suffisamment long pour être diffusé.','Vérifier les baux.',array['bailleur'],null,'a_examiner')", [veille]);
    await db.query("select public.decider_point_du_matin($1,true,null)", [decision]);
    await db.query("reset role");
    const { rows: [d] } = await db.query("select statut, decide_par from public.decisions_du_matin where id=$1", [decision]);
    expect(d).toEqual({ statut: "validee", decide_par: sa });
  });

  it("le réassemblage rouvre une décision « sans objet » dont la source attend de nouveau", async () => {
    const { veille, point, decision } = await veilleEtPoint();
    await db.query("update public.regulatory_watch set statut='ecarte' where id=$1", [veille]);
    await db.query("update public.regulatory_watch set statut='a_examiner' where id=$1", [veille]);
    const { rows: [p] } = await db.query("select jour from public.points_du_matin where id=$1", [point]);
    await agir(db, sa);
    await db.query("select public.enregistrer_point_du_matin($1,'conformite','{}',$2)", [p.jour, JSON.stringify([{ cle: `veille:${veille}`, titre: "Diffuser « Encadrement des loyers »", source: "veille", source_id: veille }])]);
    await db.query("reset role");
    const { rows: [d] } = await db.query("select statut from public.decisions_du_matin where id=$1", [decision]);
    expect(d.statut).toBe("en_attente");
  });

  it("pause et reprise d'une mission sont journalisées ; un compte ordinaire est refusé", async () => {
    await agir(db, autre);
    await expect(essai(db, "select public.regler_mission('territoire', false)")).rejects.toThrow(/réservé/);
    await agir(db, sa, "aal1");
    await expect(essai(db, "select public.regler_mission('territoire', false)")).rejects.toThrow(/réservé/);
    await agir(db, sa);
    await db.query("select public.regler_mission('territoire', false)");
    await db.query("select public.regler_mission('territoire', true)");
    await db.query("reset role");
    expect(await audit(db, "mission_en_pause", sa)).toEqual([{ mission: "territoire", avant_active: true }]);
    expect(await audit(db, "mission_reprise", sa)).toEqual([{ mission: "territoire", avant_active: false }]);
  });

  it("une demande commerciale traitée se journalise, et se dit déjà traitée au second clic", async () => {
    const { rows: [dd] } = await db.query("insert into public.demandes_devis (nom, email) values ('Agence test', 'console-' || gen_random_uuid() || '@test.local') returning id");
    await agir(db, autre);
    await expect(essai(db, "select public.demande_devis_traitee($1)", [dd.id])).rejects.toThrow(/super admin/);
    await agir(db, sa);
    const { rows: [premier] } = await db.query("select public.demande_devis_traitee($1) as ok", [dd.id]);
    const { rows: [second] } = await db.query("select public.demande_devis_traitee($1) as ok", [dd.id]);
    expect([premier.ok, second.ok]).toEqual([true, false]);
    await expect(essai(db, "select public.demande_devis_traitee(gen_random_uuid())")).rejects.toThrow(/introuvable/);
    await db.query("reset role");
    expect(await audit(db, "demande_commerciale_traitee", sa)).toEqual([{ demande: dd.id }]);
  });

  it("journaliser_supervision : au nom du connecté, code contrôlé, fermé aux autres comptes et à anon", async () => {
    const { rows: [acces] } = await db.query("select has_function_privilege('anon','public.journaliser_supervision(text,uuid,jsonb)','execute') as ok");
    expect(acces.ok).toBe(false);
    await agir(db, autre);
    await expect(essai(db, "select public.journaliser_supervision('mission_lancee', null, '{}')")).rejects.toThrow(/réservé/);
    await agir(db, sa);
    await expect(essai(db, "select public.journaliser_supervision('Code Libre; drop', null, '{}')")).rejects.toThrow(/inconnue/);
    await db.query(`select public.journaliser_supervision('mission_lancee', null, '{"mission":"veille"}')`);
    await db.query("reset role");
    expect(await audit(db, "mission_lancee", sa)).toEqual([{ mission: "veille" }]);
  });

  it("une visite de fiche organisation n'écrit qu'une ligne par minute", async () => {
    const { rows: [o] } = await db.query("insert into public.organizations (name) values ('Agence console') returning id");
    await agir(db, sa);
    for (let i = 0; i < 3; i++) await db.query("select public.log_sa_access($1,'consultation_organisation')", [o.id]);
    await db.query("select public.log_sa_access($1,'traversee_espace')", [o.id]);
    await db.query("select public.log_sa_access($1,'traversee_espace')", [o.id]);
    await db.query("reset role");
    const { rows } = await db.query("select action, count(*)::int n from public.audit_log where organization_id=$1 group by action order by action", [o.id]);
    expect(rows).toEqual([{ action: "consultation_organisation", n: 1 }, { action: "traversee_espace", n: 2 }]);
  });

  it("suspendre, prolonger l'essai, archiver, réactiver : gardés, motivés, journalisés", async () => {
    const { rows: [o] } = await db.query("insert into public.organizations (name, status, essai_fin) values ('Agence contrôle', 'essai', current_date + 3) returning id");
    await agir(db, autre);
    await expect(essai(db, "select public.controler_organisation($1,'suspendre',null,'Impayé constaté')", [o.id])).rejects.toThrow(/supervision/);
    await agir(db, sa);
    await expect(essai(db, "select public.controler_organisation($1,'suspendre',null,'')", [o.id])).rejects.toThrow(/Motivez/);
    await expect(essai(db, "select public.controler_organisation($1,'prolonger_essai',120,null)", [o.id])).rejects.toThrow(/1 à 90/);
    expect((await db.query("select public.controler_organisation($1,'suspendre',null,'Impayé constaté') as s", [o.id])).rows[0].s).toBe("suspendue");
    expect((await db.query("select public.controler_organisation($1,'reactiver',null,null) as s", [o.id])).rows[0].s).toBe("essai");
    expect((await db.query("select public.controler_organisation($1,'prolonger_essai',10,null) as s", [o.id])).rows[0].s).toBe("essai");
    expect((await db.query("select public.controler_organisation($1,'archiver',null,'Fin de contrat') as s", [o.id])).rows[0].s).toBe("archivee");
    await expect(essai(db, "select public.controler_organisation($1,'archiver',null,'Encore')", [o.id])).rejects.toThrow(/déjà archivée/);
    await db.query("reset role");
    const { rows: [org] } = await db.query("select status, essai_fin - current_date as jours from public.organizations where id=$1", [o.id]);
    expect(org).toEqual({ status: "archivee", jours: 13 });
    const { rows: traces } = await db.query("select action from public.audit_log where organization_id=$1 and account_id=$2 order by created_at", [o.id, sa]);
    expect(traces.map((t) => t.action)).toEqual(["organisation_suspendue", "organisation_reactivee", "essai_prolonge", "organisation_archivee"]);
  });

  it("aucune nouvelle fonction de la console n'est ouverte à anon ; l'assurance artisan reste interne", async () => {
    const { rows } = await db.query(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as connecte
      from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('journaliser_supervision','controler_organisation','artisan_assurance_deposee','point_du_matin_source_changee','decider_veille') order by 1`);
    expect(rows.every((r) => r.anon === false)).toBe(true);
    expect(rows.find((r) => r.proname === "artisan_assurance_deposee")!.connecte).toBe(false);
    expect(rows.find((r) => r.proname === "point_du_matin_source_changee")!.connecte).toBe(false);
  });
});
