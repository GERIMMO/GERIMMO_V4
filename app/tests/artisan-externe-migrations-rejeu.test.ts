/**
 * Migrations 20261014310000 (numéro de facture unique, D24-B) et 20261014311000 (artisans exclus, D25-B) :
 * elles se rejouent sans effet, s'arrêtent sur une définition inattendue, et leurs retours arrière retirent
 * exactement ce qu'elles ajoutent.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin. Deux instructions sont écartées du
 * rejeu (voir `rejouable`) : elles demandent des verrous que d'autres fichiers de test, qui gardent une transaction
 * ouverte, feraient attendre. L'index est vérifié dans le catalogue, et le retour arrière joué à la main sur une copie
 * (voir supabase/retours-arriere/LISEZ-MOI.md).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const M310 = readFileSync("supabase/migrations/20261014310000_artisan_facture_numero_unique.sql", "utf8");
const M311 = readFileSync("supabase/migrations/20261014311000_artisan_exclusion_ecritures.sql", "utf8");
const R310 = readFileSync("supabase/retours-arriere/20261014310000_artisan_facture_numero_unique.retour.sql", "utf8");
const R311 = readFileSync("supabase/retours-arriere/20261014311000_artisan_exclusion_ecritures.retour.sql", "utf8");

/**
 * Le rejeu écarte les instructions qui touchent au-delà des objets du lot : l'index (verrou de table) et la fermeture
 * à anon, qui réécrit les droits de TOUTES les fonctions de `public` et ferait attendre les autres fichiers de test
 * (leur présence en fin de migration est vérifiée plus haut, leurs effets plus bas dans le catalogue).
 */
const rejouable = (sql: string) =>
  sql.replace(/create unique index if not exists[\s\S]*?;\n/, "").replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");

const EXTERNE = "public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)";
const LECTURE = "public.mon_activite_artisan_privee()";
const EXCLUSION = "public.artisan_exclusion_plateforme()";

