/**
 * Fenêtre de veto du marketing (06/10/2026), règles de la base.
 *
 * Ce que ces tests garantissent : un texte « à compléter » ne peut jamais
 * être programmé ni publié (contrainte, pas seulement l'écran) ; seul un post
 * programmé et échu paraît ; un refus ou un report l'empêche pour toujours ;
 * la validation obligatoire bloque sans accord ; les gestes sont journalisés
 * et réservés au superviseur ; l'heure de Paris est calculée en base.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

// Un article publiable fait au moins 200 caractères (déclencheur existant).
const CORPS = "## Ce qui change\n\n" + "Un corps complet, sans trou, assez long pour passer le contrôle de longueur de la base. ".repeat(3);

describe.skipIf(!DB_URL)("Marketing — fenêtre de veto", () => {
  let db: Client;
  let superAdmin: string;

  beforeAll(async () => { db = new Client({ connectionString: DB_URL }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  beforeEach(async () => {
    await db.query("begin");
    const { rows: [{ id }] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated','sa-'||gen_random_uuid()||'@test.local','x', now(),'{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','') returning id`);
    superAdmin = id;
    await db.query(`insert into public.memberships (account_id, organization_id, role, status) values ($1, null, 'super_admin', 'active')`, [superAdmin]);
    await db.query(`update public.marketing_reglages set actif = true, publication_automatique = true, diffusion_version = 1, validation_obligatoire = false where singleton`);
  });

  const empreinte = () => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  /** Une erreur attendue, sans casser la transaction du test. */
  async function doitEchouer(sql: string, params: unknown[], motif: RegExp) {
    await db.query("savepoint attendu");
    await expect(db.query(sql, params)).rejects.toThrow(motif);
    await db.query("rollback to savepoint attendu");
  }
  async function enService() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await db.query("set local role service_role");
  }
  async function enSuperAdmin() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, true)`, [superAdmin]);
    await db.query("set local role authenticated");
  }
  async function brouillon(options: { corps?: string; image?: boolean; jour?: string } = {}) {
    await db.query("reset role");
    const jour = options.jour ?? "2026-10-09";
    const { rows: [{ id }] } = await db.query(
      `insert into public.publications (titre, slug, chapo, corps, statut, periode, marketing_jour, facebook_texte, image_empreinte, facebook_image_url)
       values ('Post de test', 'test-'||gen_random_uuid(), 'Chapo', $1, 'brouillon', 'marketing-auto-'||$2, $2::date, 'Texte Facebook', $3, $4) returning id`,
      [options.corps ?? CORPS, jour, options.image === false ? null : empreinte(), options.image === false ? null : `https://stockage.test/${jour}-${Math.random()}.jpg`]);
    return id as string;
  }

  it("calcule l'heure de Paris en base, hiver comme été", async () => {
    const { rows: [r] } = await db.query(`select public.instant_paris('2026-10-23'::date, 9)::text as ete, public.instant_paris('2026-10-26'::date, 9)::text as hiver`);
    expect(r.ete).toMatch(/^2026-10-23 07:00:00/);
    expect(r.hiver).toMatch(/^2026-10-26 08:00:00/);
  });

  it("un texte « [[à compléter » ne peut être ni programmé ni publié, même par SQL direct", async () => {
    const id = await brouillon({ corps: CORPS + " Il reste un [[à compléter : montant]] qui traîne." });
    await enService();
    await doitEchouer(`select public.programmer_publication_marketing($1, now() + interval '1 hour')`, [id], /incomplet/);
    await db.query("reset role");
    await doitEchouer(`update public.publications set statut = 'publiee' where id = $1`, [id], /publications_complete_avant_parution|compl/);
  });

  it("programme un brouillon illustré, le publie seulement une fois échu, puis réserve Facebook", async () => {
    const id = await brouillon();
    await enService();
    const { rows: [{ ok }] } = await db.query(`select public.programmer_publication_marketing($1, now() + interval '1 hour') as ok`, [id]);
    expect(ok).toBe(true);
    expect((await db.query(`select * from public.publications_marketing_echues()`)).rows).toHaveLength(0);
    expect((await db.query(`select public.publier_article_automatique($1) as ok`, [id])).rows[0].ok).toBe(false);
    await db.query("reset role");
    await db.query(`update public.publications set programmee_pour = now() - interval '1 minute' where id = $1`, [id]);
    await enService();
    expect((await db.query(`select * from public.publications_marketing_echues()`)).rows.map((r) => r.publications_marketing_echues)).toEqual([id]);
    expect((await db.query(`select public.publier_article_automatique($1) as ok`, [id])).rows[0].ok).toBe(true);
    expect((await db.query(`select statut, publie_le from public.publications where id = $1`, [id])).rows[0]).toMatchObject({ statut: "publiee" });
    expect((await db.query(`select public.reserver_diffusion_facebook($1, true) as ok`, [id])).rows[0].ok).toBe(true);
  });

  it("un post sans visuel ne se programme pas", async () => {
    const id = await brouillon({ image: false });
    await enService();
    expect((await db.query(`select public.programmer_publication_marketing($1, now() + interval '1 hour') as ok`, [id])).rows[0].ok).toBe(false);
  });

  it("le superviseur refuse ou reporte : le post ne part jamais ; chaque geste est journalisé", async () => {
    const refuse = await brouillon({ jour: "2026-10-09" });
    const reporte = await brouillon({ jour: "2026-10-13" });
    await enService();
    await db.query(`select public.programmer_publication_marketing($1, now() - interval '1 minute')`, [refuse]);
    await db.query(`select public.programmer_publication_marketing($1, now() - interval '1 minute')`, [reporte]);
    await enSuperAdmin();
    await doitEchouer(`select public.decider_publication_marketing($1, 'refuser', '')`, [refuse], /se motive/);
    await db.query(`select public.decider_publication_marketing($1, 'refuser', 'Hors sujet')`, [refuse]);
    await db.query(`select public.decider_publication_marketing($1, 'reporter', 'Trop tôt')`, [reporte]);
    await enService();
    expect((await db.query(`select * from public.publications_marketing_echues()`)).rows).toHaveLength(0);
    expect((await db.query(`select public.publier_article_automatique($1) as ok`, [refuse])).rows[0].ok).toBe(false);
    await db.query("reset role");
    const etats = await db.query(`select id, statut, refus_motif, reporte_motif from public.publications where id = any($1::uuid[]) order by marketing_jour`, [[refuse, reporte]]);
    expect(etats.rows[0]).toMatchObject({ statut: "refusee", refus_motif: "Hors sujet" });
    expect(etats.rows[1]).toMatchObject({ statut: "reportee", reporte_motif: "Trop tôt" });
    const journal = await db.query(`select action from public.audit_log where account_id = $1 and action like 'publication_marketing_%' order by created_at`, [superAdmin]);
    expect(journal.rows.map((r) => r.action)).toEqual(["publication_marketing_refuser", "publication_marketing_reporter"]);
    expect(Number((await db.query(`select count(*) from public.tech_log where evenement = 'decision_marketing'`)).rows[0].count)).toBe(2);
  });

  it("validation obligatoire : rien ne part sans accord ; « publier maintenant » avance l'heure", async () => {
    await db.query(`update public.marketing_reglages set validation_obligatoire = true where singleton`);
    const id = await brouillon();
    await enService();
    await db.query(`select public.programmer_publication_marketing($1, now() - interval '1 minute')`, [id]);
    expect((await db.query(`select public.publier_article_automatique($1) as ok`, [id])).rows[0].ok).toBe(false);
    await enSuperAdmin();
    await db.query(`select public.decider_publication_marketing($1, 'valider', null)`, [id]);
    await enService();
    expect((await db.query(`select public.publier_article_automatique($1) as ok`, [id])).rows[0].ok).toBe(true);

    const futur = await brouillon({ jour: "2026-10-13" });
    await enService();
    await db.query(`select public.programmer_publication_marketing($1, now() + interval '3 hours')`, [futur]);
    await enSuperAdmin();
    await db.query(`select public.decider_publication_marketing($1, 'publier_maintenant', null)`, [futur]);
    await enService();
    expect((await db.query(`select public.publier_article_automatique($1, true) as ok`, [futur])).rows[0].ok).toBe(true);
  });

  it("les gestes de veto sont réservés au superviseur ; le jeton de déclenchement, au traitement", async () => {
    const id = await brouillon();
    await enService();
    await db.query(`select public.programmer_publication_marketing($1, now() + interval '1 hour')`, [id]);
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await db.query("set local role anon");
    await doitEchouer(`select public.decider_publication_marketing($1, 'refuser', 'x')`, [id], /./);
    await doitEchouer(`select public.jeton_declencheur_marketing()`, [], /./);
    await enService();
    const { rows: [{ jeton }] } = await db.query(`select public.jeton_declencheur_marketing() as jeton`);
    expect(jeton).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la préparation du soir vise le lendemain si c'est un jour de publication", async () => {
    // Une heure de parution hors de la fenêtre de rattrapage du jour (de 12 h
    // avant à 3 h après), quelle que soit l'heure à laquelle le test tourne.
    const { rows: [{ h }] } = await db.query(`select ((extract(hour from now() at time zone 'Europe/Paris')::int - 6) + 24) % 24 as h`);
    await db.query(`update public.marketing_reglages set jours_semaine = array[1,2,3,4,5]::smallint[], publications_semaine = 5, heure_preparation_paris = 0, heure_paris = $1 where singleton`, [h]);
    await db.query(`delete from public.publications where marketing_jour is not null`);
    await enService();
    const { rows } = await db.query(`select jour::text, rang, parution::text, rattrapage from public.cible_preparation_marketing()`);
    expect(rows).toHaveLength(1);
    expect(rows[0].rattrapage).toBe(false);
    expect(rows[0].jour).toBe((await db.query(`select ((now() at time zone 'Europe/Paris')::date + 1)::text as j`)).rows[0].j);
  });
});
