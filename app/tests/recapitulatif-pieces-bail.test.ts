import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { lireRecapitulatifPiecesBail } from "@/lib/recapitulatif-pieces-bail";

type Ligne = Record<string, unknown>;
type Filtres = { methode: string; cle: string; valeur: unknown }[];
const ORG = "org", BAIL = "bail", LOT = "lot", BIEN = "bien", JOUR = "2026-10-27";
function fichier(id: string, changements: Ligne = {}): Ligne {
  return { id, organization_id: ORG, titre: id, type: "justificatif", created_at: "2026-10-01T12:00:00Z", expire_le: "2027-10-27", purged_at: null,
    mime_type: "application/pdf", storage_path: `${ORG}/${id}.pdf`, empreinte: "empreinte", versions: [], ...changements };
}
function diagnostic(id: string, type: string, changements: Ligne = {}): Ligne {
  return { id, organization_id: ORG, lot_id: type === "erp" ? null : LOT, bien_id: BIEN, type, date_realisation: "2026-10-01", date_expiration: "2027-10-27",
    document_id: id, classe_dpe: type === "dpe" ? "D" : null, archived_at: null, ...changements };
}
function fixture() {
  const donnees: Record<string, Ligne[]> = {
    baux: [{ id: BAIL, organization_id: ORG, lot_id: LOT, type: "nu", date_debut: "2026-11-01", reglement_copropriete: "reglement" }],
    lots: [{ id: LOT, organization_id: ORG, bien_id: BIEN, meuble: false }],
    biens: [{ id: BIEN, organization_id: ORG, type: "appartement", annee_construction: 2010, copropriete: true }],
    diagnostics: [diagnostic("dpe", "dpe"), diagnostic("erp", "erp")],
    document_liens: [{ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: "notice" }],
    qualifications_diagnostics_lot: [
      { organization_id: ORG, lot_id: LOT, type: "gaz", situation: "absente", date_installation: null },
      { organization_id: ORG, lot_id: LOT, type: "electricite", situation: "annee_connue", date_installation: null, annee_installation: 2020 },
    ],
    pieces_attendues_bail: [
      { organization_id: ORG, lot_id: LOT, bail_id: null, nature: "assurance_proprietaire", document_id: "pno" },
      { organization_id: ORG, lot_id: LOT, bail_id: BAIL, nature: "assurance_locataire", document_id: "locataire" },
    ],
    inventaire_lignes: [], bail_personnes: [], etats_des_lieux: [], bail_signature_circuits: [],
    documents: [fichier("notice", { type: "courrier", titre: "Notice d'information (annexe au bail)" }), fichier("reglement"), fichier("dpe"), fichier("erp"), fichier("pno"), fichier("locataire")],
  };
  const echecs = new Set<string>();
  const appels: { table: string; champs: string; filtres: Filtres }[] = [];
  const db = { from: (table: string) => {
    const appel = { table, champs: "", filtres: [] as Filtres };
    appels.push(appel);
    let unSeul = false, limite = Infinity;
    const q = {
      select: (champs: string) => { appel.champs = champs; return q; },
      eq: (cle: string, valeur: unknown) => { appel.filtres.push({ methode: "eq", cle, valeur }); return q; },
      is: (cle: string, valeur: unknown) => { appel.filtres.push({ methode: "is", cle, valeur }); return q; },
      in: (cle: string, valeur: unknown[]) => { appel.filtres.push({ methode: "in", cle, valeur }); return q; },
      order: () => q,
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: () => { unSeul = true; return q; },
      then: (resoudre: (r: { data: Ligne | Ligne[] | null; error: unknown }) => unknown) => {
        if (echecs.has(table)) return Promise.resolve(resoudre({ data: null, error: new Error("Lecture refusée") }));
        const lignes = (donnees[table] ?? []).filter(l => appel.filtres.every(f => f.methode === "in" ? (f.valeur as unknown[]).includes(l[f.cle]) : l[f.cle] === f.valeur)).slice(0, limite);
        return Promise.resolve(resoudre({ data: unSeul ? lignes[0] ?? null : lignes, error: null }));
      },
    };
    return q;
  } };
  const lire = (proprietaire = true) => lireRecapitulatifPiecesBail(db as unknown as SupabaseClient, { orgId: ORG, bailId: BAIL, estProprietaire: proprietaire, aujourdhui: JOUR });
  return { donnees, echecs, appels, lire, db };
}
function piece(resultat: Awaited<ReturnType<typeof lireRecapitulatifPiecesBail>>, id: string) {
  const ligne = resultat.pieces.find(p => p.id === id);
  expect(ligne, `Pièce attendue : ${id}`).toBeDefined();
  return ligne!;
}

