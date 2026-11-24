/**
 * Audit du 19/10 (lot mineurs, f ; migration 20261019121000) : ce que le rôle `anon` peut lire.
 *
 * Constat : `anon` lisait la table entière `demandes_devis` (nom, e-mail, téléphone et message des demandes de
 * contact ; aucune politique RLS pour lui, mais un droit sans raison d'être : l'écriture passe par le client de
 * service) et la table entière `publications`, dont les colonnes internes de la rédaction (motif de refus, erreurs
 * Facebook, auteur, dates de validation…). Désormais : rien sur `demandes_devis`, et sur `publications` les seules
 * colonnes que le site public lit (journal/[slug], journal, accueil, plan du site).
 *
 * Transaction annulée ; le rejeu de la migration et son retour se jouent dans un point de sauvegarde.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);

const NOM = "20261019121000_droits_anon_contact_articles_et_prospects";
const aller = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8")
  .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
  .replace(/^begin;$/m, "")
  .replace(/^commit;$/m, "");

/**
 * Ce que les pages publiques lisent (journal/[slug]/page.tsx, journal/page.tsx, page.tsx, sitemap.ts), filtres compris.
 * Reprise du lot D1 (24/11/2026, M4 ; migration 20261124110000) : la page publique d'un article lit aussi `origine`
 * (« ia » ou « manuel ») pour n'afficher la mention « Rédigé avec l’aide de l’IA » que sur un article d'origine « ia ».
 */
const PUBLIQUES = ["id", "slug", "titre", "chapo", "corps", "publie_le", "updated_at", "seo_description", "sources", "veine", "facebook_image_url", "statut", "origine"];
/** La migration du 24/11 qui ouvre `origine` : rejouée après celle du 19/10, dont le « revoke » de table referme toutes les colonnes. */
const allerOrigine = readFileSync("supabase/migrations/20261124110000_publications_origine.sql", "utf8");
const retourOrigine = readFileSync("supabase/retours-arriere/20261124110000_publications_origine.retour.sql", "utf8");

describe.skipIf(!DB)("Articles et formulaire de contact : ce que anon peut lire", () => {
  let db: Client;
  const anon = async () => {
    await db.query("select set_config('request.jwt.claims','{\"role\":\"anon\"}',true)");
    await db.query("set local role anon");
  };
  const postgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const echec = async (sql: string) => {
    await db.query("savepoint essai");
    try {
      await db.query(sql);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as { code?: string }).code ?? "";
    }
  };
  const colonnesLisibles = async (table: string) =>
    (
      await db.query(
        "select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and has_column_privilege('anon',$1::regclass,attname,'SELECT') order by attname",
        [table]
      )
    ).rows.map((r) => r.attname as string);
  const empreinte = async () =>
    (
      await db.query(`select c.relname, c.relacl::text as table_acl,
          (select string_agg(a.attname||':'||coalesce(a.attacl::text,'-'), ',' order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as colonnes_acl
        from pg_class c where c.oid in ('public.publications'::regclass,'public.demandes_devis'::regclass) order by 1`)
    ).rows;

  beforeAll(async () => {
    db = new Client({ connectionString: DB });
    await db.connect();
    await db.query("begin");
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await postgres();
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("anon : les seules colonnes publiques des articles, plus rien des demandes de contact ; authenticated inchangé", async () => {
    expect(await colonnesLisibles("public.publications")).toEqual([...PUBLIQUES].sort());
    expect((await db.query("select has_table_privilege('anon','public.publications','SELECT') t")).rows[0].t).toBe(false);
    expect(await colonnesLisibles("public.demandes_devis")).toEqual([]);
    expect((await db.query("select has_table_privilege('anon','public.demandes_devis','SELECT') t")).rows[0].t).toBe(false);
    expect((await db.query("select has_any_column_privilege('anon','public.demandes_devis','SELECT') t")).rows[0].t).toBe(false);
    // Les colonnes internes existent bien et sont fermées : une colonne ajoutée plus tard reste fermée tant qu'on ne l'ouvre pas.
    const toutes = (await db.query("select attname from pg_attribute where attrelid='public.publications'::regclass and attnum>0 and not attisdropped")).rows.map((r) => r.attname as string);
    for (const interne of ["refus_motif", "facebook_erreur", "auteur_account_id", "valide_par", "programmee_pour", "veille_source_id", "facebook_texte"]) {
      expect(toutes, interne).toContain(interne);
    }
    expect((await db.query("select has_table_privilege('authenticated','public.publications','SELECT') t")).rows[0].t).toBe(true);
  });

  it("avec le rôle anon : les lectures des pages publiques passent, une colonne interne et le formulaire de contact sont refusés", async () => {
    await anon();
    // journal/[slug]
    await db.query("select titre, chapo, corps, publie_le, seo_description, sources, veine, facebook_image_url, origine from public.publications where slug='un-article' and statut='publiee'");
    // journal et accueil
    await db.query("select id, titre, slug, chapo, publie_le, facebook_image_url from public.publications where statut='publiee' order by publie_le desc limit 50");
    // plan du site
    await db.query("select slug, publie_le, updated_at from public.publications where statut='publiee' and slug is not null order by publie_le desc limit 1000");
    expect(await echec("select refus_motif from public.publications")).toBe("42501");
    expect(await echec("select facebook_erreur, valide_par from public.publications")).toBe("42501");
    expect(await echec("select * from public.publications")).toBe("42501");
    expect(await echec("select id from public.demandes_devis")).toBe("42501");
    expect(await echec("select email from public.demandes_devis")).toBe("42501");
  });

  it("rejeu sans effet ; retour : la lecture de table entière revient ; réapplication identique", async () => {
    const attendu = await empreinte();
    // Les migrations se rejouent dans leur ordre : celle du 19/10, puis celle du 24/11 qui ajoute `origine` à la liste.
    await db.query(aller);
    await db.query(allerOrigine);
    expect(await empreinte()).toEqual(attendu);
    // Les retours se jouent dans l'ordre inverse : celui du 24/11 (il retire le droit sur `origine`), puis celui du 19/10.
    await db.query(retourOrigine);
    await db.query(retour);
    expect((await db.query("select has_table_privilege('anon','public.publications','SELECT') t")).rows[0].t).toBe(true);
    expect((await db.query("select has_table_privilege('anon','public.demandes_devis','SELECT') t")).rows[0].t).toBe(true);
    expect((await db.query("select count(*)::int n from pg_attribute where attrelid='public.publications'::regclass and attacl is not null")).rows[0].n).toBe(0);
    await db.query(aller);
    await db.query(allerOrigine);
    expect(await empreinte()).toEqual(attendu);
  });
});
