/**
 * Récapitulatif fiscal 2044 (S9a) — rangement des écritures du livre par
 * rubrique, agrégé sur la date de pièce. Test unitaire pur.
 */
import { describe, expect, it } from "vitest";
import {
  estFondsTravauxAlur,
  recapitulatifFiscal,
  rubriqueDe,
  ventilerLoyer,
} from "../src/lib/fiscal";

describe("Récapitulatif fiscal — rubriques 2044", () => {
  it("range les catégories libres du livre dans les lignes de la 2044", () => {
    expect(rubriqueDe("loyer", "recette")).toBe("211");
    // Audit 29/09 : les charges remboursées par le locataire sortent de la 2044
    expect(rubriqueDe("Charges récupérables", "recette")).toBe("hors");
    expect(rubriqueDe("TEOM 2026", "depense")).toBe("hors");
    expect(rubriqueDe("Assurance PNO", "depense")).toBe("223");
    expect(rubriqueDe("Travaux plomberie", "depense")).toBe("224");
    expect(rubriqueDe("Taxe foncière", "depense")).toBe("227");
    expect(rubriqueDe("Appel de charges copropriété", "depense")).toBe("229");
    expect(rubriqueDe("honoraires", "depense")).toBe("221");
    // Une catégorie inconnue ne disparaît pas : elle tombe dans « autres »
    expect(rubriqueDe("divers", "depense")).toBe("autres");
    // Toute recette non reconnue est un loyer (recette brute)
    expect(rubriqueDe("divers", "recette")).toBe("211");
  });

  it("met le fonds travaux ALUR à part, hors charges déductibles", () => {
    expect(estFondsTravauxAlur("Fonds travaux ALUR")).toBe(true);
    expect(estFondsTravauxAlur("travaux toiture")).toBe(false);
    const recap = recapitulatifFiscal(
      [
        { categorie: "loyer", sens: "recette", montant: 800, date_piece: "2026-03-01" },
        { categorie: "Fonds travaux ALUR", sens: "depense", montant: 120, date_piece: "2026-03-15" },
        { categorie: "travaux toiture", sens: "depense", montant: 300, date_piece: "2026-04-15" },
      ],
      2026
    );
    expect(recap.fondsTravauxAlur).toBe(120);
    expect(recap.totalCharges).toBe(300);
    expect(recap.revenuNet).toBe(500);
  });

  it("agrège sur la date de pièce et ignore les autres années", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "loyer", sens: "recette", montant: "700.50", date_piece: "2025-12-31" },
        { categorie: "loyer", sens: "recette", montant: 700.5, date_piece: "2026-01-05" },
        { categorie: "loyer", sens: "recette", montant: 700.5, date_piece: "2026-02-05" },
        { categorie: "assurance", sens: "depense", montant: 99.99, date_piece: "2026-02-10" },
      ],
      2026
    );
    expect(recap.nbEcritures).toBe(3);
    expect(recap.totalRecettes).toBe(1401);
    expect(recap.totalCharges).toBe(99.99);
    expect(recap.revenuNet).toBe(1301.01);
  });

  it("laisse les intérêts d'emprunt à compléter et n'affiche « autres » que si nécessaire", () => {
    const vide = recapitulatifFiscal([], 2026);
    const interets = vide.rubriques.find((r) => r.code === "250");
    expect(interets?.aCompleter).toBe(true);
    expect(vide.rubriques.some((r) => r.code === "—")).toBe(false);

    const avecAutres = recapitulatifFiscal(
      [{ categorie: "divers", sens: "depense", montant: 10, date_piece: "2026-06-01" }],
      2026
    );
    const autres = avecAutres.rubriques.find((r) => r.code === "—");
    expect(autres?.montant).toBe(10);
    expect(autres?.categories).toEqual(["divers"]);
  });

  it("une contre-écriture annule sa ligne d'origine dans la rubrique", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "travaux", sens: "depense", montant: 250, date_piece: "2026-05-02" },
        { categorie: "travaux", sens: "recette", montant: 250, date_piece: "2026-05-02", contre_ecriture_de: "x" },
      ],
      2026
    );
    // Sens inversé, mais soustraite de SA rubrique (224) — pas ajoutée aux loyers
    expect(recap.rubriques.find((r) => r.code === "224")?.montant).toBe(0);
    expect(recap.rubriques.find((r) => r.code === "211")?.montant).toBe(0);
    expect(recap.revenuNet).toBe(0);
  });
});

