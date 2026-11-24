import { verifierBaseDeTest } from "./garde-base";
import { QUESTIONS } from "@/app/agence/[orgId]/faq/questions";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { badgeEssai, dureeEssai } from "../src/lib/tarifs";
import { PARRAINAGE_PROGRAMME } from "../src/lib/parrainage";
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "../src/lib/editeur";
import { versionDeclaree } from "../src/lib/conditions-versions";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const lire = (relatif: string) => readFileSync(path.resolve(__dirname, "../src", relatif), "utf8");

describe("deux mois gratuits pour toute nouvelle inscription", () => {
  it("annonce la durée permanente", () => {
    expect(dureeEssai()).toBe("2 mois");
    expect(badgeEssai()).toBe("2 mois d'essai gratuit");
    expect(PARRAINAGE_PROGRAMME).toContain("2 mois pour toute inscription");
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

  it("l'accueil, l'inscription et les tarifs lisent la durée au rendu, badge compris", () => {
    for (const f of ["app/page.tsx", "app/inscription/page.tsx", "app/tarifs/page.tsx"]) {
      const texte = lire(f);
      expect(texte, f).toContain("dureeEssai()");
      expect(texte, f).toContain("{badgeEssai()}");
      expect(texte, f).toContain("export function generateMetadata()");
      expect(texte, f).not.toMatch(/export const metadata\b/);
    }
    expect(lire("app/page.tsx")).toContain("Commencez par {duree} d’essai gratuit, sans carte bancaire.");
    expect(lire("app/inscription/page.tsx")).toContain("mention={`${duree} d'essai, sans carte bancaire`}");
    expect(lire("components/outils/coquille-outil.tsx")).toContain("{badgeEssai()}");
  });

  const revalidees = [
    "app/page.tsx",
    "app/tarifs/page.tsx",
    "app/inscription/page.tsx",
    "app/journal/[slug]/page.tsx",
    "app/outils/page.tsx",
    "app/outils/calcul-irl/page.tsx",
    "app/outils/comparateur-gli-visale/page.tsx",
    "app/outils/quittance-de-loyer/page.tsx",
    "app/outils/rentabilite-locative/page.tsx",
    "app/outils/simulateur-lmnp/page.tsx",
  ];
  it.each(revalidees)("%s ne fige pas la durée au build (revalidate = 3600)", (f) => {
    expect(lire(f)).toMatch(/^export const revalidate = 3600;$/m);
  });

  it("les conditions (art. 8.2) annoncent deux mois sans reconduction, en texte fixe", () => {
    const cgu = lire("app/conditions/page.tsx").replace(/\s+/g, " ");
    expect(cgu).toContain("essai gratuit de deux mois pour toute nouvelle inscription</b>");
    expect(cgu).toContain("Aucun abonnement ne démarre sans souscription explicite.");
  });

  it("la FAQ du propriétaire annonce deux mois", () => {
    expect(QUESTIONS.find((question) => question.question === "Combien ça coûte ?")?.reponse).toContain(
      "L'essai gratuit est sans carte — 2 mois pour toute inscription"
    );
  });

  it("la rétractation du consommateur reste de quatorze jours", () => {
    const cgu = lire("app/conditions/page.tsx");
    // V1 (plan de conformité du 23/10, article 8.10) : le délai court à compter de la conclusion de l'abonnement.
    expect(cgu.replace(/\s+/g, " ")).toContain("<b className=\"font-semibold\">quatorze jours</b> pour se rétracter de l&apos;abonnement payant");
    expect(cgu.replace(/\s+/g, " ")).toContain("Le délai court à compter de la conclusion de l&apos;abonnement (article 3.2)");
    const mandat = lire("lib/documents/modeles/mandat-gestion.ts");
    expect(mandat).toContain("droit de rétractation de 14 jours");
    expect(mandat).toContain("<b>quatorze jours</b>");
  });

  it("le changement des conditions est daté : V1 du 24 octobre 2026, la version du 30 septembre 2026 gardée dans l'historique", () => {
    // L'essai de deux mois (article 8.2) est entré dans la version du 30 septembre 2026 ; la V1 (plan de conformité du
    // 23/10) le reprend tel quel. La version du 30/09 reste déclarée dans l'historique de la garde d'empreinte.
    // Lot T4 (24/11/2026) : la version en vigueur est celle du 24 novembre 2026 ; l'article 8.2 n'y change pas, et la
    // version du 15 novembre 2026 (deux mois permanents) reste déclarée dans l'historique.
    expect(CONDITIONS_VERSION).toBe("2026-11-24");
    expect(CONDITIONS_DATE).toBe("24 novembre 2026");
    expect(versionDeclaree("conditions_clients", "2026-11-15")?.resume_modifications).toContain("Deux mois calendaires gratuits");
    const v = versionDeclaree("conditions_clients", "2026-09-30");
    expect(v?.date_effet).toBe("2026-09-30");
    expect(v?.resume_modifications).toContain("2 mois");
  });
});

describe.skipIf(!DB_URL)("la base applique l'essai permanent de deux mois", () => {
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
      [JSON.stringify({ adresse: "3 rue du Test", code_postal: "69003", ville: "Lyon", ...meta })]
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
      `select essai_fin::text as fin,
              (((now() at time zone 'Europe/Paris')::date) + interval '2 months')::date::text as attendu
         from public.organizations where id = $1`,
      [org]
    );
    return r;
  }

  it("la fin de l'essai ordinaire est aujourd'hui (Paris) + 2 mois calendaires", async () => {
    const {
      rows: [r],
    } = await db.query<{ ok: boolean; paris: string }>(
      `select public.essai_ordinaire_fin()
                = (((now() at time zone 'Europe/Paris')::date) + interval '2 months')::date as ok,
              ((now() at time zone 'Europe/Paris')::date)::text as paris`
    );
    expect(r.ok).toBe(true);
  });

  it("la fonction conserve la date de Paris, sa stabilité et ses droits", async () => {
    const {
      rows: [r],
    } = await db.query<{ def: string; volatilite: string; securite: boolean }>(
      `select pg_get_functiondef('public.essai_ordinaire_fin()'::regprocedure) as def,
              provolatile::text as volatilite, prosecdef as securite
         from pg_proc where oid = 'public.essai_ordinaire_fin()'::regprocedure`
    );
    const def = r.def.replace(/\s+/g, " ");
    expect(def).toContain("RETURNS date");
    // Fonction SQL : Postgres garde le texte tel qu'écrit dans la migration.
    expect(def).toContain("interval '2 months'");
    expect(def).toContain("(now() at time zone 'Europe/Paris')::date");
    expect(def).not.toMatch(/current_date/i);
    expect(r.volatilite).toBe("s");
    // Les droits de 20260930100000 sont conservés.
    const {
      rows: [d],
    } = await db.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'public.essai_ordinaire_fin()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.essai_ordinaire_fin()', 'execute') as auth`
    );
    expect(d).toEqual({ anon: false, auth: true });
  });

  it.each([
    ["2026-12-31T22:30:00Z", "2027-02-28"],
    ["2026-12-31T23:30:00Z", "2027-03-01"],
    ["2027-12-31T12:00:00Z", "2028-02-29"],
    ["2030-01-31T12:00:00Z", "2030-03-31"],
  ])("calcule l’échéance au jour de Paris pour %s", async (instant, fin) => {
    const { rows: [fonction] } = await db.query<{ prosrc: string }>(
      "select prosrc from pg_proc where oid = 'public.essai_ordinaire_fin()'::regprocedure"
    );
    const calcul = fonction.prosrc.replace("now()", "$1::timestamptz");
    const { rows: [resultat] } = await db.query(
      `select (${calcul})::text as fin`, [instant]
    );
    expect(resultat.fin).toBe(fin);
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

  it("ouvre onze espaces distincts sans souscription ni client Stripe", async () => {
    const organisations: string[] = [];
    for (let rang = 1; rang <= 11; rang++) {
      await agir(await compte({ nom: "Fictif", prenom: `Pilote ${rang}` }));
      const { rows: [espace] } = await db.query("select public.initialiser_espace_proprietaire() as id");
      organisations.push(espace.id);
      const { fin, attendu } = await essai(espace.id);
      expect(fin).toBe(attendu);
    }
    expect(new Set(organisations).size).toBe(11);
    const contrats = await db.query(
      "select organization_id from public.abonnements where organization_id = any($1::uuid[]) and (stripe_customer_id is not null or stripe_subscription_id is not null)",
      [organisations]
    );
    expect(contrats.rows).toHaveLength(0);
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
      `select * from public.ouvrir_organisation('Agence Deux Mois','agence','deux-mois@exemple.fr',p_adresse=>'3 rue du Test',p_code_postal=>'69003',p_ville=>'Lyon')`
    );
    const { fin, attendu } = await essai(r.organization_id);
    expect(fin).toBe(attendu);

    // Une durée négociée, en jours, reste possible.
    await agir(sa);
    const {
      rows: [n],
    } = await db.query<{ organization_id: string }>(
      `select * from public.ouvrir_organisation('Agence Négociée','agence','negociee@exemple.fr',90,false,'3 rue du Test','69003','Lyon')`
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
