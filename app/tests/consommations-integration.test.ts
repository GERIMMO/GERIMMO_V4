import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireCollectionConsommations, lireLiensConsommations } from "@/lib/lecture-consommations";
import { comparerFactureReleves, debutFactureSuivante } from "@/lib/rapprochement-fourniture";
import { csvRepartitionFourniture } from "@/lib/export-repartition-fourniture";
import { chargerTachesConsommations } from "@/lib/taches-consommations";
import type { CompteurConsommation, ContratFourniture, FactureFourniture, ReleveConsommation } from "@/lib/consommations";
import { enregistrerConsommation } from "@/app/actions/consommations";

const h = vi.hoisted(() => ({ db: null as unknown, depot: "", rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({ supabase: h.db, user: { id: "gerant" } }), verifierLocataire: async () => ({ supabase: h.db, user: { id: "locataire" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/depot-direct", () => ({ resoudreDepotsFormulaire: async () => null }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: async () => ({ documentId: h.depot }) }));

type Row = Record<string, unknown>;
function baseFictive(tables: Record<string, Row[]>, erreur?: (table: string, operation: string) => string | undefined) {
  const operations: { table: string; operation: string; lignes: Row[] }[] = [];
  const from = (table: string) => {
    let operation = "select", donnees: Row[] = [], from = 0, to = 999, compte = false;
    const filtres: ((r: Row) => boolean)[] = [];
    const q = {
      select(_s?: string, opts?: { count?: string }) { compte = !!opts?.count; return q; },
      eq(k: string, v: unknown) { filtres.push(r => r[k] === v); return q; },
      in(k: string, v: unknown[]) { filtres.push(r => v.includes(r[k])); return q; },
      is(k: string, v: unknown) { filtres.push(r => r[k] === v); return q; },
      lte(k: string, v: unknown) { filtres.push(r => String(r[k]) <= String(v)); return q; },
      order() { return q; }, range(d: number, f: number) { from = d; to = f; return q; },
      insert(r: Row | Row[]) { operation = "insert"; donnees = Array.isArray(r) ? r : [r]; return q; },
      upsert(r: Row | Row[]) { operation = "upsert"; donnees = Array.isArray(r) ? r : [r]; return q; },
      update(r: Row) { operation = "update"; donnees = [r]; return q; },
      async executer(unique = false) {
        const e = erreur?.(table, operation); if (e) return { data: null, error: { message: e }, count: null };
        const source = tables[table] ?? (tables[table] = []);
        let lignes = source.filter(r => filtres.every(f => f(r)));
        if (["insert", "upsert"].includes(operation)) { lignes = donnees.map(r => ({ id: randomUUID(), ...r })); source.push(...lignes); }
        if (operation === "update") for (const r of lignes) Object.assign(r, donnees[0]);
        if (operation !== "select") operations.push({ table, operation, lignes });
        return { data: unique ? lignes[0] ?? null : lignes.slice(from, to + 1), error: null, count: compte ? lignes.length : null };
      },
      maybeSingle() { return q.executer(true); }, single() { return q.executer(true); },
      then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) { return q.executer().then(resolve, reject); },
    };
    return q;
  };
  return { from, rpc: h.rpc, operations };
}
const fd = (valeurs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(valeurs)) f.set(k, v); return f; };
const org = randomUUID(), bien = randomUUID(), lot = randomUUID(), autreLot = randomUUID(), contratId = randomUUID(), documentId = randomUUID(), factureId = randomUUID(), compteurId = randomUUID();
let tables: Record<string, Row[]>;
beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: 0, error: null }); h.revalidate.mockReset(); h.depot = documentId;
  tables = { biens: [{ id: bien, organization_id: org }], lots: [{ id: lot, organization_id: org, bien_id: bien }, { id: autreLot, organization_id: org, bien_id: bien }],
    documents: [{ id: documentId, organization_id: org, purged_at: null, empreinte: "a".repeat(64) }],
    contrats_fourniture: [{ id: contratId, organization_id: org, bien_id: bien, lot_id: lot, actif: true, fournisseur: "Eau", categorie: "eau" }],
    compteurs_consommation: [{ id: compteurId, organization_id: org, bien_id: bien, lot_id: lot }],
    factures_fourniture: [{ id: factureId, organization_id: org, contrat_id: contratId, reference: "F-test", periode_debut: "2026-09-01", periode_fin: "2026-09-30", payee_le: null, date_echeance: "2026-10-01" }], demandes_releves: [],
    baux: [{ id: randomUUID(), organization_id: org, lot_id: lot, etat: "termine", date_debut: "2026-01-01", date_fin: "2026-09-30", charges_mode: "provision" }] };
  h.db = baseFictive(tables);
});

