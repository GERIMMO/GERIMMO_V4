/**
 * L'essai gratuit passe de 14 jours à 2 mois (décision du porteur, 30/09/2026),
 * puis, le même jour, ces 2 mois deviennent une OFFRE DE LANCEMENT : toute
 * inscription jusqu'au 31/12/2026 inclus (date de Paris) reçoit 2 mois ; à
 * compter du 1er janvier 2027, l'essai ordinaire est d'un mois.
 *
 * La bascule du 1er janvier ne se simule pas en base (now() est l'heure de la
 * transaction) : la base de test est au 30/09/2026, on y vérifie les 2 mois et
 * on lit la règle dans la définition de la fonction. Côté TypeScript, les
 * fonctions prennent la date en paramètre : les deux côtés de la bascule sont
 * testés.
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
import {
  FIN_OFFRE_LANCEMENT,
  MOIS_ESSAI_LANCEMENT,
  MOIS_ESSAI_ORDINAIRE,
  badgeEssai,
  dateParis,
  dureeEssai,
  libelleOffreLancement,
  moisEssai,
  offreLancementActive,
} from "../src/lib/tarifs";
import { PARRAINAGE_PROGRAMME } from "../src/lib/parrainage";
import { CONDITIONS_DATE, CONDITIONS_VERSION } from "../src/lib/editeur";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const lire = (relatif: string) => readFileSync(path.resolve(__dirname, "../src", relatif), "utf8");

describe("offre de lancement : 2 mois jusqu'au 31/12/2026, puis 1 mois", () => {
  it("une seule source, dans tarifs.ts", () => {
    expect(FIN_OFFRE_LANCEMENT).toBe("2026-12-31");
    expect(MOIS_ESSAI_LANCEMENT).toBe(2);
    expect(MOIS_ESSAI_ORDINAIRE).toBe(1);
  });

  it("le 31/12/2026 : 2 mois ; le 01/01/2027 : 1 mois", () => {
    const dernierJour = new Date("2026-12-31T12:00:00+01:00");
    const premierJour = new Date("2027-01-01T12:00:00+01:00");
    expect(offreLancementActive(dernierJour)).toBe(true);
    expect(moisEssai(dernierJour)).toBe(2);
    expect(dureeEssai(dernierJour)).toBe("2 mois");
    expect(offreLancementActive(premierJour)).toBe(false);
    expect(moisEssai(premierJour)).toBe(1);
    expect(dureeEssai(premierJour)).toBe("1 mois");
  });

  it("la date qui compte est celle de Paris, pas celle d'UTC", () => {
    // 31/12 à 23 h 30 à Paris = 22 h 30 UTC : encore dans l'offre.
    const tard = new Date("2026-12-31T22:30:00Z");
    expect(dateParis(tard)).toBe("2026-12-31");
    expect(moisEssai(tard)).toBe(2);
    // 1er janvier à 0 h 30 à Paris = 31/12 à 23 h 30 UTC : l'offre est close.
    const minuit = new Date("2026-12-31T23:30:00Z");
    expect(dateParis(minuit)).toBe("2027-01-01");
    expect(moisEssai(minuit)).toBe(1);
  });

  it("aujourd'hui (30/09/2026) : l'offre est active, 2 mois", () => {
    const aujourdHui = new Date("2026-09-30T10:00:00+02:00");
    expect(moisEssai(aujourdHui)).toBe(2);
    expect(libelleOffreLancement(aujourdHui)).toBe(
      "Offre de lancement : 2 mois gratuits pour toute inscription jusqu'au 31 décembre 2026"
    );
    expect(badgeEssai(aujourdHui)).toBe("Offre de lancement — 2 mois gratuits jusqu'au 31/12/2026");
  });

  it("après l'échéance, plus d'offre : « 1 mois d'essai gratuit »", () => {
    const apres = new Date("2027-03-15T10:00:00+01:00");
    expect(libelleOffreLancement(apres)).toBeNull();
    expect(badgeEssai(apres)).toBe("1 mois d'essai gratuit");
  });

  it("le parrainage dit les deux durées, sans dépendre du jour", () => {
    expect(PARRAINAGE_PROGRAMME).toContain(
      "2 mois pour toute inscription jusqu'au 31 décembre 2026 (offre de lancement), 1 mois ensuite"
    );
  });
});

describe("les écrans annoncent l'essai du jour, et l'offre de lancement", () => {

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
    expect(lire("app/page.tsx")).toContain("Créer mon compte — {duree} d&apos;essai");
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

  it("les conditions (art. 8.2) couvrent les deux périodes, en texte fixe", () => {
    const cgu = lire("app/conditions/page.tsx").replace(/\s+/g, " ");
    expect(cgu).toContain(
      "essai gratuit de deux mois pour toute inscription jusqu&apos;au 31 décembre 2026 inclus</b> (offre de lancement)"
    );
    expect(cgu).toContain("d&apos;un mois pour toute inscription à compter du 1er janvier 2027</b>");
  });

  it("la FAQ du propriétaire dit les deux durées", () => {
    expect(lire("app/agence/[orgId]/faq/page.tsx")).toContain(
      "L'essai gratuit est sans carte — 2 mois pour toute inscription jusqu'au 31 décembre 2026 (offre de lancement), 1 mois ensuite"
    );
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

describe.skipIf(!DB_URL)("la base applique l'essai du jour : 2 mois pendant l'offre de lancement", () => {
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
      `select essai_fin::text as fin,
              (((now() at time zone 'Europe/Paris')::date) + interval '2 months')::date::text as attendu
         from public.organizations where id = $1`,
      [org]
    );
    return r;
  }

  it("la fin de l'essai ordinaire est aujourd'hui (Paris) + 2 mois calendaires, tant que l'offre court", async () => {
    const {
      rows: [r],
    } = await db.query<{ ok: boolean; paris: string }>(
      `select public.essai_ordinaire_fin()
                = (((now() at time zone 'Europe/Paris')::date) + interval '2 months')::date as ok,
              ((now() at time zone 'Europe/Paris')::date)::text as paris`
    );
    // La base de test vit en 2026 : l'offre de lancement s'applique.
    expect(r.paris <= "2026-12-31").toBe(true);
    expect(r.ok).toBe(true);
  });

  it("la bascule du 1er janvier 2027 est écrite dans la fonction, sur la date de Paris", async () => {
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
    expect(def).toContain("<= date '2026-12-31'");
    expect(def).toContain("interval '2 months'");
    expect(def).toContain("interval '1 month'");
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

  it("la même règle que moisEssai() : même bascule, même base de date", async () => {
    // Rejoue le CASE de la fonction sur deux dates figées, de part et d'autre.
    const {
      rows: [r],
    } = await db.query<{ avant: string; apres: string }>(
      `select (case when d1 <= date '2026-12-31' then d1 + interval '2 months' else d1 + interval '1 month' end)::date::text as avant,
              (case when d2 <= date '2026-12-31' then d2 + interval '2 months' else d2 + interval '1 month' end)::date::text as apres
         from (select date '2026-12-31' as d1, date '2027-01-01' as d2) x`
    );
    expect(r.avant).toBe("2027-02-28");
    expect(r.apres).toBe("2027-02-01");
    expect(moisEssai(new Date("2026-12-31T12:00:00+01:00"))).toBe(2);
    expect(moisEssai(new Date("2027-01-01T12:00:00+01:00"))).toBe(1);
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
