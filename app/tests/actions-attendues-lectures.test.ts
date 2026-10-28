import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actionsAttendues, lireActionsAttendues } from "@/lib/actions-attendues";
import { chargerActionsDuJour } from "@/lib/actions-du-jour";

type Ligne = Record<string, unknown> & { id: string };
type Lecture = { table: string; count?: string; ordres: string[]; filtres: [string, string, unknown][]; plage?: [number, number] };
type Incident = "erreur" | "rejete" | "sans-compte" | "incomplete";
function client(tables: Record<string, Ligne[]>, incidents: Record<string, Incident> = {}, plafond = 1000) {
  const lectures: Lecture[] = [];
  const requete = (table: string, options?: { count?: string }) => {
    const lecture: Lecture = { table, count: options?.count, ordres: [], filtres: [] }; lectures.push(lecture);
    const q = {
      select(_colonnes: string, config?: { count?: string }) { lecture.count = config?.count; return q; },
      eq(c: string, v: unknown) { lecture.filtres.push(["eq", c, v]); return q; },
      is(c: string, v: unknown) { lecture.filtres.push(["is", c, v]); return q; },
      in(c: string, v: unknown[]) { lecture.filtres.push(["in", c, v]); return q; },
      or() { return q; },
      order(c: string) { lecture.ordres.push(c); return q; },
      range(debut: number, fin: number) { lecture.plage = [debut, fin]; return q; },
      then<R>(resolve: (r: { data: Ligne[] | null; error: { message: string } | null; count: number | null }) => R, reject?: (e: unknown) => R) {
        if (incidents[table] === "rejete") return Promise.reject(new Error("Transport interrompu")).then(resolve, reject);
        const lignes = (tables[table] ?? []).filter(l => lecture.filtres.every(([op, c, v]) => op === "in" ? (v as unknown[]).includes(l[c]) : l[c] === v))
          .sort((a, b) => a.id.localeCompare(b.id));
        const debut = lecture.plage?.[0] ?? 0, fin = Math.min((lecture.plage?.[1] ?? lignes.length) + 1, debut + plafond);
        return Promise.resolve({
          data: incidents[table] === "erreur" ? null : lignes.slice(debut, fin),
          error: incidents[table] === "erreur" ? { message: "Lecture refusée" } : null,
          count: lecture.count !== "exact" || incidents[table] === "sans-compte" ? null : lignes.length + (incidents[table] === "incomplete" ? 1 : 0),
        }).then(resolve, reject);
      },
    }; return q;
  };
  const db = { from: requete, rpc: (nom: string, _params: unknown, options?: { count?: string }) => requete(nom, options) } as unknown as SupabaseClient;
  return { db, lectures };
}
const ligne = (champs: Ligne): Ligne => ({ organization_id: "org", archived_at: null, ...champs });
const base = (): Record<string, Ligne[]> => ({
  baux: [ligne({ id: "bail", lot_id: "lot", etat: "actif", lot: { id: "lot", nom: "Logement", bien_id: "bien", bien: { id: "bien", nom: "Immeuble", type: "appartement", annee_construction: 2000 } } })],
  etats_des_lieux: [ligne({ id: "edl", bail_id: "bail", type: "entree", etat: "signe" })],
  appels_loyer: [ligne({ id: "appel", bail_id: "bail", montant_du: 600, date_echeance: "2026-10-01" })],
  encaissements: [ligne({ id: "encaissement", bail_id: "bail", montant: 600 })],
  diagnostics: [ligne({ id: "dpe", type: "dpe", lot_id: "lot", bien_id: null, date_expiration: "2030-01-01" }), ligne({ id: "erp", type: "erp", lot_id: null, bien_id: "bien", date_expiration: "2030-01-01" })],
  documents_a_renouveler: [], alerts: [], rapports_gestion: [],
});
const cles = (resultat: Awaited<ReturnType<typeof lireActionsAttendues>>) => resultat.actions.map(a => a.cle);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("Actions attendues : ne rien déduire d'une lecture défaillante", () => {
  it("garde le retour tableau historique et une lecture détaillée sans erreur quand tout est vérifié", async () => {
    const { db } = client(base());
    expect(await actionsAttendues(db, "org")).toEqual([]);
    expect(await lireActionsAttendues(db, "org")).toEqual({ actions: [], erreurs: { baux: false, edls: false, appels: false, encaissements: false, diagnostics: false, pieces: false } });
  });

  it.each([
    ["baux", "baux"], ["etats_des_lieux", "edls"], ["appels_loyer", "appels"],
    ["encaissements", "encaissements"], ["diagnostics", "diagnostics"], ["documents_a_renouveler", "pieces"],
  ] as const)("signale l'échec de %s sans fabriquer d'action", async (table, erreur) => {
    const resultat = await lireActionsAttendues(client(base(), { [table]: "erreur" }).db, "org");
    expect(resultat.erreurs[erreur]).toBe(true); expect(resultat.actions).toEqual([]);
  });

  it.each(["erreur", "rejete", "sans-compte", "incomplete"] as const)("un paiement illisible (%s) ne devient jamais un loyer impayé", async incident => {
    const resultat = await lireActionsAttendues(client(base(), { encaissements: incident }).db, "org");
    expect(resultat.erreurs.encaissements).toBe(true); expect(cles(resultat)).not.toContain("impaye-bail");
  });

  it("conserve les catégories fiables lorsque les règlements sont indisponibles", async () => {
    const tables = base(); tables.etats_des_lieux = [];
    tables.documents_a_renouveler = [ligne({ id: "piece", titre: "Attestation", expire_le: "2026-10-01" })];
    const resultat = await lireActionsAttendues(client(tables, { encaissements: "erreur" }).db, "org", { racine: "/espace" });
    expect(cles(resultat)).toEqual(["edl-bail", "piece-piece"]);
    expect(resultat.actions.every(a => a.href.startsWith("/espace/org/"))).toBe(true);
  });

  it("signale un bail illisible tout en gardant les pièces de l'organisation vérifiées", async () => {
    const tables = base(); tables.documents_a_renouveler = [ligne({ id: "piece", titre: "Attestation", expire_le: "2026-10-01" })];
    const { db, lectures } = client(tables, { baux: "erreur" });
    const resultat = await lireActionsAttendues(db, "org");
    expect(resultat.erreurs.baux).toBe(true); expect(cles(resultat)).toEqual(["piece-piece"]);
    expect(lectures.map(l => l.table)).toEqual(["baux", "documents_a_renouveler"]);
  });

  it("continue à montrer une dette réelle seulement lorsque les appels et règlements sont fiables", async () => {
    const tables = base(); tables.encaissements[0].montant = 500;
    const resultat = await lireActionsAttendues(client(tables).db, "org");
    expect(cles(resultat)).toEqual(["impaye-bail"]); expect(resultat.actions[0].detail).toContain("100,00");
    expect(Object.values(resultat.erreurs).some(Boolean)).toBe(false);
  });

  it.each(["NaN", "Infinity", "", -1, 0.004])("un ancien montant incohérent (%s) est aussi une incertitude", async montant => {
    const tables = base(); tables.encaissements[0].montant = montant;
    const resultat = await lireActionsAttendues(client(tables).db, "org");
    expect(resultat.erreurs.encaissements).toBe(true); expect(cles(resultat)).not.toContain("impaye-bail");
  });
});

