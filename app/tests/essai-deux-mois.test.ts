/**
 * L'essai gratuit passe de 14 jours à 2 mois (décision du porteur, 30/09/2026).
 *
 * Deux moitiés :
 *  — la base APPLIQUE : une inscription en ligne et une ouverture depuis la
 *    console posent `essai_fin = aujourd'hui + 2 mois` (calendaires) ;
 *  — les écrans ANNONCENT « 2 mois », et seul l'essai a changé : le délai de
 *    rétractation du consommateur (art. L. 221-18 du code de la consommation)
 *    reste de quatorze jours.
 *
 * La moitié base nécessite SUPABASE_DB_URL (transaction annulée à la fin).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DUREE_ESSAI, MOIS_ESSAI } from "../src/lib/tarifs";
import { PARRAINAGE_EN_REVISION } from "../src/lib/parrainage";
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "../src/lib/editeur";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const lire = (relatif: string) => readFileSync(path.resolve(__dirname, "../src", relatif), "utf8");

describe("les écrans annoncent 2 mois d'essai", () => {
  it("une seule source : MOIS_ESSAI = 2, écrit « 2 mois »", () => {
    expect(MOIS_ESSAI).toBe(2);
    expect(DUREE_ESSAI).toBe("2 mois");
    expect(PARRAINAGE_EN_REVISION).toContain("l'essai gratuit est de 2 mois pour tous");
  });

  const pages = [
    "app/page.tsx",
    "app/tarifs/page.tsx",
    "app/inscription/page.tsx",
    "app/inscription/formulaire-inscription.tsx",
    "app/espaces/choix-espace.tsx",
    "app/agence/[orgId]/faq/page.tsx",
    "app/journal/[slug]/page.tsx",
    "app/admin/page.tsx",
    "app/conditions/page.tsx",
    "components/outils/coquille-outil.tsx",
    "lib/parrainage.ts",
    "lib/sante-service.ts",
  ];

  it.each(pages)("%s ne parle plus d'un essai de 14 jours", (fichier) => {
    const texte = lire(fichier);
    expect(texte).not.toMatch(/(essai|essayer)[^.\n]{0,40}\b14(\s|&nbsp;|\\u00a0)jours/i);
    expect(texte).not.toMatch(/\b14(\s|&nbsp;|\\u00a0)jours[^.\n]{0,20}(d'|d&apos;)essai/i);
    expect(texte).not.toMatch(/JOURS_ESSAI(_ORDINAIRE)?\b/);
  });

  it("l'accueil, l'inscription et les conditions disent « 2 mois »", () => {
    expect(lire("app/page.tsx")).toContain("Créer mon compte — 2 mois d&apos;essai");
    expect(lire("app/inscription/page.tsx")).toContain("2 mois d'essai, sans carte bancaire");
    expect(lire("app/conditions/page.tsx")).toContain("essai gratuit de 2 mois</b>");
    expect(lire("app/agence/[orgId]/faq/page.tsx")).toContain("L'essai gratuit de 2 mois est sans carte");
  });

  it("la rétractation du consommateur reste de quatorze jours", () => {
    const cgu = lire("app/conditions/page.tsx");
    expect(cgu).toContain("<b className=\"font-semibold\">quatorze jours</b> à compter de la");
    const mandat = lire("lib/documents/modeles/mandat-gestion.ts");
    expect(mandat).toContain("droit de rétractation de 14 jours");
    expect(mandat).toContain("<b>quatorze jours</b>");
  });

  it("le changement des conditions est daté : version du 30 septembre 2026", () => {
    expect(CONDITIONS_VERSION).toBe("2026-09-30");
    expect(CONDITIONS_DATE).toBe("30 septembre 2026");
  });
});

describe.skipIf(!DB_URL)("la base applique 2 mois d'essai", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  async function compte(meta: Record<string, string> = {}): Promise<string> {
    await db.query("reset role");
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
         'essai-' || gen_random_uuid() || '@test.local','x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, $1::jsonb, now(), now(),'','','','','')
       returning id`,
      [JSON.stringify(meta)]
    );
    return id;
  }

  async function agir(accountId: string) {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }),
    ]);
    await db.query("set local role authenticated");
  }

  async function essai(org: string): Promise<{ fin: string; attendu: string }> {
    await db.query("reset role");
    const {
      rows: [r],
    } = await db.query<{ fin: string; attendu: string }>(
      `select essai_fin::text as fin, (current_date + interval '2 months')::date::text as attendu
         from public.organizations where id = $1`,
      [org]
    );
    return r;
  }

  it("la fin de l'essai ordinaire est aujourd'hui + 2 mois calendaires", async () => {
    const {
      rows: [r],
    } = await db.query<{ ok: boolean }>(
      "select public.essai_ordinaire_fin() = (current_date + interval '2 months')::date as ok"
    );
    expect(r.ok).toBe(true);
  });

  it("une inscription en ligne (propriétaire direct) ouvre un essai de 2 mois", async () => {
    const id = await compte({ nom: "Essai", prenom: "Deux-Mois" });
    await agir(id);
    const {
      rows: [{ org }],
    } = await db.query<{ org: string }>("select public.initialiser_espace_proprietaire() as org");
    const { fin, attendu } = await essai(org);
    expect(fin).toBe(attendu);
    const {
      rows: [journal],
    } = await db.query<{ essai_fin: string }>(
      `select details->>'essai_fin' as essai_fin from public.audit_log
        where organization_id = $1 and action = 'inscription_proprietaire'`,
      [org]
    );
    expect(journal.essai_fin).toBe(attendu);
  });

  it("une agence ouverte depuis la console, sans durée précisée, a aussi 2 mois", async () => {
    const sa = await compte();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`,
      [sa]
    );
    await agir(sa);
    const {
      rows: [r],
    } = await db.query<{ organization_id: string }>(
      `select * from public.ouvrir_organisation('Agence Deux Mois','agence','deux-mois@exemple.fr')`
    );
    const { fin, attendu } = await essai(r.organization_id);
    expect(fin).toBe(attendu);

    // Une durée négociée, en jours, reste possible.
    await agir(sa);
    const {
      rows: [n],
    } = await db.query<{ organization_id: string }>(
      `select * from public.ouvrir_organisation('Agence Négociée','agence','negociee@exemple.fr',90,false)`
    );
    await db.query("reset role");
    const {
      rows: [{ jours }],
    } = await db.query<{ jours: number }>(
      "select essai_fin - current_date as jours from public.organizations where id = $1",
      [n.organization_id]
    );
    expect(Number(jours)).toBe(90);
  });
});
