import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerPilotageProprietaire, diagnosticsASurveiller, resumerPilotage, totalEncaissements, type LotPilotage } from "@/lib/pilotage-proprietaire";

const lot = (id: string, etat = "disponible", bien_id = "bien"): LotPilotage => ({ id, nom: id, etat, bien_id });
const bail = (id: string, lot_id: string, etat = "actif", chambre_id: string | null = null) => ({ id, lot_id, etat, chambre_id });

describe("Pilotage propriétaire : unités locatives et patrimoine actif", () => {
  it("compte plusieurs contrats de chambre dans un seul lot et écarte les archives", () => {
    const resultat = resumerPilotage([{ id: "bien" }], [lot("coloc", "loue"), lot("archive", "archive"), lot("bien-archive", "loue", "ancien-bien")], [
      bail("a", "coloc", "actif", "c1"), bail("b", "coloc", "preavis", "c2"), bail("ancien", "coloc", "termine", "c3"),
      bail("archive", "archive"), bail("bien-archive", "bien-archive"),
    ], ["c1", "c2", "c3"].map(id => ({ id, lot_id: "coloc" })).concat({ id: "ignoree", lot_id: "archive" }));
    expect(resultat).toMatchObject({ biens: 1, contrats: 2, lotsOccupes: 1, chambresSansBail: 1, lotsSansBail: [] });
    expect(resultat.lots.map(l => l.id)).toEqual(["coloc"]);
  });

  it("un bail collectif occupe le logement entier, même lorsque des chambres sont préparées", () => {
    expect(resumerPilotage([{ id: "bien" }], [lot("collectif", "loue")], [bail("collectif", "collectif")], [
      { id: "a", lot_id: "collectif" }, { id: "b", lot_id: "collectif" },
    ])).toMatchObject({ contrats: 1, lotsOccupes: 1, chambresSansBail: 0 });
  });

  it("ne repropose pas la création d'un bail lorsqu'un brouillon existe déjà", () => {
    const resultat = resumerPilotage([{ id: "bien" }], [lot("libre"), lot("prepare"), lot("relouer"), lot("incomplet", "brouillon")], [
      bail("brouillon", "prepare", "brouillon"), bail("termine", "relouer", "termine"),
    ], []);
    expect(resultat.lotsSansBail.map(l => l.id)).toEqual(["libre", "relouer"]);
    expect(resultat).toMatchObject({ contrats: 0, lotsOccupes: 0 });
  });

  it("CB-03 : garde la trace des baux en préparation, y compris sur un lot loué, hors lots archivés", () => {
    const resultat = resumerPilotage([{ id: "bien" }], [lot("prepare"), lot("coloc", "loue"), lot("archive", "archive"), lot("libre")], [
      bail("b1", "prepare", "brouillon"), bail("b2", "coloc", "actif", "ch1"), bail("b3", "coloc", "brouillon", "ch2"),
      bail("b4", "coloc", "brouillon"), bail("b5", "archive", "brouillon"), bail("b6", "libre", "termine"),
    ], []);
    expect(resultat.lotsEnPreparation.map(l => [l.id, l.brouillons])).toEqual([["prepare", ["b1"]], ["coloc", ["b3", "b4"]]]);
  });

  it("un nouveau DPE favorable remplace l'ancien signalement F/G sans modifier la liste source", () => {
    const diagnostics = [
      { id: "ancien", lot_id: "renove", date_realisation: "2024-01-01", classe_dpe: "G" },
      { id: "nouveau", lot_id: "renove", date_realisation: "2026-01-01", classe_dpe: "C" },
      { id: "surveiller", lot_id: "autre", date_realisation: "2025-01-01", classe_dpe: "F" },
      { id: "hors-parc", lot_id: "archive", date_realisation: "2026-01-01", classe_dpe: "G" },
    ];
    expect(diagnosticsASurveiller(diagnostics, [lot("renove"), lot("autre")]).map(d => d.id)).toEqual(["surveiller"]);
    expect(diagnostics.map(d => d.id)).toEqual(["ancien", "nouveau", "surveiller", "hors-parc"]);
  });

  it("deux DPE réalisés le même jour sont départagés par le dépôt le plus récent, avant l'UUID", () => {
    const diagnostics = [
      { id: "z-ancien", lot_id: "renove", date_realisation: "2026-01-01", created_at: "2026-01-02T08:00:00Z", classe_dpe: "G" },
      { id: "a-nouveau", lot_id: "renove", date_realisation: "2026-01-01", created_at: "2026-01-02T09:00:00Z", classe_dpe: "C" },
    ];
    expect(diagnosticsASurveiller(diagnostics, [lot("renove")])).toEqual([]);
    expect(diagnosticsASurveiller([...diagnostics].reverse(), [lot("renove")])).toEqual([]);
  });
});

