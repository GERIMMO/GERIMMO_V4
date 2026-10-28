/**
 * Audit final du 27/10, chantier « loyers — écrans et textes » : LOY-03, LOY-07, LOY-08, LOY-12, LOY-13, LOY-14, LOY-15,
 * LOY-18, LOY-20, BAIL-14, BAIL-16, DRT-02 et DRT-03. Sans base.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { phrasePiecesAQualifier, recapitulatifFiscal, type EcritureFiscale, type ExerciceFiscalLot } from "@/lib/fiscal";
import { totauxEcheances } from "@/lib/finances";
import { formaterIndice, ordinalJour } from "@/lib/ged";
import { rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
import { dansEcran, lienPourManquant } from "@/lib/documents/ou-renseigner";
import { classeEcheanceSurRang } from "@/lib/echeances";
import { libelleCategorie } from "@/lib/categories-ecritures";
import { CarteTachesProprietaire } from "@/components/carte-taches-proprietaire";
import type { TacheAccueil } from "@/lib/taches-accueil-proprietaire";
import { contexte } from "./fixtures/contexte-document";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { Fusion } from "@/lib/documents/gabarit";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: vi.fn(), useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [{}, () => {}, false] }));
vi.mock("@/app/actions/fiscalite", () => ({ qualifierPieceFiscale: vi.fn(), enregistrerExerciceFiscal: vi.fn(), retrouverVentilation: vi.fn() }));
vi.mock("@/app/actions/messages", () => ({ envoyerMessageLocataire: vi.fn(), repondreMessagePersonne: vi.fn() }));
const acces = vi.hoisted(() => ({ estProprietaire: true, role: "proprietaire_direct" }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) }, role: acces.role, organisation: { type: acces.estProprietaire ? "proprietaire_direct" : "agence", name: "Org" }, estProprietaire: acces.estProprietaire }),
}));
import { QualificationPiece } from "@/components/formulaires-fiscaux";
import { FilMessages } from "@/app/locataire/[orgId]/contact/fil-messages";
import { CarteMessages } from "@/app/agence/[orgId]/personnes/[personId]/carte-messages";
import PageRepriseComptable from "@/app/agence/[orgId]/comptabilite/reprise/page";

const plat = (texte: string) => texte.replace(/[  ]/g, " ");
const piece = (id: string, categorie: string, montant: number, extra: Partial<EcritureFiscale> = {}): EcritureFiscale =>
  ({ id, categorie, montant, sens: "depense", date_piece: "2026-10-12", lot_id: "lot", ...extra });
const loyer = (id: string, lot = "lot"): EcritureFiscale => piece(id, "loyer", 840, { sens: "recette", lot_id: lot, bail_id: "bail", encaissement_id: `enc-${id}` });
const exercice = (lot = "lot"): [string, ExerciceFiscalLot] => [lot, { lot_id: lot, annee: 2026, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }], justification: "Acte", regularisation230: 0, quote_part230: 100, justification230: "Zéro confirmé" }];
const capture = (ids: string[]) => new Map(ids.map((id) => [id, { ecriture_id: id, loyer_hc: 780, charges: 60, non_ventile: 0 }]));

describe("LOY-03 : les pièces qui attendent l'exercice d'un lot se comptent à part des pièces à qualifier une par une", () => {
  const dix = Array.from({ length: 10 }, (_, i) => loyer(`l${i}`));
  it("sans exercice confirmé : 11 pièces attendent la confirmation du lot, aucune n'est « à qualifier une par une »", () => {
    const r = recapitulatifFiscal([...dix, piece("d1", "taxe_fonciere", 1032)], 2026, { exigerPerimetre: true, composantes: capture(dix.map((e) => e.id!)) });
    expect(r.ecrituresSansExercice).toHaveLength(11);
    expect(r.lotsSansExercice).toEqual(["lot"]);
    expect(r.ecrituresAQualifier).toEqual([]);
    expect(r.incomplet).toBe(true);
    expect(r.aQualifier).toBe(8400 + 1032);
    expect(phrasePiecesAQualifier(r)).toBe("11 pièces attendent la confirmation de l’exercice de leur lot (rubrique « Périodes fiscales et régularisation 230 » : une confirmation par lot, sans qualifier chaque pièce) avant que ce récapitulatif soit complet.");
  });
  it("deux lots sans exercice, une dépense sans lot : les deux compteurs se lisent ensemble", () => {
    const r = recapitulatifFiscal([loyer("a", "lot"), loyer("b", "autre"), piece("d1", "assurance", 180, { lot_id: null })], 2026, { exigerPerimetre: true, composantes: capture(["a", "b"]) });
    expect(r.lotsSansExercice.sort()).toEqual(["autre", "lot"]);
    expect(r.ecrituresAQualifier).toEqual(["d1"]);
    expect(phrasePiecesAQualifier(r)).toBe("2 pièces attendent la confirmation de l’exercice de 2 lots (rubrique « Périodes fiscales et régularisation 230 » : une confirmation par lot, sans qualifier chaque pièce) ; 1 pièce reste à qualifier avant que ce récapitulatif soit complet.");
  });
  it("après la confirmation de l'exercice : les loyers capturés sont comptés, seule la dépense reste à qualifier", () => {
    const r = recapitulatifFiscal([...dix, piece("d1", "taxe_fonciere", 1032)], 2026, { exigerPerimetre: true, composantes: capture(dix.map((e) => e.id!)), exercices: new Map([exercice()]) });
    expect(r.ecrituresSansExercice).toEqual([]);
    expect(r.ecrituresAQualifier).toEqual(["d1"]);
    expect(r.rubriques.find((x) => x.code === "211")!.montant).toBe(7800);
    expect(phrasePiecesAQualifier(r)).toBe("1 pièce reste à qualifier avant que ce récapitulatif soit complet.");
    expect(phrasePiecesAQualifier(recapitulatifFiscal([], 2026, { exigerPerimetre: true }))).toBeNull();
  });
  it("une seule pièce sans exercice : « attend … de son lot »", () => {
    expect(phrasePiecesAQualifier(recapitulatifFiscal([loyer("a")], 2026, { exigerPerimetre: true, composantes: capture(["a"]) }))).toMatch(/^1 pièce attend la confirmation de l’exercice de son lot/);
  });
});

const JOUR = "2026-10-28";
describe("LOY-07 : « Reste dû » ne compte que les échéances atteintes, le terme à échoir se dit à part", () => {
  it("l'exigibilité suit la date d'échéance, pas le statut : un acompte sur un terme à échoir (« partiel ») reste à échoir", () => {
    const t = totauxEcheances([
      { montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05" },
      { montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-10-01" },
      { montant_du: 700, montant_couvert: 0, statut: "attendu", date_echeance: JOUR },
    ], JOUR);
    expect(t).toEqual({ demande: 2100, regle: 400, resteDu: 500, aEchoir: 1200 });
  });
  it("un terme « attendu » sort du reste dû", () => {
    const t = totauxEcheances([
      { montant_du: 1000, montant_couvert: 0, statut: "impaye" }, { montant_du: 900, montant_couvert: 0, statut: "impaye" },
      { montant_du: "710.00", montant_couvert: "0.00", statut: "attendu" }, { montant_du: 500, montant_couvert: 500, statut: "paye" },
      { montant_du: 500, montant_couvert: 0, statut: "impaye" },
    ], JOUR);
    expect(t).toEqual({ demande: 3610, regle: 500, resteDu: 2400, aEchoir: 710 });
  });
  it("au centime, et un trop-perçu ne compte pas deux fois", () => {
    expect(totauxEcheances([{ montant_du: "0.10", montant_couvert: "0.30", statut: "paye" }, { montant_du: "0.20", montant_couvert: 0, statut: "attendu" }], JOUR))
      .toEqual({ demande: 0.3, regle: 0.1, resteDu: 0, aEchoir: 0.2 });
    expect(totauxEcheances([], JOUR)).toEqual({ demande: 0, regle: 0, resteDu: 0, aEchoir: 0 });
  });
});

describe("LOY-12, BAIL-14, LOY-13, BAIL-16 : « 1er » et indices à la française", () => {
  it("ordinalJour et formaterIndice", () => {
    expect([1, 2, 5, 28].map(ordinalJour)).toEqual(["1er", "2", "5", "28"]);
    expect(formaterIndice(145.17)).toBe("145,17");
    expect(formaterIndice("144.50")).toBe("144,50");
    expect(formaterIndice(144.5)).toBe("144,50");
    expect(formaterIndice(null)).toBe("—");
  });
  it("le récapitulatif du bail écrit « Le 1er de chaque mois » et « 145,17 »", () => {
    const lignes = rubriquesRecapBail({ bail: { jour_echeance: 1, revision_irl: true, irl_valeur: 145.17, irl_trimestre: "T3 2025" }, lot: { meuble: false }, bien: {}, personnes: [], liens: { lot: "/l", bien: "/b" } }).flatMap((r) => r.lignes);
    expect(lignes.find((l) => l.champ === "bail.jour_echeance")?.valeur).toBe("Le 1er de chaque mois");
    expect(lignes.find((l) => l.champ === "bail.irl_valeur")?.valeur).toBe("145,17");
    const cinq = rubriquesRecapBail({ bail: { jour_echeance: 5, revision_irl: true, irl_valeur: "144.5" }, lot: {}, bien: {}, personnes: [], liens: { lot: "/l", bien: "/b" } }).flatMap((r) => r.lignes);
    expect(cinq.find((l) => l.champ === "bail.jour_echeance")?.valeur).toBe("Le 5 de chaque mois");
    expect(cinq.find((l) => l.champ === "bail.irl_valeur")?.valeur).toBe("144,50");
    expect(rubriquesRecapBail({ bail: { revision_irl: true }, lot: {}, bien: {}, personnes: [], liens: { lot: "/l", bien: "/b" } }).flatMap((r) => r.lignes).find((l) => l.champ === "bail.irl_valeur")?.valeur).toBeNull();
  });
});

describe("BAIL-14 et BAIL-16 dans les contrats PDF nu et meublé", () => {
  it.each([false, true])("« le 1er de chaque mois » et l'indice « 144,50 » (meublé=%s)", (meuble) => {
    const c = contexte(); c.bail.jour_echeance = 1; c.bail.revision_irl = true; c.bail.irl_valeur = 144.5; c.lot.meuble = meuble;
    const options = { f: new Fusion(), dpeClasse: "D", inventaire: [] };
    const html = plat((meuble ? construireBailMeuble(c, options) : construireBailNu(c, options)).html);
    expect(html).toContain('le <span class="v">1er</span> de chaque mois');
    expect(html).toContain('<span class="v">144,50</span>');
    c.bail.jour_echeance = 5;
    expect(plat((meuble ? construireBailMeuble(c, { ...options, f: new Fusion() }) : construireBailNu(c, { ...options, f: new Fusion() })).html)).toContain('le <span class="v">5</span> de chaque mois');
  });
});

describe("LOY-14 : « Qualifier les pièces » parle comme le livre", () => {
  it("date française, libellé de catégorie, montant en euros", () => {
    const html = plat(renderToStaticMarkup(createElement(QualificationPiece, { orgId: "org", ecriture: { id: "e1", categorie: "taxe_fonciere", sens: "depense", montant: "1032.00", date_piece: "2026-09-15", lot_id: "lot" }, lots: [{ id: "lot", nom: "Lot" }] })));
    expect(html).toContain("15/09/2026 · Taxe foncière · 1 032,00 € — à qualifier");
    expect(html).not.toContain("2026-09-15");
    expect(libelleCategorie("teom")).toBe("Taxe d’enlèvement des ordures ménagères");
    expect(libelleCategorie("frais_divers")).toBe("Frais divers");
  });
});

describe("LOY-15 : l'écran où renseigner, avec son article", () => {
  it("« dans le profil de l’organisation », « dans la fiche du lot »", () => {
    expect(dansEcran(lienPourManquant("commune", "org", [])!.ecran)).toBe("dans le profil de l’organisation");
    expect(dansEcran("fiche du lot")).toBe("dans la fiche du lot");
    expect(dansEcran("fiche de la personne")).toBe("dans la fiche de la personne");
    expect(dansEcran("compléments du contrat")).toBe("dans les compléments du contrat");
  });
});

describe("LOY-08 : l'échéance d'un rang critique prend le jeton lisible sur fond rouge pâle", () => {
  it("seul le rouge vif d'un rang critique change", () => {
    expect(classeEcheanceSurRang({ classe: "text-destructive" }, true)).toBe("text-destructive-soft-foreground");
    expect(classeEcheanceSurRang({ classe: "text-destructive" }, false)).toBe("text-destructive");
    expect(classeEcheanceSurRang({ classe: "text-warning-soft-foreground" }, true)).toBe("text-warning-soft-foreground");
  });
});

describe("LOY-20 : le lien de « Mes tâches » annonce ce que la page « À faire » compte", () => {
  const tache: TacheAccueil = { cle: "t", type: "location", titre: "Préparer la location", detail: null, contexte: "Lot", lieu: "Lot", echeance: null, href: "/espace/org/parc/b/lots/l", geste: "Continuer", nature: "location" };
  const rendre = (totalAFaire?: number) => renderToStaticMarkup(createElement(CarteTachesProprietaire, { taches: [tache], base: "/espace/org", indisponible: false, prioritesPresentes: false, totalAFaire }));
  it("« À faire » avec le compte de la page, plus « Toutes les demandes »", () => {
    const html = rendre(16);
    expect(html).toContain('href="/espace/org/alertes"');
    expect(html).toContain("À faire<span");
    expect(html).toContain('aria-label="16 à traiter">16</span>');
    expect(html).not.toContain("Toutes les demandes");
    expect(rendre(0)).not.toContain("à traiter");
  });
});

describe("LOY-18 : la reprise des comptes n'existe pas chez le propriétaire direct", () => {
  it("l'adresse directe répond « introuvable » au propriétaire, pas à l'agence", async () => {
    acces.estProprietaire = true; acces.role = "proprietaire_direct";
    await expect(PageRepriseComptable({ params: Promise.resolve({ orgId: "org" }) } as never)).rejects.toThrow("notFound");
    acces.estProprietaire = false; acces.role = "admin_agence";
    const html = renderToStaticMarkup(await PageRepriseComptable({ params: Promise.resolve({ orgId: "org" }) } as never));
    expect(html).toContain("Reprendre mes comptes");
  });
});

describe("DRT-02 et DRT-03 : les bulles de messages coupent les mots sans espace et gardent les retours à la ligne", () => {
  const texte = "ligne 1\nligne 2\n\nParagraphe 2";
  it("fil du locataire", () => {
    const html = renderToStaticMarkup(createElement(FilMessages, { orgId: "org", agence: "Agence", messages: [{ id: "m", auteur: "locataire", texte, cree_le: "2026-10-27T10:00:00Z" }] }));
    expect(html).toMatch(/class="min-w-0 max-w-\[88%\][^"]*\[overflow-wrap:anywhere\]/);
    expect(html).toContain('<p class="whitespace-pre-wrap">ligne 1\nligne 2\n\nParagraphe 2</p>');
    expect(html).toContain('class="loc-carte min-w-0"');
  });
  it("carte Messages de la fiche personne", () => {
    const html = renderToStaticMarkup(createElement(CarteMessages, { orgId: "org", personId: "p", prenom: "Alice", messages: [{ id: "m", auteur: "locataire", texte, cree_le: "2026-10-27T10:00:00Z" }] }));
    expect(html).toMatch(/class="min-w-0 max-w-\[85%\][^"]*\[overflow-wrap:anywhere\]/);
    expect(html).toContain('<p class="whitespace-pre-wrap">ligne 1\nligne 2\n\nParagraphe 2</p>');
  });
});
