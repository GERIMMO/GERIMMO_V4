/**
 * Q123 (comparateur GLI / Visale, simulateur LMNP, rentabilité locative), même règle que l'outil IRL (décision du
 * dirigeant du 25/11/2026, Q100) :
 *  - aucun champ ne démarre avec une valeur (loyer de 970 €, tranche de 30 %, taux de GLI « par défaut », recettes de
 *    9 600 €, prix de 160 000 € ou de 150 000 €, crédit de 160 000 € à 3,5 % sur 20 ans… étaient posés d'office) ;
 *  - l'exemple n'est qu'un texte indicatif dans le champ vide ;
 *  - aucun résultat tant qu'un champ requis est vide (0 pour un montant nul), et un message dit lesquels manquent ;
 *  - saisi à la main, l'exemple donne toujours les chiffres documentés (tests/outils-gli-visale.test.ts,
 *    tests/outils-lmnp.test.ts, tests/outils-rentabilite.test.ts).
 * Les composants réels tournent (moteur de hooks sans DOM, tests/aide/hooks-sans-dom.ts). Le rendu HTML :
 * tests/outils-sans-valeur-rendu.test.ts.
 */
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  return { ...reel, ...hooks, default: { ...reel, ...hooks } };
});
vi.mock("next/font/local", () => ({ default: () => ({ className: "police-document" }) }));

import { ComparateurGliVisale } from "../src/app/outils/comparateur-gli-visale/comparateur";
import { CalculateurRentabilite } from "../src/app/outils/rentabilite-locative/calculateur-rentabilite";
import { SimulateurLmnp } from "../src/app/outils/simulateur-lmnp/simulateur";
import { Case, Champ, Choix, Groupe, Segments } from "../src/components/outils/champs";
import { Barres, Chiffre, ChiffreHero, LigneDetail, Pastille } from "../src/components/outils/resultats";
import { monter, type Instance } from "./aide/hooks-sans-dom";

type El = ReactElement<Record<string, unknown>>;
type Outil = Instance<Record<string, never>, unknown>;

function elements(n: unknown, acc: El[] = []): El[] {
  if (Array.isArray(n)) {
    for (const x of n) elements(x, acc);
    return acc;
  }
  if (!isValidElement(n)) return acc;
  const el = n as El;
  acc.push(el);
  for (const v of Object.values(el.props)) if (v && typeof v === "object") elements(v, acc);
  return acc;
}
function texte(n: unknown): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(texte).join("");
  if (isValidElement(n)) return texte((n as El).props.children);
  return "";
}
const tous = (i: Outil) => elements(i.rendu);
const champs = (i: Outil) => tous(i).filter((e) => e.type === Champ || e.type === Choix);
const champ = (i: Outil, id: string) => champs(i).find((e) => e.props.id === id);
const segments = (i: Outil, nom: string) => tous(i).find((e) => e.type === Segments && e.props.nom === nom);
const pastille = (i: Outil) => texte(tous(i).find((e) => e.type === Pastille)?.props.children);
const parTestId = (i: Outil, id: string) => tous(i).find((e) => e.props["data-testid"] === id);
/** La valeur affichée sous un identifiant de test : chiffre, ligne de détail, ou barre. */
function valeurDe(i: Outil, testId: string): string | undefined {
  for (const e of tous(i)) {
    if ((e.type === ChiffreHero || e.type === Chiffre || e.type === LigneDetail) && e.props.testId === testId) return e.props.valeur as string;
    if (e.type === Barres) {
      const barre = (e.props.barres as { testId?: string; texte: string }[]).find((b) => b.testId === testId);
      if (barre) return barre.texte;
    }
  }
  return undefined;
}