describe("intégration des consommations", () => {
  it("une erreur de synchronisation ne prétend pas que les demandes ont été envoyées et le second essai ne recrée pas le compteur", async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: "Indisponible" } });
    const f = fd({ action: "compteur", type: "eau_froide", index_initial: "100", date_index_initial: "2026-09-01", prochaine_demande: "2026-11-01" });
    const r = await enregistrerConsommation(org, bien, null, {}, f);
    expect(r.synchronisationAReprendre).toBe(true); expect(r.erreur).toMatch(/Compteur enregistré/); expect(r.succes).toBeUndefined();
    const avant = tables.compteurs_consommation.length;
    expect((await enregistrerConsommation(org, bien, null, r, fd({ action: "synchroniser" }))).succes).toBeDefined();
    expect(tables.compteurs_consommation).toHaveLength(avant);
  });
  it("refuse un relevé sur un compteur d'un autre lot avant l'appel métier", async () => {
    const r = await enregistrerConsommation(org, bien, autreLot, {}, fd({ action: "releve", id: compteurId, index: "101", date: "2026-10-01" }));
    expect(r.erreur).toMatch(/depuis cette fiche/); expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuse le paiement d'une facture du lot voisin, mais conserve les factures des contrats archivés", async () => {
    const f = fd({ action: "facture_payee", id: factureId, date: "2026-10-01" });
    expect((await enregistrerConsommation(org, bien, autreLot, {}, f)).erreur).toMatch(/depuis cette fiche/);
    expect(h.rpc).not.toHaveBeenCalled(); tables.contrats_fourniture[0].actif = false;
    expect((await enregistrerConsommation(org, bien, lot, {}, f)).succes).toMatch(/finances/);
    expect(h.rpc).toHaveBeenCalledWith("payer_facture_fourniture", { p_org: org, p_facture: factureId, p_date: "2026-10-01" });
    expect(tables.factures_fourniture[0].payee_le).toBeNull(); // Le seul chemin est la transaction métier, jamais un UPDATE isolé.
  });
  const factureForm = () => { const f = fd({ action: "facture", contrat_id: contratId, reference: "F-2026", total: "123,45", periode_debut: "2026-09-01", periode_fin: "2026-10-01" }); f.set("document", new File(["facture"], "facture.pdf", { type: "application/pdf" })); return f; };
  it("classe le justificatif dans le logement avant d'enregistrer la facture", async () => {
    const db = baseFictive(tables); h.db = db;
    expect((await enregistrerConsommation(org, bien, lot, {}, factureForm())).succes).toBeDefined();
    expect(db.operations.map(o => o.table)).toEqual(["document_liens", "factures_fourniture"]);
    expect(tables.document_liens[0]).toMatchObject({ document_id: documentId, entite: "lot", entite_id: lot, organization_id: org });
  });
  it("conserve le document pour réessayer si son classement échoue, sans créer une facture invisible", async () => {
    h.db = baseFictive(tables, table => table === "document_liens" ? "Classement indisponible" : undefined);
    const r = await enregistrerConsommation(org, bien, lot, {}, factureForm());
    expect(r.documentId).toBe(documentId); expect(r.documentEmpreinte).toBe("a".repeat(64)); expect(r.erreur).toMatch(/classement/); expect(tables.factures_fourniture).toHaveLength(1);
  });
  it("le contrat archivé conserve son alerte de facture, sans rappel de renouvellement", async () => {
    Object.assign(tables.contrats_fourniture[0], { actif: false, echeance: "2026-10-01", preavis_jours: 30 });
    const r = await chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    expect(r.indisponible).toBe(false); expect(r.taches.filter(t => t.type.startsWith("consommation_")).map(t => t.cle)).toEqual([`facture:${factureId}`]);
  });
  it("un bail terminé déclenche le choix du nouvel occupant sans lui attribuer automatiquement le compteur", async () => {
    const bailId = randomUUID(); Object.assign(tables.compteurs_consommation[0], { actif: true, bail_referent: bailId, libelle: "Eau froide" });
    tables.baux = [{ id: bailId, organization_id: org, etat: "termine" }];
    const r = await chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    expect(r.indisponible).toBe(false); expect(r.taches.find(t => t.type === "releve_destinataire")?.titre).toMatch(/nouvel occupant/);
    expect(h.rpc).not.toHaveBeenCalled(); expect(tables.compteurs_consommation[0].bail_referent).toBe(bailId);
  });
  it("une facture récupérable reste à répartir pour un ancien bail au réel qui couvre sa période, jusqu'à validation", async () => {
    tables.factures_fourniture[0].payee_le = "2026-10-01";
    const lire = () => chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    for (const categorie of ["eau", "entretien", "teom"]) {
      tables.contrats_fourniture[0].categorie = categorie;
      expect((await lire()).taches.map(t => t.cle)).toEqual([`repartition:${factureId}`]);
    }
    tables.repartitions_fourniture = [{ id: randomUUID(), organization_id: org, facture_id: factureId, statut: "validee" }];
    expect((await lire()).taches).toEqual([]);
    tables.repartitions_fourniture = []; tables.contrats_fourniture[0].categorie = "assurance";
    expect((await lire()).taches).toEqual([]);
  });
  it("un forfait seul ne crée pas une fausse tâche de récupération, mais conserve l'échéance de paiement", async () => {
    tables.baux[0].charges_mode = "forfait";
    const r = await chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    expect(r.taches.map(t => t.cle)).toEqual([`facture:${factureId}`]);
  });
  it("un logement vacant ou un bail hors période ne crée pas une tâche de récupération", async () => {
    tables.factures_fourniture[0].payee_le = "2026-10-01";
    tables.baux[0].date_fin = "2026-08-31";
    const lire = () => chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    expect((await lire()).taches).toEqual([]);
    tables.baux = [];
    expect((await lire()).taches).toEqual([]);
  });
  it("une dépense de bâtiment payée reste à ventiler même au forfait ou pendant la vacance", async () => {
    tables.contrats_fourniture[0].lot_id = null;
    tables.factures_fourniture[0].payee_le = "2026-10-01";
    tables.baux[0].charges_mode = "forfait";
    tables.paiements_factures_fourniture = [{ id: randomUUID(), organization_id: org, facture_id: factureId, etat: "a_ventiler" }];
    const lire = () => chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    expect((await lire()).taches.map(t => t.cle)).toEqual([`ventilation:${factureId}`]);
    tables.baux = [];
    expect((await lire()).taches.map(t => t.titre)).toEqual(["Ventiler cette dépense du bâtiment"]);
    tables.paiements_factures_fourniture[0].etat = "ventile";
    expect((await lire()).taches).toEqual([]);
  });
  it("une lecture des occupations en échec n'affirme pas qu'il n'y a rien à répartir", async () => {
    h.db = baseFictive(tables, table => table === "baux" ? "Indisponible" : undefined);
    const r = await chargerTachesConsommations(h.db as SupabaseClient, org, "/espace/test", "2026-10-28");
    expect(r).toEqual({ taches: [], indisponible: true });
  });
});