describe("Actions attendues : pagination et périmètre", () => {
  it("lit le 1001e règlement et évite le faux euro impayé", async () => {
    const tables = base(); tables.appels_loyer[0].montant_du = 1001;
    tables.encaissements = Array.from({ length: 1001 }, (_, i) => ligne({ id: `e${String(i).padStart(4, "0")}`, bail_id: "bail", montant: 1 }));
    const { db, lectures } = client(tables, {}, 200);
    expect((await lireActionsAttendues(db, "org")).actions).toEqual([]);
    expect(lectures.filter(l => l.table === "encaissements").map(l => l.plage?.[0])).toEqual([0, 200, 400, 600, 800, 1000]);
    for (const lecture of lectures) { expect(lecture.count).toBe("exact"); expect(lecture.ordres.at(-1)).toBe("id"); }
  });

  it("lit les baux au-delà du plafond et borne chaque filtre IN à cent contrats", async () => {
    const tables = base(); tables.baux = Array.from({ length: 1001 }, (_, i) => ({ ...tables.baux[0], id: `b${String(i).padStart(4, "0")}` }));
    const { db, lectures } = client(tables, {}, 200);
    const resultat = await lireActionsAttendues(db, "org");
    expect(resultat.actions.filter(a => a.cle.startsWith("edl-"))).toHaveLength(1001);
    for (const lecture of lectures) {
      const filtre = lecture.filtres.find(([op, c]) => op === "in" && c === "bail_id");
      if (filtre) expect((filtre[2] as string[]).length).toBeLessThanOrEqual(100);
    }
  });

  it("lit aussi le dernier appel, le dernier diagnostic et toutes les pièces expirées", async () => {
    const tables = base();
    tables.appels_loyer = Array.from({ length: 1001 }, (_, i) => ligne({ id: `a${String(i).padStart(4, "0")}`, bail_id: "bail", montant_du: 1, date_echeance: "2026-10-01" }));
    tables.encaissements[0].montant = 1000;
    tables.diagnostics = Array.from({ length: 1000 }, (_, i) => ligne({ id: `d${String(i).padStart(4, "0")}`, type: "dpe", lot_id: `autre-${i}`, bien_id: null, date_expiration: "2030-01-01" }))
      .concat(tables.diagnostics.map(d => ({ ...d, id: `z-${d.id}` })));
    tables.documents_a_renouveler = Array.from({ length: 1001 }, (_, i) => ligne({ id: `p${String(i).padStart(4, "0")}`, titre: `Pièce ${i}`, expire_le: "2026-10-01" }));
    const resultat = await lireActionsAttendues(client(tables, {}, 200).db, "org");
    expect(resultat.actions[0].cle).toBe("impaye-bail"); expect(resultat.actions[0].detail).toContain("1,00");
    expect(resultat.actions.filter(a => a.cle.startsWith("piece-"))).toHaveLength(1001);
    expect(cles(resultat)).not.toContain("dpe-lot"); expect(cles(resultat)).not.toContain("erp-bien");
    expect(Object.values(resultat.erreurs).some(Boolean)).toBe(false);
  });

  it("un bail précis conserve son filtre et ne lit pas les pièces globales", async () => {
    const { db, lectures } = client(base());
    await lireActionsAttendues(db, "org", { bailId: "bail" });
    expect(lectures[0].filtres).toContainEqual(["eq", "id", "bail"]);
    expect(lectures.some(l => l.table === "documents_a_renouveler")).toBe(false);
    for (const lecture of lectures) expect(lecture.filtres).toContainEqual(["eq", "organization_id", "org"]);
  });

  it("colocation : deux baux de chambres d'un même lot ont des titres distincts (audit du 27/10, LAT-04)", async () => {
    const tables = base(); tables.etats_des_lieux = [];
    tables.baux = [
      { ...tables.baux[0], id: "jardin", chambre_id: "c-jardin" },
      { ...tables.baux[0], id: "rue", chambre_id: "c-rue" },
      { ...tables.baux[0], id: "entier", chambre_id: null },
    ];
    tables.lot_chambres = [ligne({ id: "c-jardin", nom: "Chambre Jardin" }), ligne({ id: "c-rue", nom: "Chambre Rue" })];
    const { db, lectures } = client(tables);
    const titres = (await lireActionsAttendues(db, "org")).actions.filter(a => a.cle.startsWith("edl-")).map(a => a.titre);
    expect(titres).toEqual([
      "État des lieux d'entrée à signer — Logement",
      "État des lieux d'entrée à signer — Logement · Chambre Jardin",
      "État des lieux d'entrée à signer — Logement · Chambre Rue",
    ]);
    expect(lectures.find(l => l.table === "lot_chambres")?.filtres).toContainEqual(["eq", "organization_id", "org"]);
    // Chambres illisibles : le lot reste le repère, sans incertitude sur les actions.
    const repli = await lireActionsAttendues(client(tables, { lot_chambres: "erreur" }).db, "org");
    expect(repli.actions.filter(a => a.cle.startsWith("edl-")).map(a => a.titre)).toEqual(Array(3).fill("État des lieux d'entrée à signer — Logement"));
    expect(Object.values(repli.erreurs).some(Boolean)).toBe(false);
  });

  it("écarte les baux extérieurs au portefeuille sans leur fabriquer de blocages", async () => {
    const { db, lectures } = client(base());
    expect((await lireActionsAttendues(db, "org", { portefeuille: new Set(["autre-lot"]) })).actions).toEqual([]);
    expect(lectures.some(l => l.table === "encaissements")).toBe(false);
  });
});