describe("Pilotage propriétaire : montants fiables", () => {
  it("distingue l'absence de règlement d'une lecture illisible et somme au centime", () => {
    expect(totalEncaissements([])).toBe(0);
    expect(totalEncaissements([{ montant: "0.10" }, { montant: 0.2 }])).toBe(0.3);
    expect(totalEncaissements([{ montant: "0.29" }])).toBe(0.29);
  });
  it.each(["NaN", "Infinity", "-Infinity", "", "  ", "inconnu", 0, -1, 0.004, 10.005])("ne présente pas un ancien montant invalide (%s) comme un total fiable", montant => {
    expect(totalEncaissements([{ montant: 600 }, { montant }])).toBeNull();
  });
  it("refuse un montant ou un cumul dépassant la précision des centimes", () => {
    expect(totalEncaissements([{ montant: 100_000_000_000_000 }])).toBeNull();
    expect(totalEncaissements([{ montant: 60_000_000_000_000 }, { montant: 60_000_000_000_000 }])).toBeNull();
  });
});

type Ligne = Record<string, unknown> & { id: string };
type Lecture = { table: string; count?: string; ordres: string[]; filtres: [string, string, unknown][]; plage?: [number, number]; simple?: boolean };
/** API simulée avec plafond réel et compte exact : aucune base ni requête réseau. */
function client(tables: Record<string, Ligne[]>, options: { plafond?: number; erreurs?: string[]; incompletes?: string[] } = {}) {
  const lectures: Lecture[] = [];
  const db = { from(table: string) {
    const lecture: Lecture = { table, ordres: [], filtres: [] }; lectures.push(lecture);
    const q = {
      select(_colonnes: string, config?: { count?: string }) { lecture.count = config?.count; return q; },
      eq(c: string, v: unknown) { lecture.filtres.push(["eq", c, v]); return q; },
      neq(c: string, v: unknown) { lecture.filtres.push(["neq", c, v]); return q; },
      is(c: string, v: unknown) { lecture.filtres.push(["is", c, v]); return q; },
      in(c: string, v: unknown[]) { lecture.filtres.push(["in", c, v]); return q; },
      gte(c: string, v: unknown) { lecture.filtres.push(["gte", c, v]); return q; },
      lte(c: string, v: unknown) { lecture.filtres.push(["lte", c, v]); return q; },
      order(c: string) { lecture.ordres.push(c); return q; },
      range(debut: number, fin: number) { lecture.plage = [debut, fin]; return q; },
      maybeSingle() { lecture.simple = true; return q; },
      then<R>(resolve: (r: { data: Ligne[] | Ligne | null; error: { message: string } | null; count: number | null }) => R, reject?: (e: unknown) => R) {
        let lignes = (tables[table] ?? []).filter(l => lecture.filtres.every(([op, c, v]) => {
          if (op === "eq" || op === "is") return l[c] === v;
          if (op === "neq") return l[c] !== v;
          if (op === "in") return (v as unknown[]).includes(l[c]);
          return op === "gte" ? String(l[c]) >= String(v) : String(l[c]) <= String(v);
        }));
        for (const ordre of [...lecture.ordres].reverse()) lignes = [...lignes].sort((a, b) => String(a[ordre]).localeCompare(String(b[ordre])));
        const debut = lecture.plage?.[0] ?? 0;
        const fin = Math.min((lecture.plage?.[1] ?? lignes.length) + 1, debut + (options.plafond ?? 1000));
        return Promise.resolve({
          data: lecture.simple ? lignes[0] ?? null : lignes.slice(debut, fin),
          error: options.erreurs?.includes(table) ? { message: "Lecture refusée" } : null,
          count: lecture.count === "exact" ? lignes.length + (options.incompletes?.includes(table) ? 1 : 0) : null,
        }).then(resolve, reject);
      },
    }; return q;
  } } as unknown as SupabaseClient;
  return { db, lectures };
}
const ligne = (champs: Ligne): Ligne => ({ organization_id: "org", archived_at: null, ...champs });
const base = () => ({
  biens: [ligne({ id: "bien" })], lots: [ligne(lot("lot"))], baux: [] as Ligne[], lot_chambres: [] as Ligne[], diagnostics: [] as Ligne[],
  encaissements: [ligne({ id: "paiement", montant: "600.25", date_paiement: "2026-10-01" })],
  organizations: [{ id: "org", quittances_envoi_auto: true, appels_envoi_auto: false, relances_envoi_auto: false }],
});

