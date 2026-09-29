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

describe("calcul de la révision", () => {
  it("l'exemple de la page : 850 € × 148,37 ÷ 146,68 = 859,79 €", () => {
    const r = calculerRevisionIrl(EXEMPLE_IRL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nouveauLoyer).toBe(859.79);
    expect(r.ecart).toBe(9.79);
    expect(formaterEuros(r.nouveauLoyer)).toBe("859,79 €");
    expect(r.alertes).toEqual([]);
  });

  it("un champ manquant ne donne aucun montant", () => {
    const r = calculerRevisionIrl({ ...EXEMPLE_IRL, indiceNouveau: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.manque).toContain("le nouvel indice");
  });
});

describe("alertes", () => {
  it("trimestres différents", () => {
    expect(codes({ ...EXEMPLE_IRL, trimestreNouveau: { trimestre: 3, annee: 2026 } })).toContain("trimestres-differents");
  });

  it("plus d'un an entre les indices : révision non rattrapable, sans rétroactivité", () => {
    const e = { ...EXEMPLE_IRL, trimestreNouveau: { trimestre: 2 as const, annee: 2027 } };
    expect(codes(e)).toEqual(["plus-d-un-an"]);
    const message = alertesIrl(e)[0].message;
    expect(message).toMatch(/un an/);
    expect(message).toMatch(/sans rétroactivité/);
    expect(message).toMatch(/17-1/);
  });

  it("indice en baisse", () => {
    expect(codes({ ...EXEMPLE_IRL, indiceNouveau: 145 })).toEqual(["indice-en-baisse"]);
  });

  it("nouvel indice antérieur ou identique : erreur", () => {
    expect(codes({ ...EXEMPLE_IRL, trimestreNouveau: { trimestre: 2, annee: 2025 } })).toContain("ordre-des-indices");
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
  it("la bibliothèque ne contient que l'exemple, et renvoie vers l'Insee", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/lib/outils/irl.ts"), "utf8");
    const indices = src.match(/\b1[2-6]\d\.\d{2}\b/g) ?? [];
    expect(new Set(indices)).toEqual(new Set(["146.68", "148.37"]));
    expect(URL_SERIE_INSEE_IRL).toBe("https://www.insee.fr/fr/statistiques/serie/001515333");
  });
});
