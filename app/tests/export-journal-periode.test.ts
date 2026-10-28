/**
 * Audit final du 27/10 (LOY-04, LOY-19) — l'export CSV du journal de gestion : période vérifiée, colonne « auto » juste,
 * colonne « mandant » omise chez un propriétaire direct.
 *
 * Avant : ?du=abc partait tel quel à la base, qui répondait « invalid input syntax for type date » en 500 ; ?du=2026-12-31&au=2026-01-01
 * produisait un fichier vide « du 31/12/2026 au 01/01/2026 » ; l'écriture de loyer née d'un encaissement sortait « auto = non » ;
 * un propriétaire direct recevait une colonne « mandant » toujours vide. Faux client, aucune base (même banc que
 * export-journal-pagination.test.ts, réduit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown> & { id: string };
const banc = vi.hoisted(() => ({
  role: "admin_agence",
  tables: {} as Record<string, Ligne[]>,
  filtres: [] as [string, string, unknown][],
}));

function fauxClient() {
  return {
    from(table: string) {
      const filtres: [string, string, unknown][] = [];
      const q = {
        select() { return q; },
        eq(c: string, v: unknown) { filtres.push(["eq", c, v]); return q; },
        gte(c: string, v: unknown) { filtres.push(["gte", c, v]); banc.filtres.push(["gte", c, v]); return q; },
        lte(c: string, v: unknown) { filtres.push(["lte", c, v]); banc.filtres.push(["lte", c, v]); return q; },
        order() { return q; },
        range() { return q; },
        then<R>(resolve: (r: { data: Ligne[]; error: null; count: number }) => R) {
          const lignes = (banc.tables[table] ?? []).filter((l) => filtres.every(([op, c, v]) =>
            op === "eq" ? c === "organization_id" || l[c] === v : op === "gte" ? String(l[c]) >= String(v) : String(l[c]) <= String(v)));
          return Promise.resolve({ data: lignes, error: null, count: lignes.length }).then(resolve);
        },
      };
      return q;
    },
  };
}

vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: fauxClient(), user: { id: "compte" }, role: banc.role }),
}));
vi.mock("@/lib/portefeuille", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portefeuille")>()),
  lotsDuPortefeuille: async () => null,
}));

import { GET, dateIsoValide } from "@/app/agence/[orgId]/comptabilite/export/route";

const ecriture = (id: string, sur: Partial<Ligne> = {}): Ligne => ({
  id, lot_id: "lot-1", date_piece: "2026-03-01", date_imputation: "2026-03-01", categorie: "loyer", sens: "recette", montant: 10,
  libelle: id, systeme: false, encaissement_id: null, contre_ecriture_de: null,
  lot: { nom: "Lot 1", bien: { nom: "Bien" } }, mandat: null, ...sur,
});

async function exporter(requete = "") {
  const res = await GET(new Request(`http://localhost/agence/org/comptabilite/export${requete}`), { params: Promise.resolve({ orgId: "org" }) });
  return { res, corps: (await res.text()).replace(/^﻿/, "") };
}

beforeEach(() => {
  banc.role = "admin_agence";
  banc.filtres = [];
  banc.tables = {
    ecritures: [
      ecriture("loyer-encaisse", { encaissement_id: "enc-1" }),
      ecriture("honoraires", { categorie: "honoraires", sens: "depense", systeme: true, mandat: { person: { nom: "Mandant", prenom: "Paul" } } }),
      ecriture("depense-saisie", { categorie: "travaux", sens: "depense", date_imputation: "2026-07-10" }),
    ],
    mandat_lignes: [{ id: "ml-1", lot_id: "lot-1", date_debut: "2026-01-01", date_fin: null, mandat: { etat: "actif", date_fin: null, person: { nom: "Mandant", prenom: "Paul" } } }],
  };
});

describe("dateIsoValide", () => {
  it("n'accepte qu'une date « AAAA-MM-JJ » qui existe", () => {
    for (const ok of ["2026-01-01", "2026-12-31", "2024-02-29"]) expect(dateIsoValide(ok), ok).toBe(true);
    for (const ko of ["abc", "2026-13-45", "2026-02-30", "2026-02-29", "1' or 1=1", "2026-01-01\r\nX-Test:1", "2026-1-1", "20260101", ""]) {
      expect(dateIsoValide(ko), ko).toBe(false);
    }
  });
});

describe("la période de l'export (LOY-04)", () => {
  it("une borne illisible : 400 en français, aucun texte de la base, aucune lecture", async () => {
    for (const requete of ["?du=abc", "?du=2026-13-45", "?du=2026-02-30", "?au=1'%20or%201=1", "?du=2026-01-01%0D%0AX-Test:1&au=abc"]) {
      const { res, corps } = await exporter(requete);
      expect(res.status, requete).toBe(400);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(res.headers.get("Content-Disposition")).toBeNull();
      expect(corps).toBe("Période invalide : indiquez des dates au format AAAA-MM-JJ, la date de début avant la date de fin.");
      expect(corps).not.toMatch(/invalid input|out of range|time zone/);
    }
    expect(banc.filtres).toEqual([]);
  });

  it("des bornes inversées : 400, pas un fichier vide qui a l'air complet", async () => {
    const { res, corps } = await exporter("?du=2026-12-31&au=2026-01-01");
    expect(res.status).toBe(400);
    expect(corps).toMatch(/^Période invalide/);
  });

  it("l'année en cours, dont la fin est dans le futur : 200, le fichier borné", async () => {
    const { res, corps } = await exporter("?du=2026-01-01&au=2026-12-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("journal-de-gestion-2026-01-01-au-2026-12-31.csv");
    expect(corps.split("\r\n")[0]).toBe("Journal de gestion du 01/01/2026 au 31/12/2026");
    expect(banc.filtres).toEqual([["gte", "date_imputation", "2026-01-01"], ["lte", "date_imputation", "2026-12-31"]]);
    expect(corps.split("\r\n")).toHaveLength(2 + 3);
  });

  it("une seule borne, ou aucune : comme avant", async () => {
    expect((await exporter("?au=2026-06-30")).corps.split("\r\n")).toHaveLength(2 + 2);
    expect((await exporter()).corps.split("\r\n")[0]).toBe("Journal de gestion");
  });
});

describe("les colonnes « auto » et « mandant » (LOY-19)", () => {
  const ligne = (corps: string, libelle: string) => corps.split("\r\n").find((l) => l.includes(`;${libelle};`))?.split(";");

  it("en agence : l'écriture de loyer née d'un encaissement sort « auto = oui », la colonne mandant reste", async () => {
    const { corps } = await exporter();
    const entete = corps.split("\r\n")[1].split(";");
    expect(entete).toEqual(["date_piece", "date_imputation", "bien", "lot", "mandant", "categorie", "sens", "montant", "libelle", "auto", "annule"]);
    expect(ligne(corps, "loyer-encaisse")?.slice(4)).toEqual(["Mandant Paul", "loyer", "recette", "10,00", "loyer-encaisse", "oui", ""]);
    expect(ligne(corps, "honoraires")?.slice(4)).toEqual(["Mandant Paul", "honoraires", "depense", "10,00", "honoraires", "oui", ""]);
    expect(ligne(corps, "depense-saisie")?.slice(4)).toEqual(["Mandant Paul", "travaux", "depense", "10,00", "depense-saisie", "non", ""]);
  });

  it("chez un propriétaire direct : pas de colonne mandant, les autres colonnes inchangées", async () => {
    banc.role = "proprietaire_direct";
    const { corps } = await exporter();
    const entete = corps.split("\r\n")[1].split(";");
    expect(entete).toEqual(["date_piece", "date_imputation", "bien", "lot", "categorie", "sens", "montant", "libelle", "auto", "annule"]);
    expect(ligne(corps, "loyer-encaisse")?.slice(4)).toEqual(["loyer", "recette", "10,00", "loyer-encaisse", "oui", ""]);
    expect(ligne(corps, "depense-saisie")?.slice(4)).toEqual(["travaux", "depense", "10,00", "depense-saisie", "non", ""]);
    for (const l of corps.split("\r\n").slice(1)) expect(l.split(";")).toHaveLength(entete.length);
  });
});
