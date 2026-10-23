/**
 * Audit du 23/10/2026, A04 (P1) — l'export du journal de gestion perdait, sans un mot, tout ce qui passait la 1 000e ligne.
 *
 * L'API de lecture rend au plus 1 000 lignes par requête (réglage « Max rows » de Supabase) et ne signale rien quand elle
 * coupe. La route `comptabilite/export` lisait les écritures, puis les lignes de mandat, d'une seule requête chacune : avec
 * 1 001 écritures, elle rendait 1 000 lignes, un statut 200 et un fichier nommé `journal-de-gestion-complet.csv`.
 *
 * Le faux client ci-dessous joue l'API : au plus 1 000 lignes par réponse, `count` seulement si on le demande. Aucune base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown> & { id: string };
type Appel = {
  table: string;
  colonnes?: string;
  options?: { count?: string };
  ordres: string[];
  filtres: [string, string, unknown][];
  plage?: [number, number];
};

const banc = vi.hoisted(() => ({
  role: "admin_agence",
  portefeuille: null as Set<string> | null,
  tables: {} as Record<string, Ligne[]>,
  /** Plafond de lignes par réponse, comme le « Max rows » de Supabase. */
  plafond: 1000,
  /** Écart ajouté au `count` annoncé, par table : une réponse qui promet plus qu'elle ne peut rendre. */
  compteMenteur: {} as Record<string, number>,
  /** Ce qui arrive à une table juste après qu'on a servi sa première page (écriture concurrente). */
  apresPremierePage: {} as Record<string, (lignes: Ligne[]) => void>,
  appels: [] as Appel[],
}));

function fauxClient() {
  return {
    from(table: string) {
      const appel: Appel = { table, ordres: [], filtres: [] };
      banc.appels.push(appel);
      const q = {
        select(colonnes: string, options?: { count?: string }) { appel.colonnes = colonnes; appel.options = options; return q; },
        eq(c: string, v: unknown) { appel.filtres.push(["eq", c, v]); return q; },
        gte(c: string, v: unknown) { appel.filtres.push(["gte", c, v]); return q; },
        lte(c: string, v: unknown) { appel.filtres.push(["lte", c, v]); return q; },
        order(c: string) { appel.ordres.push(c); return q; },
        range(a: number, b: number) { appel.plage = [a, b]; return q; },
        then<R>(resolve: (r: { data: Ligne[]; error: null; count: number | null }) => R, reject?: (e: unknown) => R) {
          const lignes = (banc.tables[table] ?? []).filter((l) => appel.filtres.every(([op, c, v]) =>
            op === "eq" ? c === "organization_id" || l[c] === v : op === "gte" ? String(l[c]) >= String(v) : String(l[c]) <= String(v)));
          const debut = appel.plage?.[0] ?? 0;
          const fin = appel.plage ? appel.plage[1] + 1 : lignes.length;
          const page = lignes.slice(debut, Math.min(fin, debut + banc.plafond));
          const count = appel.options?.count === "exact" ? lignes.length + (banc.compteMenteur[table] ?? 0) : null;
          const pagesServies = banc.appels.filter((a) => a.table === table).indexOf(appel);
          if (pagesServies === 0) banc.apresPremierePage[table]?.(banc.tables[table]);
          return Promise.resolve({ data: page, error: null, count }).then(resolve, reject);
        },
      };
      return q;
    },
    rpc: async () => ({ data: null, error: { message: "inattendu" } }),
  };
}

vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: fauxClient(), user: { id: "compte" }, role: banc.role }),
}));
vi.mock("@/lib/portefeuille", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portefeuille")>()),
  lotsDuPortefeuille: async () => banc.portefeuille,
}));

import { GET } from "@/app/agence/[orgId]/comptabilite/export/route";
import { PortefeuilleIndisponible } from "@/lib/portefeuille";

const n4 = (i: number) => String(i).padStart(4, "0");
/** L'écriture n° i, sur le lot n° i, sans mandat porté : son mandant se retrouve par la ligne de mandat du lot. */
const ecriture = (i: number): Ligne => ({
  id: `e-${n4(i)}`, lot_id: `lot-${n4(i)}`, date_piece: "2026-03-01", date_imputation: "2026-03-01",
  categorie: "loyer", sens: "recette", montant: 10, libelle: `ecriture-${n4(i)}`, systeme: false, contre_ecriture_de: null,
  lot: { nom: `Lot ${n4(i)}`, bien: { nom: "Immeuble" } }, mandat: null,
});
const ligneMandat = (i: number): Ligne => ({
  id: `ml-${n4(i)}`, lot_id: `lot-${n4(i)}`, date_debut: "2026-01-01", date_fin: null,
  mandat: { person: { nom: `Mandant ${n4(i)}`, prenom: null } },
});
const serie = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

const exporter = async (requete = "") => {
  const res = await GET(new Request(`http://local.invalid/agence/org/comptabilite/export${requete}`), {
    params: Promise.resolve({ orgId: "org" }),
  });
  const corps = await res.text();
  const lignesCsv = corps.replace(/^﻿/, "").split("\r\n");
  return { res, corps, donnees: lignesCsv.slice(2) };
};

beforeEach(() => {
  banc.role = "admin_agence";
  banc.portefeuille = null;
  banc.tables = { ecritures: serie(1001, ecriture), mandat_lignes: serie(1001, ligneMandat) };
  banc.plafond = 1000;
  banc.compteMenteur = {};
  banc.apresPremierePage = {};
  banc.appels = [];
});