// ——— Ventilation par quote-part et meublé hors récapitulatif (05/09) ———
describe("recapitulatifFiscal — quote-part et meublé (BIC)", () => {
  const ecritures = [
    { categorie: "Loyers", sens: "recette", montant: 1000, date_piece: "2025-03-01", lot_id: "indiv" },
    { categorie: "Taxe foncière", sens: "depense", montant: 400, date_piece: "2025-10-01", lot_id: "indiv" },
    { categorie: "Loyers", sens: "recette", montant: 500, date_piece: "2025-04-01", lot_id: "plein" },
    { categorie: "Loyers", sens: "recette", montant: 900, date_piece: "2025-05-01", lot_id: "meuble" },
    { categorie: "Entretien", sens: "depense", montant: 100, date_piece: "2025-06-01", lot_id: "meuble" },
    // Sans lot : compte à 100 %
    { categorie: "Assurance PNO", sens: "depense", montant: 200, date_piece: "2025-07-01" },
  ];
  const options = {
    quoteParts: new Map([["indiv", 50]]),
    lotsMeubles: new Set(["meuble"]),
  };
  const recap = recapitulatifFiscal(ecritures, 2025, options);

  it("applique la quote-part du déclarant rubrique par rubrique", () => {
    // Totaux pleins : 1000 + 500 = 1500 de recettes ; quote-part : 500 + 500
    expect(recap.totalRecettes).toBe(1500);
    expect(recap.totalRecettesQuotePart).toBe(1000);
    // Taxe foncière à 50 %, assurance sans lot à 100 %
    expect(recap.totalCharges).toBe(600);
    expect(recap.totalChargesQuotePart).toBe(400);
    expect(recap.revenuNetQuotePart).toBe(600);
    expect(recap.ventile).toBe(true);
  });

  it("tient le meublé hors récapitulatif et le totalise à part (BIC)", () => {
    expect(recap.meuble).toEqual({ recettes: 900, depenses: 100, nbEcritures: 2 });
    // Aucune écriture du lot meublé dans les rubriques 2044
    expect(recap.nbEcritures).toBe(4);
  });

  it("reste inchangé sans options (compatibilité)", () => {
    const sans = recapitulatifFiscal(ecritures, 2025);
    expect(sans.ventile).toBe(false);
    expect(sans.totalRecettes).toBe(2400);
    expect(sans.totalRecettesQuotePart).toBe(2400);
    expect(sans.meuble.nbEcritures).toBe(0);
  });
});

// ——— Ventilation loyer / charges des encaissements (audit du 09/09, P1) ———
// L'écriture d'encaissement porte le montant total (loyer + provision) : la
// part charges se reconstitue au prorata du bail, reliquat de centime en 211.
// Audit gestion du 29/09 : cette part charges n'est PAS un revenu foncier —
// elle sort des recettes (chargesRecuperees), la ligne 212 reste à zéro.
describe("recapitulatifFiscal — ventilation loyers/charges (211 / hors 2044)", () => {
  const cle = new Map([["bail-1", { loyerHc: 780, charges: 60 }]]);
  const ligne = (recap: ReturnType<typeof recapitulatifFiscal>, code: string) =>
    recap.rubriques.find((r) => r.code === code)?.montant;

  it("ventile les mensualités soldées au prorata du bail (780 + 60)", () => {
    const mois = ["2026-01-05", "2026-02-05", "2026-03-05"].map((d) => ({
      categorie: "loyer",
      sens: "recette",
      montant: 840,
      date_piece: d,
      bail_id: "bail-1",
    }));
    const recap = recapitulatifFiscal(mois, 2026, { ventilationLoyers: cle });
    expect(ligne(recap, "211")).toBe(2340);
    expect(ligne(recap, "212")).toBe(0);
    // 211 + charges récupérées se réconcilie exactement avec le total encaissé
    expect(recap.chargesRecuperees).toBe(180);
    expect(recap.totalRecettes).toBe(2340);
  });

  it("ventile un paiement partiel, reliquat de centime en 211", () => {
    // 100 × 60/840 = 7,142857… → 7,14 en 212, 92,86 en 211 (somme = 100)
    expect(ventilerLoyer(100, 780, 60)).toEqual({ part211: 92.86, part212: 7.14 });
    const recap = recapitulatifFiscal(
      [{ categorie: "loyer", sens: "recette", montant: 100, date_piece: "2026-04-10", bail_id: "bail-1" }],
      2026,
      { ventilationLoyers: cle }
    );
    expect(ligne(recap, "211")).toBe(92.86);
    expect(recap.chargesRecuperees).toBe(7.14);
    expect(recap.totalRecettes).toBe(92.86);
  });

  it("sans clé de ventilation, ou sans charges au bail, tout reste en 211", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "loyer", sens: "recette", montant: 840, date_piece: "2026-05-05", bail_id: "inconnu" },
        { categorie: "loyer", sens: "recette", montant: 500, date_piece: "2026-05-06", bail_id: "bail-hc" },
      ],
      2026,
      { ventilationLoyers: new Map([["bail-hc", { loyerHc: 500, charges: 0 }]]) }
    );
    expect(ligne(recap, "211")).toBe(1340);
    expect(ligne(recap, "212")).toBe(0);
  });

  it("l'annulation d'un encaissement se ventile comme son origine et s'annule", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "loyer", sens: "recette", montant: 100, date_piece: "2026-06-05", bail_id: "bail-1" },
        { categorie: "loyer", sens: "depense", montant: 100, date_piece: "2026-06-06", bail_id: "bail-1", contre_ecriture_de: "x" },
      ],
      2026,
      { ventilationLoyers: cle }
    );
    expect(ligne(recap, "211")).toBe(0);
    expect(ligne(recap, "212")).toBe(0);
    expect(recap.totalRecettes).toBe(0);
  });

  it("applique la quote-part du déclarant aux deux parts ventilées", () => {
    const recap = recapitulatifFiscal(
      [{ categorie: "loyer", sens: "recette", montant: 840, date_piece: "2026-07-05", bail_id: "bail-1", lot_id: "indiv" }],
      2026,
      { ventilationLoyers: cle, quoteParts: new Map([["indiv", 50]]) }
    );
    expect(recap.rubriques.find((r) => r.code === "211")?.montantQuotePart).toBe(390);
    expect(recap.rubriques.find((r) => r.code === "212")?.montantQuotePart).toBe(0);
    expect(recap.chargesRecuperees).toBe(60);
  });
});