describe("Plan du jour : contrat d'incertitude des actions sur les baux", () => {
  it.each(["baux", "etats_des_lieux", "appels_loyer", "encaissements", "diagnostics", "documents_a_renouveler"])("remonte %s par erreurs.baux, sans faux impayé", async table => {
    const resultat = await chargerActionsDuJour(client(base(), { [table]: "erreur" }).db, "org", { userId: "moi", portefeuille: null });
    expect(resultat.erreurs).toEqual({ baux: true, alertes: false, rapports: false });
    expect(resultat.attendues).toEqual([]); expect(resultat.plan.total).toBe(0);
  });
});

// Quatrième relecture du 28/10 (migration 20261028100100) : un terme d'un mois postérieur à la fin du bail n'est pas dû,
// comme en base (etat_loyers_bail_brut) : il ne devient pas un « Loyer impayé ».
describe("Actions attendues : terme appelé après la fin du bail", () => {
  it("ne compte pas un terme postérieur au mois de fin, mais compte toujours le mois de fin", async () => {
    const tables = base();
    tables.baux = [{ ...tables.baux[0], etat: "preavis", date_fin: "2026-09-25" }];
    tables.appels_loyer = [
      ligne({ id: "a-sept", bail_id: "bail", montant_du: 500, date_echeance: "2026-09-01", periode: "2026-09-01" }),
      ligne({ id: "a-oct", bail_id: "bail", montant_du: 500, date_echeance: "2026-10-01", periode: "2026-10-01" }),
    ];
    tables.encaissements = [ligne({ id: "e", bail_id: "bail", montant: 500 })];
    expect(cles(await lireActionsAttendues(client(tables).db, "org"))).not.toContain("impaye-bail");
    tables.encaissements = [ligne({ id: "e", bail_id: "bail", montant: 400 })];
    const resultat = await lireActionsAttendues(client(tables).db, "org");
    expect(resultat.actions.find((a) => a.cle === "impaye-bail")?.detail).toMatch(/^100,00\s€ échus non couverts$/);
  });
});