describe("export du journal de gestion : au-delà de 1 000 lignes (A04)", () => {
  it("1 001 écritures et 1 001 lignes de mandat : les 1 001 lignes sortent, la dernière avec son mandant", async () => {
    const { res, donnees } = await exporter();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("journal-de-gestion-complet.csv");
    expect(donnees).toHaveLength(1001);
    // La 1 001e écriture, et son mandant, qui ne se lit que sur la 1 001e ligne de mandat.
    expect(donnees.at(-1)).toContain("ecriture-1000");
    expect(donnees.at(-1)).toContain("Mandant 1000");
    expect(new Set(donnees.map((l) => l.split(";")[8])).size).toBe(1001);
  });

  it("la ligne de mandat au-delà de la 1 000e suffit à nommer le mandant (lecture des mandats paginée elle aussi)", async () => {
    banc.tables.ecritures = [ecriture(0), ecriture(1000)];
    const { res, donnees } = await exporter();
    expect(res.status).toBe(200);
    expect(donnees).toHaveLength(2);
    expect(donnees[1]).toContain("Mandant 1000");
  });

  it("chaque lecture demande le compte exact, page par page, dans un ordre stable terminé par la clé unique", async () => {
    await exporter();
    for (const table of ["ecritures", "mandat_lignes"]) {
      const appels = banc.appels.filter((a) => a.table === table);
      expect(appels.length, table).toBeGreaterThanOrEqual(2);
      for (const a of appels) {
        expect(a.options?.count, table).toBe("exact");
        expect(a.plage, table).toBeDefined();
        expect(a.ordres.at(-1), table).toBe("id");
      }
      expect(appels.map((a) => a.plage![0]), table).toEqual([0, 1000]);
    }
  });

  it("une période garde ses bornes sur chaque page", async () => {
    const { res } = await exporter("?du=2026-01-01&au=2026-12-31");
    expect(res.status).toBe(200);
    for (const a of banc.appels.filter((x) => x.table === "ecritures")) {
      expect(a.filtres).toContainEqual(["gte", "date_imputation", "2026-01-01"]);
      expect(a.filtres).toContainEqual(["lte", "date_imputation", "2026-12-31"]);
    }
  });

  it("le compte annoncé dépasse ce qui se lit : refus en français, aucun fichier « complet »", async () => {
    banc.compteMenteur = { ecritures: 1 };
    const { res, corps } = await exporter();
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(corps).toMatch(/^Export impossible/);
    expect(corps).toMatch(/1\s002 écritures/);
    expect(corps).toMatch(/1\s001/);
    expect(corps).not.toContain("complet.csv");
  });

  it("même refus quand ce sont les lignes de mandat qui manquent", async () => {
    banc.compteMenteur = { mandat_lignes: 1 };
    const { res, corps } = await exporter();
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(corps).toMatch(/mandant/);
    expect(corps).toMatch(/1\s002 lignes de mandat/);
  });

  it("une écriture ajoutée entre deux pages : le compte a changé, l'export est refusé plutôt que bancal", async () => {
    banc.apresPremierePage = { ecritures: (lignes) => { lignes.splice(10, 0, { ...ecriture(5000), id: "e-ajout" }); } };
    const { res, corps } = await exporter();
    expect(res.status).toBe(500);
    expect(corps).toMatch(/modifié pendant la lecture/);
  });

  it("une écriture déplacée entre deux pages (même compte) : le doublon est repéré, l'export est refusé", async () => {
    // La 1 001e écriture passe en tête : la page 2 relit la 1 000e, et la 1 001e n'est jamais lue.
    banc.apresPremierePage = { ecritures: (lignes) => { lignes.unshift(lignes.pop()!); } };
    const { res, corps } = await exporter();
    expect(res.status).toBe(500);
    expect(corps).toMatch(/modifié pendant la lecture/);
  });

  it("un plafond plus bas que 1 000 (réglage modifié) : la lecture avance par ce qu'elle reçoit, rien ne manque", async () => {
    banc.plafond = 300;
    const { res, donnees } = await exporter();
    expect(res.status).toBe(200);
    expect(donnees).toHaveLength(1001);
    expect(donnees.at(-1)).toContain("Mandant 1000");
  });

  it("agent à portefeuille : la ligne de son lot au-delà de la 1 000e sort, celles des autres non", async () => {
    banc.role = "agent";
    banc.portefeuille = new Set(["lot-1000"]);
    const { res, donnees } = await exporter();
    expect(res.status).toBe(200);
    expect(donnees).toHaveLength(1);
    expect(donnees[0]).toContain("ecriture-1000");
  });

  it("portefeuille illisible : refus, pas un journal vide présenté comme complet", async () => {
    banc.role = "agent";
    banc.portefeuille = new PortefeuilleIndisponible();
    const { res, corps } = await exporter();
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(corps).toMatch(/portefeuille/);
  });

  it("portefeuille qui atteint la limite de lecture (peut-être tronqué) : refus", async () => {
    banc.role = "agent";
    banc.portefeuille = new Set(serie(1000, (i) => `lot-${n4(i)}`));
    const { res, corps } = await exporter();
    expect(res.status).toBe(500);
    expect(corps).toMatch(/portefeuille/);
  });

  it("journal vide : un fichier vide mais juste (le compte vaut 0)", async () => {
    banc.tables = { ecritures: [], mandat_lignes: [] };
    const { res, donnees } = await exporter();
    expect(res.status).toBe(200);
    expect(donnees).toEqual([]);
  });
});
