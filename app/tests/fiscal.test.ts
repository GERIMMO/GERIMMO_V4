/**
 * Récapitulatif fiscal 2044 (S9a) — rangement des écritures du livre par
 * rubrique, agrégé sur la date de pièce. Test unitaire pur.
 */
import { describe, expect, it } from "vitest";
import { estFondsTravauxAlur, recapitulatifFiscal, rubriqueDe } from "../src/lib/fiscal";

describe("Récapitulatif fiscal — rubriques 2044", () => {
  it("range les catégories libres du livre dans les lignes de la 2044", () => {
    expect(rubriqueDe("loyer", "recette")).toBe("211");
    expect(rubriqueDe("Charges récupérables", "recette")).toBe("212");
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
