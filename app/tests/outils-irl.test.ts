/**
 * Outil gratuit « Calcul IRL » (29/09) : nouveau loyer = loyer × IRL nouveau
 * ÷ IRL de référence, au centime, et les alertes de trimestre, de délai et
 * de baisse. Aucune table d'indices n'est embarquée.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXEMPLE_IRL,
  URL_SERIE_INSEE_IRL,
  alertesIrl,
  calculerRevisionIrl,
  ecartEnTrimestres,
  libelleTrimestre,
  type EntreeIrl,
} from "../src/lib/outils/irl";
import { arrondiCentime, formaterEuros, lireNombre } from "../src/lib/outils/nombres";

const codes = (e: EntreeIrl) => alertesIrl(e).map((a) => a.code);
// Défauts d'écran E054 = E167 : l'exemple de la page ne porte plus aucune valeur d'indice. Les calculs ci-dessous
// prennent les deux indices du jeu d'essai de la série Insee (tests/fixtures/insee-irl-generic.xml, T2 2025 et T2 2026),
// qui ne sont écrits que dans les tests.
const ENTREE: EntreeIrl = { ...EXEMPLE_IRL, indiceReference: 146.68, indiceNouveau: 148.37 };

describe("calcul de la révision", () => {
  it("850 € × 148,37 ÷ 146,68 = 859,79 €", () => {
    const r = calculerRevisionIrl(ENTREE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nouveauLoyer).toBe(859.79);
    expect(r.ecart).toBe(9.79);
    expect(formaterEuros(r.nouveauLoyer)).toBe("859,79 €");
    expect(r.alertes).toEqual([]);
  });

  it("un champ manquant ne donne aucun montant", () => {
    const r = calculerRevisionIrl({ ...ENTREE, indiceNouveau: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.manque).toContain("le nouvel indice");
  });

  it("l'exemple de la page, sans indice saisi, ne donne aucun montant", () => {
    const r = calculerRevisionIrl(EXEMPLE_IRL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.manque).toEqual(["l'indice de référence", "le nouvel indice"]);
  });
});

describe("alertes", () => {
  it("trimestres différents", () => {
    expect(codes({ ...ENTREE, trimestreNouveau: { trimestre: 3, annee: 2026 } })).toContain("trimestres-differents");
  });

  it("plus d'un an entre les indices : révision non rattrapable, sans rétroactivité", () => {
    const e = { ...ENTREE, trimestreNouveau: { trimestre: 2 as const, annee: 2027 } };
    expect(codes(e)).toEqual(["plus-d-un-an"]);
    const message = alertesIrl(e)[0].message;
    expect(message).toMatch(/un an/);
    expect(message).toMatch(/sans rétroactivité/);
    expect(message).toMatch(/17-1/);
  });

  it("indice en baisse", () => {
    expect(codes({ ...ENTREE, indiceNouveau: 145 })).toEqual(["indice-en-baisse"]);
  });

  it("nouvel indice antérieur ou identique : erreur", () => {
    expect(codes({ ...ENTREE, trimestreNouveau: { trimestre: 2, annee: 2025 } })).toContain("ordre-des-indices");
  });

  it("trimestres : écart et libellé", () => {
    expect(ecartEnTrimestres({ trimestre: 2, annee: 2025 }, { trimestre: 2, annee: 2026 })).toBe(4);
    expect(ecartEnTrimestres({ trimestre: 4, annee: 2025 }, { trimestre: 1, annee: 2026 })).toBe(1);
    expect(libelleTrimestre({ trimestre: 2, annee: 2026 })).toBe("T2 2026");
  });
});

describe("nombres saisis à la française", () => {
  it("lit la virgule, les espaces et refuse l'illisible", () => {
    expect(lireNombre("146,68")).toBe(146.68);
    expect(lireNombre("1 940")).toBe(1940);
    expect(lireNombre("2,7 %")).toBe(2.7);
    expect(lireNombre("")).toBeNull();
    expect(lireNombre("abc")).toBeNull();
  });

  it("arrondit au centime le plus proche", () => {
    expect(arrondiCentime(1.005)).toBe(1.01);
    expect(arrondiCentime(859.7934)).toBe(859.79);
  });
});

describe("aucune valeur d'indice n'est embarquée", () => {
  // E054 = E167 : ce test admettait les deux indices de l'exemple (146.68 et 148.37), que l'écran préremplissait et
  // présentait comme lus chez l'Insee. Plus aucune valeur d'indice n'est écrite, ni dans la bibliothèque ni à l'écran.
  it("ni la bibliothèque ni le calculateur ne contiennent d'indice, et ils renvoient vers l'Insee", () => {
    for (const fichier of ["../src/lib/outils/irl.ts", "../src/app/outils/calcul-irl/calculateur-irl.tsx", "../src/app/outils/calcul-irl/page.tsx"]) {
      const src = readFileSync(path.resolve(__dirname, fichier), "utf8");
      expect(src.match(/\b1[2-6]\d[.,]\d{2}\b/g) ?? [], fichier).toEqual([]);
    }
    expect(EXEMPLE_IRL.indiceReference).toBeNull();
    expect(EXEMPLE_IRL.indiceNouveau).toBeNull();
    expect(URL_SERIE_INSEE_IRL).toBe("https://www.insee.fr/fr/statistiques/serie/001515333");
  });
});
