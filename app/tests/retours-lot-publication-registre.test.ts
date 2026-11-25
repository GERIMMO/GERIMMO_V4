/**
 * Essai de publication « retours » du 25/11/2026, constat RET-01 (plan de publication, § 5.4) : chacun des 52 retours du
 * lot publié avec la version préparée — les migrations postérieures à 20261120200000, dernière version en production —
 * retire SA PROPRE version du registre `supabase_migrations.schema_migrations`.
 *
 * Avant : onze d'entre eux (20261125101500, 103000, 104000, 105000, 106000, 111000, 140000, 151000, 152000, 153000 et
 * 154000) la laissaient. Après la chaîne complète, le chantier « Migrations Supabase » refusait de réappliquer le lot
 * (« ✗ 20261125101500_conge_textes_officiels_t1.sql : la version 20261125101500 est déjà enregistrée en base. ») tant que
 * ces onze lignes n'étaient pas supprimées à la main, alors que le LISEZ-MOI (« Procédure », étape 4) annonçait que les
 * scripts retirent eux-mêmes leurs versions.
 *
 *  — sans base : chaque fichier supprime sa version et elle seule, une seule fois ; pour les onze fichiers complétés, la
 *    suppression est dans la DERNIÈRE instruction du fichier : joué par `psql -v ON_ERROR_STOP=1 -f`, un fichier arrêté
 *    par une erreur garde sa version (il n'a pas tout défait) ; un fichier d'un seul bloc passe ou s'arrête d'un tenant,
 *    suppression comprise. Le LISEZ-MOI le dit et donne la requête de contrôle ;
 *  — sur base : la chaîne des 52 retours, dans l'ordre du plan (inverse du manifeste), jouée dans une transaction annulée
 *    à la fin, ne laisse aucune des 52 versions au registre (versions écrites comme le chantier les écrit : 14 chiffres).
 *
 * Nécessite SUPABASE_DB_URL pour le second bloc. La chaîne rejoue du DDL sur tout le schéma : le fichier tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
if (url && (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.includes("ci_"))) {
  throw new Error("Une base CI locale fictive est obligatoire.");
}

/** Dernière version appliquée en production (81740dec, publication du 21/11/2026). */
const DERNIERE_EN_PRODUCTION = "20261120200000";
const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
/** Le lot, dans l'ordre du manifeste (celui du champ `fichiers` de migrations.yml). */
const LOT = manifeste.filter((f) => f.slice(0, 14) > DERNIERE_EN_PRODUCTION).map((f) => f.replace(/\.sql$/, ""));
/** L'ordre des retours : l'inverse exact du manifeste (plan de publication, § 5.4). */
const CHAINE = [...LOT].reverse();
const retour = (nom: string) => readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");
const sansCommentaires = (sql: string) => sql.replace(/--.*$/gm, "");
const SUPPRESSION = /delete\s+from\s+supabase_migrations\.schema_migrations\b[^;]*;/gi;
const VERSION_SUPPRIMEE = /^delete\s+from\s+supabase_migrations\.schema_migrations\s+where\s+(?:version|left\(version,\s*14\))\s*=\s*'(\d{14})'\s*;$/i;
/** Les onze retours complétés le 25/11 (RET-01). */
const COMPLETES = ["20261125101500", "20261125103000", "20261125104000", "20261125105000", "20261125106000", "20261125111000", "20261125140000", "20261125151000", "20261125152000", "20261125153000", "20261125154000"];