describe("Lot artisan-externe — fichiers de migration et de retour arrière (sans base)", () => {
  it("les deux migrations se suivent dans le manifeste, après la vague précédente", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    const i = manifeste.indexOf("20261014310000_artisan_facture_numero_unique.sql");
    expect(i).toBeGreaterThan(0);
    expect(manifeste[i + 1]).toBe("20261014311000_artisan_exclusion_ecritures.sql");
    // Les fichiers du lot suivent la dernière migration de la vague 2 (20261014233000) : jamais devant.
    expect(manifeste.indexOf("20261014233000_photos_demande_devis_artisan.sql")).toBeLessThan(i);
    // Seules les migrations des lots suivants de la vague 3 (numéros plus grands) peuvent les suivre.
    for (const suivante of manifeste.slice(i + 2)) expect(suivante > "20261014311000").toBe(true);
  });

  it("chaque migration ferme les fonctions à anon et nomme son retour arrière", () => {
    for (const [sql, retour] of [[M310, "20261014310000_artisan_facture_numero_unique.retour.sql"], [M311, "20261014311000_artisan_exclusion_ecritures.retour.sql"]]) {
      expect(sql).toContain("select public.fermer_fonctions_a_anon();");
      expect(sql).toContain(`supabase/retours-arriere/${retour}`);
    }
  });

  it("les marques d'un retour arrière sont celles que la migration pose (et celles-là seulement)", () => {
    // ARC-04 : la migration ouvre à l'ancre et ferme sur « marque + saut de ligne + 3 espaces » ; le retour retire ce même bloc.
    expect(M310).toContain("-- >> Audit du 14/10 (ARC-04)");
    expect(M310).toMatch(/-- << Audit du 14\/10 \(ARC-04\)\n   \$nouveau\$ \|\| v_ancre\);/);
    expect(R310).toContain("v_debut text := '-- >> Audit du 14/10 (ARC-04)';");
    expect(R310).toContain("v_fin text := E'-- << Audit du 14/10 (ARC-04)\\n   ';");
    // ARC-08 : la migration ajoute « saut de ligne + 1 espace + marque » après l'ancre ; le retour retire de là à la marque de fin.
    expect(M311).toMatch(/v_ancre \|\| \$nouveau\$\n -- >> Audit du 14\/10 \(ARC-08\)/);
    expect(M311).toMatch(/ -- << Audit du 14\/10 \(ARC-08\)\$nouveau\$\);/);
    expect(R311).toContain("v_debut text := E'\\n -- >> Audit du 14/10 (ARC-08)';");
    expect(R311).toContain("v_fin text := '-- << Audit du 14/10 (ARC-08)';");
    expect(R311).toContain(",'exclusion',public.artisan_exclusion_plateforme()");
  });

  it.each([["310000", R310, "20261014310000"], ["311000", R311, "20261014311000"]])("le retour %s refuse de se jouer dans un lot, gère sa transaction et retire sa version", (_n, retour, version) => {
    expect(retour).toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
    expect(retour).toMatch(/^begin;$/m);
    expect(retour).toMatch(/^commit;$/m);
    expect(retour).toContain(`where version = '${version}'`);
    expect(retour).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("le retour de 311000 ne supprime la fonction de contrôle que si personne d'autre ne l'appelle", () => {
    expect(R311).toMatch(/RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : artisan_exclusion_plateforme\(\) est appelée par/);
    expect(R311).toMatch(/drop function if exists public\.artisan_exclusion_plateforme\(\);/);
    expect(R311.replace(/^\s*--.*$/gm, "")).not.toMatch(/cascade/i);
  });

  it("aucun retour ne réécrit ni ne supprime une donnée métier", () => {
    for (const retour of [R310, R311]) {
      const sansCommentaires = retour.replace(/^\s*--.*$/gm, "");
      expect(sansCommentaires).not.toMatch(/\b(truncate|update\s+public\.|insert\s+into)\b/i);
      // Seule suppression de ligne admise : la version de la migration dans l'historique.
      for (const m of sansCommentaires.matchAll(/delete\s+from\s+([\w.]+)/gi)) expect(m[1]).toBe("supabase_migrations.schema_migrations");
    }
  });
});

