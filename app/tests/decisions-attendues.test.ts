import { describe, expect, it, vi } from "vitest";
import { chargerDecisionsAttendues, signauxHorsEquipes, sourceAttendEncore, totalDecisions } from "../src/lib/decisions-attendues";

describe("ce qui attend une décision, en un chiffre", () => {
  it("compte chaque rang listé sous « À décider » : décisions des files et rangs hors équipes", () => {
    expect(totalDecisions({ decisions: [1, 2, 3], signaux: [] })).toBe(3);
    expect(totalDecisions({ decisions: [1], signaux: [1, 2, 3, 4, 5] })).toBe(6);
    expect(totalDecisions({ decisions: [], signaux: [] })).toBe(0);
  });
  it("ajoute une seule ligne pour la santé, quel que soit le nombre de points", () => {
    const zero = { bugsN1: 0, devis: 0, contestations: 0, alertesCritiques: 0 };
    expect(signauxHorsEquipes(zero, { bloquants: 21, tachesIllisibles: false }).map((s) => s.cle)).toEqual(["sante"]);
    expect(signauxHorsEquipes(zero, { bloquants: 0, tachesIllisibles: false })).toEqual([]);
  });
  it("une lecture en échec produit un rang qui le dit, jamais un zéro", () => {
    const s = signauxHorsEquipes({ bugsN1: null, devis: 2, contestations: 0, alertesCritiques: 1 }, { bloquants: 0, tachesIllisibles: false });
    expect(s.map((x) => x.cle)).toEqual(["alertes", "bugs", "devis"]);
    expect(s.find((x) => x.cle === "bugs")!.detail).toMatch(/indisponible/);
  });
});

// Un faux client : chaque table rend ses lignes, chaque compte son nombre.
function client(tables: Record<string, unknown[]>, comptes: Record<string, number> = {}, artisans: unknown[] = []) {
  const chaine = (table: string) => {
    let compte = false;
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "neq", "in", "is", "or", "not", "order", "limit", "like", "gte"]) c[m] = () => c;
    c.select = (_c: string, o?: { count?: string }) => { compte = Boolean(o?.count); return c; };
    c.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve(compte ? { data: null, error: null, count: comptes[table] ?? 0 } : { data: tables[table] ?? [], error: null }).then(ok);
    return c;
  };
  return { from: vi.fn(chaine), rpc: vi.fn(async () => ({ data: artisans, error: null })) };
}

describe("chargerDecisionsAttendues", () => {
  const env = { CRON_SECRET: "x" };
  it("compte veille, articles, évolutions et idées SANS point préparé (audit console 27/09)", async () => {
    const db = client({
      points_du_matin: [],
      regulatory_watch: [{ id: "v1", titre: "Encadrement des loyers", source_nom: "Service Public", etude: null }],
      publications: [{ id: "p1", titre: "Le dépôt de garantie", statut: "brouillon", corps: "x".repeat(300) }],
      development_proposals: [{ id: "d1", titre: "Tri", probleme: null, risque: "faible", statut: "autorisation", revision: "a".repeat(40) }],
      retours_utilisateurs: [{ id: "r1", titre: "Exporter", nature: "idee", gravite: "N3", etat: "nouveau" }],
    });
    const d = await chargerDecisionsAttendues(db as never, env, 0, new Date("2026-09-27T07:00:00Z"));
    expect(d.pointPrepare).toBe(false);
    expect(d.decisions.map((x) => x.cle).sort()).toEqual(["developpement:d1", "publication:p1", "retour:r1", "veille:v1"]);
    expect(d.total).toBe(d.decisions.length + d.signaux.length);
  });
  it("ajoute les rangs hors équipes listés (demandes commerciales, alertes critiques)", async () => {
    const db = client({ points_du_matin: [{ id: "pt" }] }, { demandes_devis: 2, alerts: 1 });
    const d = await chargerDecisionsAttendues(db as never, env, 0, new Date("2026-09-27T07:00:00Z"));
    expect(d.pointPrepare).toBe(true);
    expect(d.signaux.map((s) => s.cle)).toEqual(expect.arrayContaining(["alertes", "devis"]));
    expect(d.total).toBe(d.decisions.length + d.signaux.length);
  });
});

describe("sourceAttendEncore — l’état courant avant toute décision du point", () => {
  it("dit non quand l’information a été écartée depuis son écran", async () => {
    expect(await sourceAttendEncore(client({ regulatory_watch: [{ statut: "ecarte" }] }), "veille", "v1")).toBe(false);
    expect(await sourceAttendEncore(client({ regulatory_watch: [{ statut: "a_examiner" }] }), "veille", "v1")).toBe(true);
    expect(await sourceAttendEncore(client({ artisans: [] }), "artisan", "a1")).toBe(false);
    expect(await sourceAttendEncore(client({}), "inconnue", "x")).toBeNull();
  });
});