describe("Pilotage propriétaire : lectures complètes et séparées par structure", () => {
  it("lit plus de 1 000 lignes malgré un plafond API inférieur et sans doublons", async () => {
    const tables = base();
    tables.encaissements = Array.from({ length: 1001 }, (_, n) => ligne({ id: `e${String(n).padStart(4, "0")}`, montant: "1.23", date_paiement: "2026-10-01" }));
    const { db, lectures } = client(tables, { plafond: 333 });
    const resultat = await chargerPilotageProprietaire(db, "org", "2026-10-26");
    expect(resultat.encaisse).toBe(1231.23);
    expect(lectures.filter(l => l.table === "encaissements").map(l => l.plage?.[0])).toEqual([0, 333, 666, 999]);
    for (const lecture of lectures.filter(l => !l.simple)) {
      expect(lecture.count).toBe("exact"); expect(lecture.ordres.at(-1)).toBe("id");
      expect(lecture.filtres).toContainEqual(["eq", "organization_id", "org"]);
    }
  });

  it("ne mélange pas un autre patrimoine, des dates hors mois, ni des biens et lots archivés", async () => {
    const tables = base();
    tables.biens.push(ligne({ id: "ancien", archived_at: "2026-01-01" }), ligne({ id: "autre", organization_id: "autre-org" }));
    tables.lots.push(ligne(lot("lot-ancien", "disponible", "ancien")), ligne(lot("lot-archive", "archive")), ligne({ ...lot("autre-lot", "disponible", "autre"), organization_id: "autre-org" }));
    tables.encaissements.push(...[
      { id: "autre", organization_id: "autre-org", date_paiement: "2026-10-01", montant: "999" },
      { id: "avant", date_paiement: "2026-09-30", montant: "999" },
      { id: "apres", date_paiement: "2026-10-27", montant: "999" },
    ].map(ligne));
    tables.diagnostics.push(...[
      { id: "dpe", type: "dpe", lot_id: "lot", classe_dpe: "F", date_realisation: "2026-01-01" },
      { id: "dpe-ancien", type: "dpe", lot_id: "lot-ancien", classe_dpe: "G", date_realisation: "2026-01-01" },
      { id: "dpe-archive", type: "dpe", lot_id: "lot", classe_dpe: "G", date_realisation: "2026-02-01", archived_at: "2026-03-01" },
    ].map(ligne));
    const resultat = await chargerPilotageProprietaire(client(tables).db, "org", "2026-10-26");
    expect(resultat.encaisse).toBe(600.25); expect(resultat.patrimoine?.biens).toBe(1);
    expect(resultat.patrimoine?.lots.map(l => l.id)).toEqual(["lot"]);
    expect(resultat.diagnostics?.map(d => d.id)).toEqual(["dpe"]);
  });

  it("une lecture tronquée rend le montant indisponible, sans remplacer par un faux zéro", async () => {
    const resultat = await chargerPilotageProprietaire(client(base(), { incompletes: ["encaissements"] }).db, "org", "2026-10-26");
    expect(resultat.encaisse).toBeNull(); expect(resultat.patrimoine?.biens).toBe(1);
  });

  it.each(["biens", "lots", "baux", "lot_chambres"])("un refus de lecture %s invalide les comptes du patrimoine", async table => {
    const resultat = await chargerPilotageProprietaire(client(base(), { erreurs: [table] }).db, "org", "2026-10-26");
    expect(resultat.patrimoine).toBeNull(); expect(resultat.encaisse).toBe(600.25);
  });

  it("ne transforme pas les diagnostics ou réglages indisponibles en absence de suivi", async () => {
    const resultat = await chargerPilotageProprietaire(client(base(), { erreurs: ["diagnostics", "organizations"] }).db, "org", "2026-10-26");
    expect(resultat.diagnostics).toBeNull(); expect(resultat.reglages).toBeNull();
  });

  it("un ancien encaissement non fini rend le total indisponible jusque dans le chargeur", async () => {
    const tables = base(); tables.encaissements.push(ligne({ id: "ancien-invalide", montant: "NaN", date_paiement: "2026-10-01" }));
    expect((await chargerPilotageProprietaire(client(tables).db, "org", "2026-10-26")).encaisse).toBeNull();
  });
});


it("nomme le lot unique avec son bien pour distinguer les patrimoines", () => {
  const resultat = resumerPilotage([{ id: "bien-A", nom: "Maison des Lilas" }, { id: "bien-B", nom: "Studio République" }], [
    { id: "lot-A", nom: "Lot unique", bien_id: "bien-A", etat: "disponible" },
    { id: "lot-B", nom: "Lot unique", bien_id: "bien-B", etat: "disponible" },
  ], [], []);
  expect(resultat.lotsSansBail.map(lot => lot.nom)).toEqual(["Maison des Lilas", "Studio République"]);
});