describe.skipIf(!DB_URL)("Lot artisan-externe — rejeu sur une base déjà migrée", () => {
  let db: Client;

  async function empreinte() {
    const etat: Record<string, string> = {};
    for (const signature of [EXTERNE, LECTURE, EXCLUSION]) {
      const { rows } = await db.query(
        "select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v from pg_proc p where p.oid = $1::text::regprocedure",
        [signature]
      );
      etat[signature] = rows[0].v;
    }
    const index = await db.query("select indexdef from pg_indexes where indexname = 'artisan_factures_externes_numero_normalise_key'");
    etat.index = index.rows.map((r) => r.indexdef).join("|");
    return etat;
  }
  const definition = async (signature: string) => (await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature])).rows[0].def as string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it("les fonctions portent la marque de leur correctif, et l'index existe", async () => {
    expect(await definition(EXTERNE)).toContain("-- >> Audit du 14/10 (ARC-04)");
    expect(await definition(EXTERNE)).toContain("-- >> Audit du 14/10 (ARC-08)");
    expect(await definition(LECTURE)).toContain("'exclusion',public.artisan_exclusion_plateforme()");
    expect((await empreinte()).index).toMatch(/CREATE UNIQUE INDEX artisan_factures_externes_numero_normalise_key .*\(artisan_id, lower\(btrim\(numero\)\)\)/);
  });

  it("les marques ne sont posées qu'une fois (pas de garde doublée)", async () => {
    const def = await definition(EXTERNE);
    expect(def.split("-- >> Audit du 14/10 (ARC-04)")).toHaveLength(2);
    expect(def.split("-- >> Audit du 14/10 (ARC-08)")).toHaveLength(2);
  });

  it("rejouées deux fois de suite, dans l'un ou l'autre ordre, elles ne changent rien", async () => {
    const avant = await empreinte();
    for (const migration of [M310, M311, M311, M310, M310, M311]) {
      await db.query(rejouable(migration));
      expect(await empreinte()).toEqual(avant);
    }
  });

  it("les droits restent explicites : ni anon ni public, authenticated exécute", async () => {
    for (const signature of [EXTERNE, LECTURE, EXCLUSION]) {
      const { rows } = await db.query(
        "select has_function_privilege('anon', $1::text::regprocedure, 'execute') as anon, has_function_privilege('authenticated', $1::text::regprocedure, 'execute') as connecte",
        [signature]
      );
      expect(rows[0], signature).toEqual({ anon: false, connecte: true });
    }
  });

  it("D24 : une définition inattendue l'arrête (l'ancre ne se devine pas)", async () => {
    await db.query(
      `create or replace function public.artisan_externe_ecrire(p_action text, p_id uuid, p_revision integer, p_donnees jsonb, p_cle uuid)
       returns uuid language plpgsql security definer set search_path to '' as $f$ begin return null; end $f$`
    );
    await expect(db.query(rejouable(M310))).rejects.toThrow(/ARC-04 : définition inattendue/);
  });

  it("D25 : une définition inattendue l'arrête, pour l'écriture comme pour la lecture", async () => {
    await db.query("savepoint avant_ecriture");
    await db.query(
      `create or replace function public.artisan_externe_ecrire(p_action text, p_id uuid, p_revision integer, p_donnees jsonb, p_cle uuid)
       returns uuid language plpgsql security definer set search_path to '' as $f$ begin return null; end $f$`
    );
    await expect(db.query(M311)).rejects.toThrow(/ARC-08 \(écriture\) : définition inattendue/);
    await db.query("rollback to savepoint avant_ecriture");
    await db.query(
      `create or replace function public.mon_activite_artisan_privee() returns jsonb
       language plpgsql stable security definer set search_path to '' as $f$ begin return '{}'::jsonb; end $f$`
    );
    await expect(db.query(M311)).rejects.toThrow(/ARC-08 \(lecture\) : définition inattendue/);
  });

  it("D24 : sur la définition d'avant le correctif, il pose le contrôle une seule fois ; le bloc est retiré pour retrouver l'avant", async () => {
    const avec = await definition(EXTERNE);
    const debut = avec.indexOf("-- >> Audit du 14/10 (ARC-04)");
    const fin = avec.indexOf("-- << Audit du 14/10 (ARC-04)\n   ") + "-- << Audit du 14/10 (ARC-04)\n   ".length;
    const sans = avec.slice(0, debut) + avec.slice(fin);
    expect(sans).not.toContain("ARC-04");
    await db.query(sans);
    expect(await definition(EXTERNE)).not.toContain("ARC-04");
    await db.query(rejouable(M310));
    expect(await definition(EXTERNE)).toBe(avec);
  });

  it("D25 : même chose pour la garde d'exclusion et la clé de lecture", async () => {
    const avecEcriture = await definition(EXTERNE);
    const debut = avecEcriture.indexOf("\n -- >> Audit du 14/10 (ARC-08)");
    const fin = avecEcriture.indexOf("-- << Audit du 14/10 (ARC-08)") + "-- << Audit du 14/10 (ARC-08)".length;
    await db.query(avecEcriture.slice(0, debut) + avecEcriture.slice(fin));
    const avecLecture = await definition(LECTURE);
    await db.query(avecLecture.replace(",'exclusion',public.artisan_exclusion_plateforme()", ""));
    expect(await definition(EXTERNE)).not.toContain("ARC-08");
    expect(await definition(LECTURE)).not.toContain("exclusion");
    await db.query(rejouable(M311));
    expect(await definition(EXTERNE)).toBe(avecEcriture);
    expect(await definition(LECTURE)).toBe(avecLecture);
  });
});