describe("Récapitulatif des pièces du bail", () => {
  it("distingue pièces présentes, installation non concernée et formalités d’entrée, sous le bon espace", async () => {
    const f = fixture(); const r = await f.lire();
    expect(r.erreur).toBeUndefined();
    expect(piece(r, "notice")).toMatchObject({ statut: "pret", moment: "signature", href: "/espace/org/baux/bail#annexes-attendues" });
    expect(piece(r, "diagnostic-lot:gaz").statut).toBe("non_concerne");
    expect(piece(r, "diagnostic-lot:electricite").statut).toBe("non_concerne");
    expect(piece(r, "assurance_locataire")).toMatchObject({ statut: "pret", moment: "entree" });
    expect(piece(r, "assurance_proprietaire").moment).toBe("gestion");
    expect(piece(r, "edl-entree")).toMatchObject({ statut: "a_completer", moment: "entree" });
    expect(r).not.toHaveProperty("pretASigner");
    expect(piece(await f.lire(false), "notice").href).toBe("/agence/org/baux/bail#annexes-attendues");
  });
  it("borne chaque lecture à l’organisation et s’arrête si le bail ou le lot n’est pas accessible", async () => {
    const f = fixture(); await f.lire();
    for (const appel of f.appels) expect(appel.filtres).toContainEqual({ methode: "eq", cle: "organization_id", valeur: ORG });
    expect(f.appels.find(a => a.table === "bail_signature_circuits")!.champs).not.toMatch(/signataires|secret|url/);
    const autre = fixture(); autre.donnees.baux[0].organization_id = "autre";
    expect((await autre.lire()).erreur).toBeTruthy(); expect(autre.appels).toHaveLength(1);
    const lot = fixture(); lot.echecs.add("lots");
    expect((await lot.lire()).pieces.every(p => p.statut === "a_verifier")).toBe(true);
    expect(lot.appels.map(a => a.table)).toEqual(["baux", "lots"]);
  });
  it("un règlement référencé mais purgé, absent ou non PDF n’est pas prêt", async () => {
    const f = fixture(); f.donnees.documents.find(d => d.id === "reglement")!.purged_at = JOUR;
    expect(piece(await f.lire(), "reglement").statut).toBe("a_completer");
    f.donnees.documents = f.donnees.documents.filter(d => d.id !== "reglement");
    expect(piece(await f.lire(), "reglement").statut).toBe("a_verifier");
    f.donnees.documents.push(fichier("reglement", { mime_type: "image/png" }));
    expect(piece(await f.lire(), "reglement").detail).toContain("PDF");
  });
  it("réutilise la notice exacte la plus récente sans assimiler une pièce quelconque à une notice", async () => {
    const f = fixture(); f.donnees.documents.find(d => d.id === "notice")!.titre = "Une notice personnelle";
    expect(piece(await f.lire(), "notice").statut).toBe("a_completer");
    f.donnees.documents.push(fichier("notice2", { titre: "Notice d'information (annexe au bail)", type: "courrier", created_at: "2026-10-25", mime_type: "image/jpeg" }));
    f.donnees.document_liens.push({ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: "notice2" });
    expect(piece(await f.lire(), "notice").detail).toContain("PDF");
  });
  it("garde le dernier diagnostic, même incomplet, et contrôle l’expiration à la future entrée", async () => {
    const f = fixture();
    f.donnees.diagnostics.push(diagnostic("dpe-recent", "dpe", { date_realisation: "2026-10-26", document_id: null }));
    expect(piece(await f.lire(), "diagnostic-lot:dpe").statut).toBe("a_completer");
    f.donnees.diagnostics.pop(); f.donnees.diagnostics.find(d => d.type === "dpe")!.date_expiration = "2026-10-31";
    expect(piece(await f.lire(), "diagnostic-lot:dpe")).toMatchObject({ statut: "a_completer", detail: "À renouveler avant l’entrée" });
  });
  it("ne transforme ni une qualification inconnue ni une erreur de lecture en dispense ou document manquant", async () => {
    const f = fixture(); f.donnees.qualifications_diagnostics_lot = [];
    expect(piece(await f.lire(), "diagnostic-lot:gaz").statut).toBe("a_verifier");
    f.echecs.add("diagnostics");
    const r = await f.lire(); expect(r.erreur).toBeTruthy();
    expect(piece(r, "diagnostic-lot:dpe").statut).toBe("a_verifier");
    f.echecs.add("qualifications_diagnostics_lot");
    expect(piece(await f.lire(), "diagnostics-contexte").statut).toBe("a_verifier");
  });
  it("un rapport électricité ou gaz enregistré se montre même si l’ancienneté de l’installation reste à préciser (BAIL-25)", async () => {
    const f = fixture(); f.donnees.qualifications_diagnostics_lot = [];
    f.donnees.diagnostics.push(diagnostic("elec", "electricite"));
    f.donnees.documents.push(fichier("elec"));
    const elec = piece(await f.lire(), "diagnostic-lot:electricite");
    expect(elec.detail).not.toMatch(/ancienneté/);
    // Sans rapport, l’ancienneté reste demandée.
    expect(piece(await f.lire(), "diagnostic-lot:gaz")).toMatchObject({ statut: "a_verifier" });
  });
  it("l’amiante reste à disposition, et une année inconnue demande précision", async () => {
    const f = fixture(); f.donnees.biens[0].annee_construction = 1930;
    expect(piece(await f.lire(), "diagnostic-lot:amiante_privatif").moment).toBe("gestion");
    expect(piece(await f.lire(), "diagnostic-lot:plomb")).toMatchObject({ moment: "signature", statut: "a_completer" });
    f.donnees.biens[0].annee_construction = null;
    expect(piece(await f.lire(), "diagnostic-lot:plomb").statut).toBe("a_verifier");
  });
  it("n’emprunte pas l’assurance d’un autre bail et ne déduit pas le rôle du titre du fichier", async () => {
    const f = fixture(); f.donnees.pieces_attendues_bail[1].bail_id = "autre-bail";
    f.donnees.document_liens.push({ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: "locataire" });
    f.donnees.documents.find(d => d.id === "locataire")!.titre = "Attestation assurance habitation du locataire";
    expect(piece(await f.lire(), "assurance_locataire").statut).toBe("a_completer");
    expect(piece(await f.lire(), "assurance_proprietaire").statut).toBe("pret");
  });
  it("distingue assurance propriétaire facultative, copropriété inconnue et erreur", async () => {
    const f = fixture(); f.donnees.pieces_attendues_bail = [];
    f.donnees.biens[0].copropriete = false;
    expect(piece(await f.lire(), "assurance_proprietaire").statut).toBe("non_concerne");
    expect(piece(await f.lire(), "reglement").statut).toBe("non_concerne");
    f.donnees.biens[0].copropriete = null;
    expect(piece(await f.lire(), "assurance_proprietaire").statut).toBe("a_verifier");
    f.echecs.add("biens"); expect(piece(await f.lire(), "assurance_proprietaire").statut).toBe("a_verifier");
  });
  it("une assurance remplacée, expirant avant l’entrée ou sans échéance reste à corriger/vérifier", async () => {
    const f = fixture(); const doc = f.donnees.documents.find(d => d.id === "locataire")!;
    doc.expire_le = "2026-10-31";
    expect(piece(await f.lire(), "assurance_locataire")).toMatchObject({ statut: "a_completer", detail: "À renouveler avant l’entrée" });
    doc.expire_le = null; expect(piece(await f.lire(), "assurance_locataire").statut).toBe("a_verifier");
    doc.expire_le = "2028-01-01"; doc.versions = [{ id: "remplacement" }];
    expect(piece(await f.lire(), "assurance_locataire").detail).toContain("version");
  });
  it("n’annonce pas la validité à une entrée encore inconnue", async () => {
    const f = fixture(); f.donnees.baux[0].date_debut = null;
    const r = await f.lire();
    expect(piece(r, "diagnostic-lot:dpe").statut).toBe("a_verifier");
    expect(piece(r, "assurance_locataire").statut).toBe("a_verifier");
    expect(piece(r, "notice").statut).toBe("pret");
    expect(r.erreur).toBeUndefined();
  });
  it("prévoit le mobilier seulement pour le meublé, sans certifier un inventaire complet avec une ligne", async () => {
    const f = fixture(); expect((await f.lire()).pieces.some(p => p.id === "inventaire")).toBe(false);
    f.donnees.baux[0].type = "colocation"; f.donnees.lots[0].meuble = true;
    expect(piece(await f.lire(), "inventaire").statut).toBe("a_completer");
    f.donnees.inventaire_lignes.push({ id: "i", organization_id: ORG, bail_id: BAIL, designation: "Table", quantite: 1, etat: "bon" });
    expect(piece(await f.lire(), "inventaire")).toMatchObject({ statut: "a_verifier", href: "/espace/org/baux/bail#inventaire" });
  });
  it("contrôle un acte distinct par garant ; seul un circuit terminé avec archive réelle est prêt", async () => {
    const f = fixture(); f.donnees.bail_personnes = ["g1", "g2"].map(person_id => ({ organization_id: ORG, bail_id: BAIL, person_id, role: "garant" }));
    f.donnees.bail_signature_circuits = [
      { organization_id: ORG, bail_id: BAIL, cible_id: BAIL, modele: "cautionnement", garant: "g1", etat: "termine", document_id: "original", document_signe: "signe", created_at: "2026-10-26" },
      { organization_id: ORG, bail_id: BAIL, cible_id: BAIL, modele: "cautionnement", garant: "g2", etat: "pret", document_id: "original2", document_signe: null, created_at: "2026-10-26" },
    ];
    f.donnees.documents.push(fichier("original"), fichier("signe"), fichier("original2"));
    let r = await f.lire(); expect(piece(r, "cautionnement-g1").statut).toBe("pret"); expect(piece(r, "cautionnement-g2").statut).toBe("a_verifier");
    f.donnees.documents.find(d => d.id === "signe")!.purged_at = JOUR;
    r = await f.lire(); expect(piece(r, "cautionnement-g1").statut).toBe("a_completer");
    f.donnees.documents.find(d => d.id === "signe")!.purged_at = null;
    f.donnees.bail_signature_circuits[0].essai = true;
    expect(piece(await f.lire(), "cautionnement-g1")).toMatchObject({ statut: "a_verifier", detail: "Signature de test. Vérifiez l’acte signé définitif." });
  });
  it("lie directement l’état des lieux existant et conserve son statut d’entrée", async () => {
    const f = fixture(); f.donnees.etats_des_lieux.push({ id: "edl", organization_id: ORG, bail_id: BAIL, type: "entree", etat: "signe" });
    expect(piece(await f.lire(), "edl-entree")).toMatchObject({ statut: "pret", moment: "entree", href: "/espace/org/baux/bail/edl/edl" });
    f.echecs.add("etats_des_lieux"); expect(piece(await f.lire(), "edl-entree").statut).toBe("a_verifier");
  });
  it("une lecture tronquée ou refusée de fichiers ne donne jamais de pièces prêtes", async () => {
    const f = fixture(); f.echecs.add("documents");
    const r = await f.lire(); expect(r.erreur).toBeTruthy();
    expect(piece(r, "notice").statut).toBe("a_verifier"); expect(piece(r, "diagnostic-lot:dpe").statut).toBe("a_verifier");
    const plein = fixture(); plein.donnees.document_liens = Array.from({ length: 1000 }, (_, i) => ({ organization_id: ORG, entite: "bail", entite_id: BAIL, document_id: `doc-${i}` }));
    expect(piece(await plein.lire(), "notice").statut).toBe("a_verifier");
  });
  it("ne signale que les erreurs de lectures pertinentes pour le bail", async () => {
    const f = fixture(); f.echecs.add("inventaire_lignes"); f.echecs.add("bail_signature_circuits");
    expect((await f.lire()).erreur).toBeUndefined();
    // La même lecture devient utile dès que le contrat comporte du mobilier.
    f.donnees.baux[0].type = "meuble";
    const meuble = await f.lire();
    expect(meuble.erreur).toBeTruthy(); expect(piece(meuble, "inventaire").statut).toBe("a_verifier");
    f.donnees.baux[0].type = "nu";
    f.donnees.bail_personnes.push({ organization_id: ORG, bail_id: BAIL, person_id: "garant", role: "garant" });
    const avecGarant = await f.lire();
    expect(avecGarant.erreur).toBeTruthy(); expect(piece(avecGarant, "cautionnement-garant").statut).toBe("a_verifier");
  });
  it("un fichier ancien illisible ne rend pas le rapport courant indisponible", async () => {
    const f = fixture(); f.donnees.diagnostics.push(diagnostic("dpe-ancien", "dpe", { date_realisation: "2020-01-01" }));
    const r = await f.lire();
    expect(piece(r, "diagnostic-lot:dpe").statut).toBe("pret");
    expect(r.erreur).toBeUndefined();
  });
});