// ——— Audit gestion du 29/09 : charges récupérables et TEOM hors 2044 ———
describe("recapitulatifFiscal — charges récupérables, TEOM, copropriété", () => {
  const ligne = (recap: ReturnType<typeof recapitulatifFiscal>, code: string) =>
    recap.rubriques.find((r) => r.code === code)?.montant;

  it("une régularisation de charges encaissée n'est pas une recette", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "loyer", sens: "recette", montant: 700, date_piece: "2026-02-05" },
        { categorie: "Régularisation de charges 2025", sens: "recette", montant: 120, date_piece: "2026-03-01" },
      ],
      2026
    );
    expect(recap.totalRecettes).toBe(700);
    expect(recap.chargesRecuperees).toBe(120);
  });

  it("la TEOM sort de la ligne 227 : seule la taxe foncière se déduit", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "Taxe foncière", sens: "depense", montant: 900, date_piece: "2026-10-15" },
        { categorie: "TEOM", sens: "depense", montant: 150, date_piece: "2026-10-15" },
        { categorie: "Taxe d'enlèvement des ordures ménagères", sens: "depense", montant: 50, date_piece: "2026-10-15" },
      ],
      2026
    );
    expect(ligne(recap, "227")).toBe(900);
    expect(recap.teomExclue).toBe(200);
    expect(recap.totalCharges).toBe(900);
  });

  it("ligne 229 : seule la part non récupérable des charges de copropriété se déduit", () => {
    const recap = recapitulatifFiscal(
      [
        { categorie: "Appel de charges copropriété", sens: "depense", montant: 1000, date_piece: "2026-01-10", lot_id: "lot-1" },
        { categorie: "Appel de charges copropriété", sens: "depense", montant: 300, date_piece: "2026-01-10", lot_id: "lot-2" },
      ],
      2026,
      { chargesCoproRecuperables: new Map([["lot-1", 600], ["lot-2", 500]]) }
    );
    // lot-1 : 1 000 − 600 ; lot-2 : la part récupérable ne rend pas la ligne négative
    expect(ligne(recap, "229")).toBe(400);
    expect(recap.coproRecuperableExclue).toBe(900);
  });

  it("les libellés de lignes suivent la notice 2044", () => {
    const vide = recapitulatifFiscal([], 2026);
    expect(vide.rubriques.find((r) => r.code === "212")?.libelle).toMatch(/par convention à la charge des locataires/);
    expect(vide.rubriques.find((r) => r.code === "227")?.libelle).toMatch(/hors TEOM/);
    expect(vide.rubriques.find((r) => r.code === "229")?.libelle).toMatch(/non récupérable/);
  });
});