async function demarrer(composant: () => unknown): Promise<Outil> {
  const i = monter(composant as (p: Record<string, never>) => unknown, {}) as Outil;
  i.stabiliser();
  await i.vider();
  return i;
}
async function saisir(i: Outil, id: string, valeur: string) {
  const el = champ(i, id);
  expect(el, `champ ${id}`).toBeDefined();
  (el!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
async function cocher(i: Outil, nom: string, valeur: string) {
  const el = segments(i, nom);
  expect(el, `choix ${nom}`).toBeDefined();
  (el!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
/** Au départ : chaque champ vide (avec un texte indicatif quand il y en a un), aucun segment coché. */
function toutEstVide(i: Outil, nomsSegments: string[]) {
  const liste = champs(i);
  expect(liste.length).toBeGreaterThan(0);
  for (const el of liste) expect(el.props.valeur, String(el.props.id)).toBe("");
  for (const nom of nomsSegments) expect(segments(i, nom)?.props.valeur, nom).toBeNull();
}

describe("comparateur GLI / Visale : rien de prérempli (Q123)", () => {
  it("au départ : champs vides, aucun choix fait, ni verdict ni coût, et le message dit ce qui manque", async () => {
    const i = await demarrer(ComparateurGliVisale);
    toutEstVide(i, ["cmp-age", "cmp-tmi"]);
    expect(champ(i, "cmp-loyer")?.props.placeholder).toBe("Ex. 970");
    expect(champ(i, "cmp-taux")?.props.placeholder).toBe("Ex. 2,7");
    // La liste commence par un choix sans valeur : aucune zone n'est choisie à la place de l'utilisateur.
    expect(champ(i, "cmp-zone")?.props.vide).toBe("Choisir la situation");
    expect(pastille(i)).toBe("À compléter");
    expect(parTestId(i, "cmp-visale-verdict")).toBeUndefined();
    expect(valeurDe(i, "cmp-gli-brut")).toBeUndefined();
    expect(texte(parTestId(i, "cmp-visale-manque")?.props.children)).toBe(
      "Renseignez le loyer charges comprises, la situation du logement et l'âge du locataire."
    );
    expect(texte(parTestId(i, "cmp-gli-manque")?.props.children)).toBe(
      "Renseignez le loyer charges comprises, le taux de la prime et la tranche marginale d'imposition."
    );
  });

  it("saisi, l'exemple donne 314,28 € brut et 165,94 € net ; à 30 ans et plus, la situation est demandée", async () => {
    const i = await demarrer(ComparateurGliVisale);
    await saisir(i, "cmp-loyer", "970");
    await saisir(i, "cmp-zone", "reste");
    await cocher(i, "cmp-age", "moins-30");
    expect(texte(parTestId(i, "cmp-visale-verdict")?.props.children)).toBe("Visale est possible");
    expect(pastille(i)).toBe("Visale possible");
    // Le coût attend encore le taux et la tranche.
    expect(texte(parTestId(i, "cmp-gli-manque")?.props.children)).toBe("Renseignez le taux de la prime et la tranche marginale d'imposition.");
    await saisir(i, "cmp-taux", "2,7");
    await cocher(i, "cmp-tmi", "0.3");
    expect(valeurDe(i, "cmp-gli-brut")).toMatch(/^314,28\s€$/);
    expect(valeurDe(i, "cmp-gli-net")).toMatch(/^165,94\s€$/);
    await cocher(i, "cmp-age", "30-plus");
    expect(champ(i, "cmp-situation")?.props.valeur).toBe("");
    expect(parTestId(i, "cmp-visale-verdict")).toBeUndefined();
    expect(texte(parTestId(i, "cmp-visale-manque")?.props.children)).toBe("Renseignez la situation du locataire.");
    await saisir(i, "cmp-situation", "autre");
    expect(texte(parTestId(i, "cmp-visale-verdict")?.props.children)).toBe("Visale est exclue");
  });
});

describe("simulateur LMNP : rien de prérempli (Q123)", () => {
  const exemple: [string, string][] = [
    ["lmnp-recettes", "9600"],
    ["lmnp-charges", "3800"],
    ["lmnp-prix", "160000"],
    ["lmnp-frais", "14000"],
    ["lmnp-terrain", "20"],
    ["lmnp-duree-bati", "30"],
    ["lmnp-mobilier", "5000"],
    ["lmnp-duree-mobilier", "7"],
    ["lmnp-travaux", "10000"],
    ["lmnp-duree-travaux", "10"],
  ];

  it("au départ : champs vides, tranche non cochée, aucun impôt, et le message dit ce qui manque", async () => {
    const i = await demarrer(SimulateurLmnp);
    toutEstVide(i, ["lmnp-tmi"]);
    expect(champ(i, "lmnp-recettes")?.props.placeholder).toMatch(/^Ex\. 9\s600$/);
    expect(champ(i, "lmnp-terrain")?.props.placeholder).toBe("Ex. 20");
    // Seule l'option de calcul des frais d'acquisition garde sa position de départ (amortis avec le bien).
    expect(tous(i).find((e) => e.type === Case && e.props.id === "lmnp-frais-amortis")?.props.coche).toBe(true);
    expect(pastille(i)).toBe("À compléter");
    expect(valeurDe(i, "lmnp-impot-reel")).toBeUndefined();
    // Aucune durée n'est demandée tant qu'aucun montant à amortir n'est saisi (celle du bâti suit la même règle que
    // celles du mobilier et des travaux : elle est demandée avec le prix, plus bas).
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe(
      "Renseignez les loyers encaissés, les charges déductibles, la tranche marginale d'imposition, le prix d'achat, les frais d'acquisition, la part du terrain, le mobilier et les travaux."
    );
  });

  it("la durée du bâti n'est demandée que pour un prix (ou des frais amortis) à amortir", async () => {
    const i = await demarrer(SimulateurLmnp);
    for (const [id, v] of [
      ["lmnp-recettes", "9600"],
      ["lmnp-charges", "3800"],
      ["lmnp-terrain", "20"],
      ["lmnp-mobilier", "0"],
      ["lmnp-travaux", "0"],
    ]) {
      await saisir(i, id, v);
    }
    await cocher(i, "lmnp-tmi", "0.3");
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe("Renseignez le prix d'achat et les frais d'acquisition.");
    // Rien à amortir (ni prix ni frais) : pas de durée du bâti, le calcul se fait.
    await saisir(i, "lmnp-prix", "0");
    await saisir(i, "lmnp-frais", "0");
    expect(parTestId(i, "lmnp-manque")).toBeUndefined();
    expect(valeurDe(i, "lmnp-impot-reel")).toBeDefined();
    // Des frais seuls, non amortis avec le bien : toujours rien à amortir.
    await saisir(i, "lmnp-frais", "14000");
    (tous(i).find((e) => e.type === Case && e.props.id === "lmnp-frais-amortis")!.props.onChange as (v: boolean) => void)(false);
    await i.vider();
    expect(parTestId(i, "lmnp-manque")).toBeUndefined();
    // Amortis avec le bien, ils sont à amortir : la durée du bâti est demandée.
    (tous(i).find((e) => e.type === Case && e.props.id === "lmnp-frais-amortis")!.props.onChange as (v: boolean) => void)(true);
    await i.vider();
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe("Renseignez la durée du bâti.");
    expect(valeurDe(i, "lmnp-impot-reel")).toBeUndefined();
    // Un prix aussi.
    await saisir(i, "lmnp-frais", "0");
    await saisir(i, "lmnp-prix", "160000");
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe("Renseignez la durée du bâti.");
    await saisir(i, "lmnp-duree-bati", "30");
    expect(parTestId(i, "lmnp-manque")).toBeUndefined();
  });

  it("pour un montant à amortir, une durée de 0 est refusée (plus d'amortissement nul en silence)", async () => {
    const i = await demarrer(SimulateurLmnp);
    for (const [id, v] of exemple) await saisir(i, id, v);
    await cocher(i, "lmnp-tmi", "0.3");
    expect(valeurDe(i, "lmnp-impot-reel")).toMatch(/^0,00\s€$/);
    // Durée du bâti à 0 pour 139 200 € à amortir : refusée, aucun impôt affiché (il donnait un amortissement du bâti nul).
    await saisir(i, "lmnp-duree-bati", "0");
    expect(pastille(i)).toBe("À compléter");
    expect(valeurDe(i, "lmnp-impot-reel")).toBeUndefined();
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe("Renseignez une durée du bâti supérieure à 0.");
    await saisir(i, "lmnp-duree-bati", "-5");
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe("Renseignez une durée du bâti supérieure à 0.");
    await saisir(i, "lmnp-duree-bati", "30");
    // Même règle pour le mobilier et les travaux.
    await saisir(i, "lmnp-duree-mobilier", "0");
    await saisir(i, "lmnp-duree-travaux", "0");
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe(
      "Renseignez une durée du mobilier supérieure à 0 et une durée des travaux supérieure à 0."
    );
    expect(valeurDe(i, "lmnp-impot-reel")).toBeUndefined();
    await saisir(i, "lmnp-duree-mobilier", "7");
    await saisir(i, "lmnp-duree-travaux", "10");
    expect(parTestId(i, "lmnp-manque")).toBeUndefined();
    expect(valeurDe(i, "lmnp-impot-micro")).toMatch(/^2\s265,60\s€$/);
    // Sans rien à amortir, une durée de 0 ne gêne pas (elle n'est pas demandée).
    await saisir(i, "lmnp-mobilier", "0");
    await saisir(i, "lmnp-duree-mobilier", "0");
    expect(parTestId(i, "lmnp-manque")).toBeUndefined();
  });

  it("une durée n'est demandée que pour un montant à amortir ; saisi, l'exemple donne réel 0,00 €, micro 2 265,60 €, reporté 554,29 €", async () => {
    const i = await demarrer(SimulateurLmnp);
    for (const [id, v] of exemple.filter(([id]) => !id.startsWith("lmnp-duree-mobilier") && !id.startsWith("lmnp-duree-travaux"))) {
      await saisir(i, id, v);
    }
    expect(texte(parTestId(i, "lmnp-manque")?.props.children)).toBe(
      "Renseignez la tranche marginale d'imposition, la durée du mobilier et la durée des travaux."
    );
    await cocher(i, "lmnp-tmi", "0.3");
    await saisir(i, "lmnp-duree-mobilier", "7");
    await saisir(i, "lmnp-duree-travaux", "10");
    expect(valeurDe(i, "lmnp-impot-reel")).toMatch(/^0,00\s€$/);
    expect(valeurDe(i, "lmnp-impot-micro")).toMatch(/^2\s265,60\s€$/);
    expect(valeurDe(i, "lmnp-economie")).toMatch(/^2\s265,60\s€$/);
    expect(texte(parTestId(i, "lmnp-reporte")?.props.children)).toMatch(/554,29\s€/);
    // Sans mobilier ni travaux (0), leurs durées ne sont plus demandées.
    await saisir(i, "lmnp-duree-mobilier", "");
    await saisir(i, "lmnp-duree-travaux", "");
    await saisir(i, "lmnp-mobilier", "0");
    await saisir(i, "lmnp-travaux", "0");
    expect(parTestId(i, "lmnp-manque")).toBeUndefined();
    expect(valeurDe(i, "lmnp-impot-reel")).toBeDefined();
  });
});

describe("rentabilité locative : rien de prérempli (Q123)", () => {
  async function saisirExemple(i: Outil) {
    for (const [id, v] of [
      ["rt-prix", "150000"],
      ["rt-frais", "11000"],
      ["rt-travaux", "9000"],
      ["rt-loyer", "750"],
      ["rt-vacance", "1"],
      ["rt-charges", "400"],
      ["rt-taxe", "800"],
      ["rt-pno", "120"],
      ["rt-gestion", "0"],
    ]) {
      await saisir(i, id, v);
    }
  }

  it("au départ : champs vides, financement non choisi, aucune rentabilité, et le message dit ce qui manque", async () => {
    const i = await demarrer(CalculateurRentabilite);
    toutEstVide(i, ["rt-credit"]);
    expect(champ(i, "rt-prix")?.props.placeholder).toMatch(/^Ex\. 150\s000$/);
    expect(champ(i, "rt-loyer")?.props.placeholder).toBe("Ex. 750");
    // Les champs du crédit n'apparaissent qu'une fois le financement choisi.
    expect(champ(i, "rt-montant")).toBeUndefined();
    expect(pastille(i)).toBe("À compléter");
    expect(valeurDe(i, "rt-nette")).toBeUndefined();
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe(
      "Renseignez le prix d'achat, les frais d'acquisition, les travaux, le loyer mensuel, la vacance locative, les charges non récupérables, la taxe foncière, l'assurance propriétaire non occupant, les frais de gestion et le financement."
    );
  });

  it("saisi, l'exemple donne brute 5,29 %, nette 4,08 %, cash-flow −350,44 € ; le crédit attend ses trois champs", async () => {
    const i = await demarrer(CalculateurRentabilite);
    await saisirExemple(i);
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe("Renseignez le financement.");
    await cocher(i, "rt-credit", "calcul");
    for (const id of ["rt-montant", "rt-taux", "rt-duree"]) expect(champ(i, id)?.props.valeur, id).toBe("");
    expect(champ(i, "rt-montant")?.props.placeholder).toMatch(/^Ex\. 160\s000$/);
    expect(champ(i, "rt-taux")?.props.placeholder).toBe("Ex. 3,5");
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe("Renseignez le montant emprunté, le taux annuel et la durée du crédit.");
    await saisir(i, "rt-montant", "160000");
    await saisir(i, "rt-taux", "3,5");
    await saisir(i, "rt-duree", "20");
    expect(valeurDe(i, "rt-brute")).toMatch(/^5,29\s%$/);
    expect(valeurDe(i, "rt-nette")).toMatch(/^4,08\s%$/);
    expect(valeurDe(i, "rt-cashflow")).toMatch(/^-350,44\s€$/);
  });

  it("le groupe s'intitule « Le financement » (le choix est requis : il n'est plus « facultatif »)", async () => {
    const i = await demarrer(CalculateurRentabilite);
    const legendes = tous(i)
      .filter((e) => e.type === Groupe)
      .map((e) => e.props.legende);
    expect(legendes).toContain("Le financement");
    expect(legendes).not.toContain("Le crédit (facultatif)");
    // Le choix imbriqué dans « Le financement » ne répète pas « Financement » : il nomme ce qui se choisit.
    expect(segments(i, "rt-credit")?.props.libelle).toBe("Mode de financement");
  });

  it("crédit à calculer : un montant ou une durée à 0 est refusé (plus de « Sans crédit » pour un crédit choisi)", async () => {
    const i = await demarrer(CalculateurRentabilite);
    await saisirExemple(i);
    await cocher(i, "rt-credit", "calcul");
    await saisir(i, "rt-montant", "0");
    await saisir(i, "rt-taux", "3,5");
    await saisir(i, "rt-duree", "20");
    expect(pastille(i)).toBe("À compléter");
    expect(valeurDe(i, "rt-nette")).toBeUndefined();
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe("Renseignez un montant emprunté supérieur à 0.");
    await saisir(i, "rt-montant", "160000");
    await saisir(i, "rt-duree", "0");
    expect(pastille(i)).toBe("À compléter");
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe("Renseignez une durée du crédit d'au moins un mois.");
    await saisir(i, "rt-montant", "-1");
    await saisir(i, "rt-taux", "-1");
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe(
      "Renseignez un montant emprunté supérieur à 0, un taux annuel positif ou nul et une durée du crédit d'au moins un mois."
    );
    // Un taux de 0 reste admis (prêt à taux zéro).
    await saisir(i, "rt-montant", "160000");
    await saisir(i, "rt-taux", "0");
    await saisir(i, "rt-duree", "20");
    expect(parTestId(i, "rt-manque")).toBeUndefined();
    expect(valeurDe(i, "rt-cashflow")).toMatch(/^-89,17\s€$/);
    expect(pastille(i)).toBe("Cash-flow négatif");
  });

  it("mensualité choisie : 0 est refusé de même", async () => {
    const i = await demarrer(CalculateurRentabilite);
    await saisirExemple(i);
    await cocher(i, "rt-credit", "mensualite");
    await saisir(i, "rt-mensualite", "0");
    expect(pastille(i)).toBe("À compléter");
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe("Renseignez une mensualité supérieure à 0.");
    await saisir(i, "rt-mensualite", "500");
    expect(pastille(i)).toBe("Cash-flow positif");
  });

  it("sans crédit : rien de plus à saisir ; mensualité choisie : elle est demandée", async () => {
    const i = await demarrer(CalculateurRentabilite);
    await saisirExemple(i);
    await cocher(i, "rt-credit", "aucun");
    expect(parTestId(i, "rt-manque")).toBeUndefined();
    expect(valeurDe(i, "rt-nette")).toMatch(/^4,08\s%$/);
    expect(valeurDe(i, "rt-cashflow")).toBeUndefined();
    await cocher(i, "rt-credit", "mensualite");
    expect(texte(parTestId(i, "rt-manque")?.props.children)).toBe("Renseignez la mensualité.");
    await saisir(i, "rt-mensualite", "500");
    expect(valeurDe(i, "rt-cashflow")).toMatch(/^77,50\s€$/);
  });
});