/** Les instructions de premier niveau d'un fichier SQL : coupe aux `;` hors commentaires, chaînes et corps `$tag$…$tag$`. */
function instructions(sql: string): string[] {
  const resultat: string[] = [];
  let courante = "";
  let i = 0;
  while (i < sql.length) {
    const reste = sql.slice(i);
    if (reste.startsWith("--")) {
      const fin = sql.indexOf("\n", i);
      i = fin < 0 ? sql.length : fin;
      continue;
    }
    if (sql[i] === "'") {
      const fin = /^'(?:[^']|'')*'/.exec(reste);
      if (!fin) throw new Error("chaîne non fermée");
      courante += fin[0];
      i += fin[0].length;
      continue;
    }
    const balise = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(reste);
    if (balise) {
      const fin = sql.indexOf(balise[0], i + balise[0].length);
      if (fin < 0) throw new Error(`corps ${balise[0]} non fermé`);
      courante += sql.slice(i, fin + balise[0].length);
      i = fin + balise[0].length;
      continue;
    }
    if (sql[i] === ";") {
      if (courante.trim()) resultat.push(courante.trim());
      courante = "";
      i += 1;
      continue;
    }
    courante += sql[i];
    i += 1;
  }
  if (courante.trim()) resultat.push(courante.trim());
  return resultat;
}

describe("RET-01 — les 52 retours du lot retirent leur version du registre (sans base)", () => {
  it("le lot compte 52 migrations, de 20261122090000 à 20261125154000, chacune avec son retour", () => {
    expect(LOT).toHaveLength(52);
    expect(LOT[0]).toBe("20261122090000_bail_repris_dpe_g_et_edl_entree");
    expect(LOT[51]).toBe("20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature");
    for (const nom of LOT) expect(() => retour(nom), nom).not.toThrow();
  });

  it.each(CHAINE)("%s : supprime sa version et elle seule, une seule fois", (nom) => {
    const suppressions = [...sansCommentaires(retour(nom)).matchAll(SUPPRESSION)].map((m) => m[0].replace(/\s+/g, " ").trim());
    expect(suppressions, nom).toHaveLength(1);
    expect(suppressions[0].match(VERSION_SUPPRIMEE)?.[1], nom).toBe(nom.slice(0, 14));
  });

  it.each(CHAINE.filter((nom) => COMPLETES.includes(nom.slice(0, 14))))("%s : la suppression est dans la dernière instruction du fichier", (nom) => {
    const liste = instructions(retour(nom));
    const avec = liste.map((instruction, rang) => (/delete\s+from\s+supabase_migrations\.schema_migrations/i.test(instruction) ? rang : -1)).filter((rang) => rang >= 0);
    expect(avec, nom).toEqual([liste.length - 1]);
  });

  it("le LISEZ-MOI (« Procédure », étape 4) le dit pour le lot et donne la requête de contrôle", () => {
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    const procedure = lisezMoi.slice(lisezMoi.indexOf("## Procédure"), lisezMoi.indexOf("## Avant la première exécution"));
    expect(procedure).toContain("Chacun des 52 retours du lot à publier");
    expect(procedure).toContain("retire de même **sa propre** version du registre");
    expect(procedure).toContain(`select version from supabase_migrations.schema_migrations where version > '${DERNIERE_EN_PRODUCTION}' order by version;`);
  });
});

describe.skipIf(!url)("RET-01 — la chaîne des 52 retours ne laisse aucune version au registre (avec base)", () => {
  let db: Client;
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  it("dans l'ordre du plan, chaque retour passe ; à la fin, aucune des 52 versions ne reste (transaction annulée)", async () => {
    const versions = LOT.map((nom) => nom.slice(0, 14));
    await db.query("begin");
    try {
      // Le registre tel que le chantier l'écrit en production : la version sur 14 chiffres (le banc local, lui, inscrit le
      // nom complet du fichier ; ces lignes-là ne sont pas en cause).
      await db.query(
        "insert into supabase_migrations.schema_migrations(version, name) select v, 'essai RET-01' from unnest($1::text[]) v on conflict do nothing",
        [versions]
      );
      expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version = any($1::text[])", [versions])).rows[0].n).toBe(52);
      for (const nom of CHAINE) {
        try {
          await db.query(retour(nom));
        } catch (erreur) {
          throw new Error(`${nom}.retour.sql : ${(erreur as Error).message}`);
        }
      }
      const restes = (await db.query("select version from supabase_migrations.schema_migrations where version = any($1::text[]) order by version", [versions])).rows.map((r) => r.version);
      expect(restes).toEqual([]);
    } finally {
      await db.query("rollback");
    }
  }, 180_000);
});
