import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LignesDevis } from "../src/app/artisan/lignes-devis";
import { assemblerDevisArtisan, type DevisArtisanDocument } from "../src/lib/documents/devis-artisan";
import {
  calculerDevis, descriptionDevisLisible, erreurPrixSaisi, erreurQuantiteSaisie, libelleQuantite, libelleTauxTva, lireQuantite, montantEnCentimes,
} from "../src/lib/devis-structure";

// ART-11 : quantité et taux de TVA en typographie française (virgule), comme
// les montants et le sélecteur de TVA, sur le PDF et dans le détail du propriétaire.
const calcul = calculerDevis([{ libelle: "Main-d’œuvre", quantite: 2.5, prix_unitaire_ht_cents: 5840, tva_bps: 550 }]);
const doc: DevisArtisanDocument = {
  id: "11111111-1111-1111-1111-111111111111", description: "Travaux", ...calcul, diagnostic: "Joint endommagé",
  delai_intervention: "Sous cinq jours", duree_estimee: "Une journée", contraintes: null, observations: null,
  statut: "valide", depose_le: "2026-10-01", valide_jusqu_au: "2026-11-01", artisan_nom: "Plomberie de démonstration",
  artisan_siret: "12345678900012", artisan_telephone: null, artisan_email: null, agence_nom: "Parc de démonstration",
  incident_numero: "INC-2026-123", commune: "Paris", code_postal: "75001",
};

describe("ART-11 : nombres du devis en français", () => {
  it("écrit la quantité et le taux avec une virgule", () => {
    expect(libelleQuantite(2.5)).toBe("2,5");
    expect(libelleQuantite(1)).toBe("1");
    expect(libelleQuantite(0.125)).toBe("0,125");
    expect(libelleTauxTva(550)).toBe("5,5 %");
    expect(libelleTauxTva(210)).toBe("2,1 %");
    expect(libelleTauxTva(1000)).toBe("10 %");
    expect(libelleTauxTva(0)).toBe("0 %");
  });

  it("le PDF du devis n’écrit ni « 2.5 » ni « 5.5 % »", () => {
    const { html } = assemblerDevisArtisan(doc);
    expect(html).toContain("<td class=\"d\">2,5</td>");
    expect(html).toContain("5,5 %");
    expect(html).not.toContain(">2.5<");
    expect(html).not.toContain("5.5 %");
  });

  it("le détail lu par le propriétaire convertit la quantité de la description SQL", () => {
    // Forme exacte produite par deposer_devis_structure (numeric rendu en texte).
    const brut = "Remplacement : 2.5 × 58.40000000000000000000 € HT — TVA 10.00000000000000000000 % — 160.60000000000000000000 € TTC";
    expect(descriptionDevisLisible(brut)).toBe("Remplacement : 2,5 × 58,40 € HT — TVA 10,00 % — 160,60 € TTC");
    // Une quantité entière reste inchangée ; un libellé sans nombre aussi.
    expect(descriptionDevisLisible("Joint : 2 × 1.25000000000 € HT — TVA 5.50000000 % — 2.64000000 € TTC"))
      .toBe("Joint : 2 × 1,25 € HT — TVA 5,50 % — 2,64 € TTC");
    // Zéros de fin d'un numeric rendu en texte : « 2.500 » se lit « 2,5 », « 3.000 » se lit « 3 ».
    expect(descriptionDevisLisible("A : 2.500 × 1.00000 € HT")).toContain("A : 2,5 × ");
    expect(descriptionDevisLisible("B : 3.000 × 1.00000 € HT")).toContain("B : 3 × ");
  });
});