describe("lectures complètes", () => {
  it("avance selon les lignes réellement reçues même lorsque l'API plafonne très bas", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const appels: number[] = [];
    const r = await lireCollectionConsommations(async debut => { appels.push(debut); return { data: rows.slice(debut, debut + 2), error: null, count: 5 }; });
    expect(r.data).toEqual(rows); expect(appels).toEqual([0, 2, 4]);
  });
  it("n'affiche aucune liste partielle lorsque les données bougent pendant la lecture", async () => {
    const r = await lireCollectionConsommations(async debut => ({ data: [{ id: String(debut) }], error: null, count: debut ? 2 : 3 }));
    expect(r.error).not.toBeNull(); expect(r.data).toEqual([]);
  });
  it("découpe les grands filtres et refuse le résultat complet si un lot échoue", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => String(i));
    const r = await lireLiensConsommations(ids, async (chunk) => chunk.length < 100 ? { data: null, error: { message: "Erreur" }, count: null } : { data: chunk.map(id => ({ id })), error: null, count: chunk.length });
    expect(r.error).not.toBeNull(); expect(r.data).toEqual([]);
  });
});

const facture = { consommation: 10, periode_debut: "2026-09-01", periode_fin: "2026-10-01" } as FactureFourniture;
const contrat = { categorie: "eau", lot_id: "lot" } as ContratFourniture;
const compteur = { id: "c", lot_id: "lot", type: "eau_froide", unite: "m3", index_initial: 100, date_index_initial: "2026-09-01" } as CompteurConsommation;
const releve = { compteur_id: "c", date_releve: "2026-10-01", index_releve: 110 } as ReleveConsommation;
describe("comparaison et décompte lisible", () => {
  it("respecte la borne commune entre deux factures de consommation", () => {
    expect(debutFactureSuivante("eau", "2026-10-01")).toBe("2026-10-01");
    expect(debutFactureSuivante("teom", "2026-12-31")).toBe("2027-01-01");
  });
  it("montre une comparaison exacte et refuse un total partiel ou des compteurs ambigus", () => {
    expect(comparerFactureReleves(facture, contrat, [compteur], [releve], ["lot"])).toMatchObject({ unite: "m³", bilan: { consommationRelevee: 10, ecart: 0 } });
    expect(comparerFactureReleves(facture, contrat, [compteur], [], ["lot"]).bilan).toBeNull();
    expect(comparerFactureReleves(facture, contrat, [compteur, { ...compteur, id: "chaude", type: "eau_chaude" }], [releve, { ...releve, compteur_id: "chaude" }], ["lot"]).erreur).toMatch(/Plusieurs compteurs/);
    expect(comparerFactureReleves(facture, contrat, [compteur, { ...compteur, id: "ancien", actif: false }], [releve], ["lot"]).bilan?.consommationRelevee).toBe(10);
  });
  it("ne mélange pas le gaz en m³ et les kWh de la facture", () => {
    const gaz = { ...contrat, categorie: "gaz" as const }, m = { ...compteur, type: "gaz" as const };
    expect(comparerFactureReleves(facture, gaz, [m], [releve], ["lot"]).erreur).toMatch(/unité/);
    expect(comparerFactureReleves({ ...facture, unite_consommation: "kwh" }, gaz, [m], [releve], ["lot"]).erreur).toMatch(/unités/);
  });
  it("exporte les frais, écarts, période et référence sans exécuter les noms comme formules", () => {
    const csv = csvRepartitionFourniture({ id: "r", empreinte: "a".repeat(64), facture_id: "f", statut: "validee", validee_le: "2026-10-28", motif: "Clé par chambre", source: { facture: { reference: "FACT2026", periode_debut: "2026-09-01", periode_fin: "2026-10-01" }, ecart_non_reparti_cents: 300, frais_gestion_cents: 20 }, total_recuperable_cents: 1000, total_proprietaire_cents: 320, lignes: [{ lot_id: "lot", bail_id: "b", poids: 1, poids_fixe: 1, variable_cents: 800, fixe_cents: 200, montant_cents: 1000, recuperable: true }] }, [{ id: "lot", nom: " =HYPERLINK(\"url\")" }]);
    expect(csv).toContain("FACT2026"); expect(csv).toContain('"8,00";"2,00";"10,00"'); expect(csv).toContain('"3,00"'); expect(csv).toContain('"0,20"'); expect(csv).toContain('"\' =HYPERLINK');
  });
});