// ART-12 : une saisie invalide dit quel champ est en cause et pourquoi.
describe("ART-12 : erreurs de champ du détail du devis", () => {
  it.each([
    ["0", /supérieure à zéro/],
    ["-5", /supérieure à zéro/],
    ["abc", /nombre/],
    ["1,2345", /trois décimales/],
    ["2000000", /1 000 000/],
    // D04 (1), VER-TS-02 : la quantité se lit comme un montant, jamais par Number() (« 1e2 » valait 100).
    ["1e2", /nombre/],
    ["0x10", /nombre/],
    ["Infinity", /nombre/],
    ["1 5", /nombre/],
    ["2,5,1", /nombre/],
  ])("quantité %s", (brut, attendu) => {
    expect(erreurQuantiteSaisie(brut)).toMatch(attendu);
  });

  it.each([
    ["12,345", /deux décimales/],
    ["-5", /négatif/],
    ["abc", /montant en euros/],
    ["99999999", /dépasser/],
  ])("prix %s", (brut, attendu) => {
    expect(erreurPrixSaisi(brut)).toMatch(attendu);
  });

  it.each(["1", "2,5", "2.5", "0,125", "1 ", "2,500", "1000000"])("quantité acceptée %s : aucun message", brut => {
    expect(erreurQuantiteSaisie(brut)).toBeNull();
  });
  it.each(["0", "58,40", "58.4", "1 234,56 €", "0,00"])("prix accepté %s : aucun message", brut => {
    expect(erreurPrixSaisi(brut)).toBeNull();
  });

  it("un champ vide n’est pas une erreur (le champ requis s’en charge à l’envoi)", () => {
    expect(erreurQuantiteSaisie("")).toBeNull();
    expect(erreurQuantiteSaisie("  ")).toBeNull();
    expect(erreurPrixSaisi("")).toBeNull();
  });

  // Le message de champ ne doit jamais contredire le calcul : il apparaît
  // exactement quand calculerDevis refuserait la valeur.
  it("reste cohérent avec calculerDevis", () => {
    const quantites = ["0", "-1", "abc", "1", "2,5", "1,2345", "0,001", "0,0001", "1000000", "1000001", "1e-7", "Infinity", "2,500"];
    for (const q of quantites) {
      const n = Number(q.replace(",", "."));
      let refuse = false;
      try { calculerDevis([{ libelle: "x", quantite: n, prix_unitaire_ht_cents: 100, tva_bps: 0 }, { libelle: "y", quantite: 1, prix_unitaire_ht_cents: 100, tva_bps: 0 }]); } catch { refuse = true; }
      expect(erreurQuantiteSaisie(q) !== null, `quantité ${q}`).toBe(refuse);
    }
    const prix = ["0", "58,40", "12,345", "-5", "abc", "10000000", "10000000,01", "99999999"];
    for (const p of prix) {
      const cents = montantEnCentimes(p);
      let refuse = false;
      try { calculerDevis([{ libelle: "x", quantite: 1, prix_unitaire_ht_cents: cents ?? Number.NaN, tva_bps: 0 }, { libelle: "y", quantite: 1, prix_unitaire_ht_cents: 100, tva_bps: 0 }]); } catch { refuse = true; }
      expect(erreurPrixSaisi(p) !== null, `prix ${p}`).toBe(refuse);
    }
  });

  // Le formulaire : le champ fautif est marqué et relié à son message, l'autre non.
  it("le formulaire nomme le champ en cause (aria-invalid, aria-describedby, message)", () => {
    const rendre = (quantite: string, prix: string) => renderToStaticMarkup(createElement(LignesDevis, { saisieInitiale: [{ code: "", libelle: "Robinet", quantite, prix, tva: "1000" }] }));
    const faux = rendre("0", "12,345");
    expect(faux.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(faux).toMatch(/aria-label="Ligne 1 : quantité"[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]+-0-quantite"/);
    expect(faux).toMatch(/aria-label="Ligne 1 : prix unitaire HT"[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]+-0-prix"/);
    expect(faux).toMatch(/id="[^"]+-0-quantite"[^>]*>La quantité doit être supérieure à zéro\./);
    expect(faux).toMatch(/id="[^"]+-0-prix"[^>]*>Le prix accepte deux décimales au plus/);
    expect(faux).toContain("corrigez les champs signalés ci-dessus");
    const seulPrix = rendre("2", "-5");
    expect(seulPrix.match(/aria-invalid="true"/g)).toHaveLength(1);
    expect(seulPrix).not.toContain("-0-quantite");
    const bon = rendre("2,5", "58,40");
    expect(bon).not.toContain(`aria-invalid="true"`);
    expect(bon).not.toContain("corrigez les champs");
  });
});

// D04 (1), VER-TS-02 : la quantité d'une ligne de devis se lit sur le texte tapé, comme un montant.
describe("lireQuantite : la quantité telle que tapée", () => {
  it.each([
    ["1", 1],
    ["2,5", 2.5],
    ["2.5", 2.5],
    ["2.125", 2.125],
    [" 3 ", 3],
    ["2,500", 2.5],
    ["0,001", 0.001],
    ["1000000", 1_000_000],
  ])("« %s » vaut %s", (brut, attendu) => {
    expect(lireQuantite(brut)).toBe(attendu);
  });

  it.each(["", " ", "0", "0,000", "-1", "abc", "1e2", "0x10", "Infinity", "NaN", "1 5", "2,5,1", "1,2345", "1000000,001", "1000001", ",5", "5,"])(
    "« %s » est refusée (null), jamais lue comme un nombre",
    (brut) => {
      expect(lireQuantite(brut)).toBeNull();
    }
  );

  it("« 2,5 » n'est ni 25 ni 2 500 (la virgule est lue, pas absorbée)", () => {
    expect(lireQuantite("2,5")).not.toBe(25);
    expect(lireQuantite("2,5")).toBe(2.5);
  });

  it("une quantité lue passe toujours calculerDevis, et une quantité refusée ne le passe jamais", () => {
    for (const brut of ["1", "2,5", "0,125", "999999,999", "1000000"]) {
      const q = lireQuantite(brut);
      expect(q, brut).not.toBeNull();
      expect(() => calculerDevis([{ libelle: "x", quantite: q, prix_unitaire_ht_cents: 100, tva_bps: 0 }])).not.toThrow();
    }
    for (const brut of ["1e2", "abc", "0", "1,2345"]) {
      expect(() => calculerDevis([{ libelle: "x", quantite: lireQuantite(brut) ?? Number.NaN, prix_unitaire_ht_cents: 100, tva_bps: 0 }])).toThrow();
    }
  });
});
