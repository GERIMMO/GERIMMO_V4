/**
 * Décision du dirigeant du 25/11/2026, outil public de calcul de l'IRL (suite des défauts E054 = E167) :
 *  - aucun champ n'est prérempli avec une valeur : ni le loyer, ni la date du bail, ni les trimestres et années
 *    d'exemple, ni la classe énergétique, ni la date de la lettre (posée jusqu'ici au montage, date du jour) ;
 *  - un exemple n'apparaît qu'en texte indicatif (placeholder ou aide grisée) dans un champ vide, jamais comme donnée ;
 *  - le calcul ne part jamais d'une valeur que l'utilisateur n'a pas saisie (les indices viennent de la série de
 *    l'Insee, choisis à partir de SA date, ou de sa saisie) ;
 *  - le résultat et la lettre restent impossibles tant qu'un champ requis est vide, avec un message qui dit lequel ;
 *  - chaque champ garde son libellé visible (le placeholder ne le remplace pas).
 * Le composant réel tourne (moteur de hooks sans DOM, tests/aide/hooks-sans-dom.ts) : ses états de départ, ses effets
 * et ses réactions à la saisie. Le rendu HTML (libellés reliés, attributs) : tests/outils-irl-rendu.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  return { ...reel, ...hooks, default: { ...reel, ...hooks } };
});
vi.mock("next/font/local", () => ({ default: () => ({ className: "police-document" }) }));

import { CalculateurIrl } from "../src/app/outils/calcul-irl/calculateur-irl";
import { Champ, Choix, Segments } from "../src/components/outils/champs";
import { ChampAdresse } from "../src/components/outils/champ-adresse";
import { ChiffreHero, Pastille } from "../src/components/outils/resultats";
import { lireSerieSdmx, type ObservationIrl } from "../src/lib/outils/irl-insee";
import { monter, type Instance } from "./aide/hooks-sans-dom";

const serie = lireSerieSdmx(readFileSync(path.resolve(__dirname, "fixtures", "insee-irl-generic.xml"), "utf8"));

type El = ReactElement<Record<string, unknown>>;
type Calculateur = Instance<{ serie: ObservationIrl[] | null }, unknown>;

/** Tous les éléments de l'arbre rendu, y compris ceux passés en propriété (« saisie », « resultat », « pastille »…). */
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
/** Le texte d'un élément : ses chaînes, celles de ses enfants (les composants ne sont pas déroulés). */
function texte(n: unknown): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(texte).join("");
  if (isValidElement(n)) return texte((n as El).props.children);
  return "";
}
const tous = (i: Calculateur) => elements(i.rendu);
const champ = (i: Calculateur, id: string) =>
  tous(i).find((e) => (e.type === Champ || e.type === Choix || e.type === ChampAdresse) && e.props.id === id);
const segments = (i: Calculateur, nom: string) => tous(i).find((e) => e.type === Segments && e.props.nom === nom);
const pastille = (i: Calculateur) => texte(tous(i).find((e) => e.type === Pastille)?.props.children);
const nouveauLoyer = (i: Calculateur) =>
  tous(i).find((e) => e.type === ChiffreHero && e.props.testId === "irl-nouveau-loyer")?.props.valeur as string | undefined;
const manque = (i: Calculateur) =>
  tous(i).map((e) => (e.type === "p" ? texte(e.props.children) : "")).find((t) => t.startsWith("Renseignez")) ?? null;
const boutonImprimer = (i: Calculateur) => tous(i).find((e) => e.type === "button" && texte(e.props.children).includes("Imprimer la lettre"));
const messageLettre = (i: Calculateur) => {
  const el = tous(i).find((e) => e.props["data-testid"] === "irl-lettre-manque");
  return el ? texte(el.props.children) : null;
};

async function demarrer(s: ObservationIrl[] | null): Promise<Calculateur> {
  const i = monter(CalculateurIrl, { serie: s }) as Calculateur;
  i.stabiliser();
  await i.vider();
  return i;
}
async function saisir(i: Calculateur, id: string, valeur: string) {
  const el = champ(i, id);
  expect(el, `champ ${id}`).toBeDefined();
  (el!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
async function cocher(i: Calculateur, nom: string, valeur: string) {
  const el = segments(i, nom);
  expect(el, `choix ${nom}`).toBeDefined();
  (el!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
async function remplirLaLettre(i: Calculateur) {
  await saisir(i, "irl-bailleur-nom", "Durand Paul");
  await saisir(i, "irl-bailleur-adresse", "3 rue Fictive, 75011 Paris");
  await saisir(i, "irl-locataire-nom", "Martin Claire");
  await saisir(i, "irl-logement", "8 avenue Exemple, 69003 Lyon");
  await saisir(i, "irl-date-lettre", "2026-07-25");
  await saisir(i, "irl-date-effet", "2026-08-01");
}

const CHAMPS_TEXTE_COMMUNS = ["irl-logement", "irl-loyer", "irl-bailleur-nom", "irl-bailleur-adresse", "irl-locataire-nom", "irl-date-lettre", "irl-date-effet"];
const MANQUE_LETTRE =
  "le nom du bailleur, l'adresse du bailleur, le nom du locataire, l'adresse du logement, la date de la lettre et la date d'effet de la révision";

describe("série de l'Insee lue (parcours automatique)", () => {
  it("au départ, et après le montage, aucun champ ne porte de valeur : ni loyer, ni date, ni trimestre, ni DPE", async () => {
    const i = await demarrer(serie);
    // La date de la lettre était posée au montage (date du jour) : elle reste vide, comme les autres.
    for (const id of [...CHAMPS_TEXTE_COMMUNS, "irl-date-bail"]) expect(champ(i, id)?.props.valeur, id).toBe("");
    expect(segments(i, "irl-trim-bail")?.props.valeur).toBeNull();
    expect(segments(i, "irl-dpe")?.props.valeur).toBeNull();
    // Rien n'est calculé, et le message dit ce qui manque.
    expect(pastille(i)).toBe("À compléter");
    expect(nouveauLoyer(i)).toBeUndefined();
    expect(manque(i)).toBe("Renseignez le loyer hors charges actuel et la date de signature du bail ou de la dernière révision.");
    // La lettre ne s'imprime pas, et le bouton dit pourquoi.
    expect(boutonImprimer(i)?.props.disabled).toBe(true);
    expect(boutonImprimer(i)?.props["aria-describedby"]).toBe("irl-lettre-manque");
    expect(messageLettre(i)).toBe(`Pour imprimer la lettre, complétez d'abord le calcul du nouveau loyer, puis renseignez ${MANQUE_LETTRE}.`);
  });

  it("un exemple n'est qu'un texte indicatif dans un champ vide, et chaque champ garde son libellé", async () => {
    const i = await demarrer(serie);
    const loyer = champ(i, "irl-loyer")!;
    expect(loyer.props.valeur).toBe("");
    expect(loyer.props.placeholder).toBe("Ex. 850");
    expect(texte(loyer.props.libelle)).toBe("Loyer actuel hors charges");
    // L'aide de la date ne parle plus d'un « exemple pré-rempli ».
    expect(texte(champ(i, "irl-date-bail")!.props.aide)).not.toMatch(/exemple/i);
    for (const el of tous(i).filter((e) => [Champ, Choix, Segments, ChampAdresse].includes(e.type as never))) {
      expect(texte(el.props.libelle).trim(), String(el.props.id ?? el.props.nom)).not.toBe("");
    }
  });

  it("le calcul part de la saisie : loyer et date saisis, indices lus chez l'Insee ; la lettre attend ses propres champs", async () => {
    const i = await demarrer(serie);
    await saisir(i, "irl-date-bail", "2025-07-20");
    // La date seule ne donne aucun montant : le loyer manque encore.
    expect(segments(i, "irl-trim-bail")?.props.valeur).toBe("T2");
    expect(nouveauLoyer(i)).toBeUndefined();
    expect(manque(i)).toBe("Renseignez le loyer hors charges actuel.");
    await saisir(i, "irl-loyer", "850");
    expect(nouveauLoyer(i)).toMatch(/^859,79\s€$/);
    expect(pastille(i)).toBe("Indices cohérents");
    const source = tous(i).find((e) => e.props["data-testid"] === "irl-source");
    expect(texte(source?.props.children)).toContain("Trimestre utilisé : T2");
    // Résultat obtenu, mais la lettre n'est pas complète : l'impression reste impossible, le message dit quoi saisir.
    expect(boutonImprimer(i)?.props.disabled).toBe(true);
    expect(messageLettre(i)).toBe(`Pour imprimer la lettre, renseignez ${MANQUE_LETTRE}.`);
    await remplirLaLettre(i);
    expect(boutonImprimer(i)?.props.disabled).toBe(false);
    expect(messageLettre(i)).toBeNull();
    // Un champ requis vidé : de nouveau impossible.
    await saisir(i, "irl-date-effet", "");
    expect(boutonImprimer(i)?.props.disabled).toBe(true);
    expect(messageLettre(i)).toBe("Pour imprimer la lettre, renseignez la date d'effet de la révision.");
    i.demonter();
  });

  it("« Saisir les indices moi-même » sans date saisie ne reprend rien : trimestres, années et indices vides", async () => {
    const i = await demarrer(serie);
    const bouton = tous(i).find((e) => e.type === "button" && texte(e.props.children) === "Saisir les indices moi-même");
    (bouton!.props.onClick as () => void)();
    await i.vider();
    for (const nom of ["irl-trim-ref", "irl-trim-nouv"]) expect(segments(i, nom)?.props.valeur, nom).toBeNull();
    for (const id of ["irl-annee-ref", "irl-annee-nouv", "irl-indice-ref", "irl-indice-nouv", "irl-loyer"]) expect(champ(i, id)?.props.valeur, id).toBe("");
    expect(nouveauLoyer(i)).toBeUndefined();
  });
});

describe("série non lue (saisie manuelle)", () => {
  it("au départ : loyer, trimestres, années, indices et DPE vides ; le message liste tout ce qui manque", async () => {
    const i = await demarrer(null);
    for (const id of [...CHAMPS_TEXTE_COMMUNS, "irl-annee-ref", "irl-annee-nouv", "irl-indice-ref", "irl-indice-nouv"]) {
      expect(champ(i, id)?.props.valeur, id).toBe("");
    }
    for (const nom of ["irl-trim-ref", "irl-trim-nouv", "irl-dpe"]) expect(segments(i, nom)?.props.valeur, nom).toBeNull();
    // L'année se choisit dans une liste qui commence par un choix vide, sans valeur.
    expect(champ(i, "irl-annee-ref")?.props.vide).toBe("Choisir l'année");
    expect(pastille(i)).toBe("À compléter");
    expect(manque(i)).toBe(
      "Renseignez le loyer hors charges actuel, le trimestre et l'année de l'indice de référence, l'indice de référence, le trimestre et l'année du nouvel indice et le nouvel indice."
    );
    expect(boutonImprimer(i)?.props.disabled).toBe(true);
  });

  it("indices saisis sans leurs trimestres : aucun montant ; trimestres et années saisis : le calcul se fait", async () => {
    const i = await demarrer(null);
    await saisir(i, "irl-loyer", "850");
    await saisir(i, "irl-indice-ref", "146,68");
    await saisir(i, "irl-indice-nouv", "148,37");
    expect(nouveauLoyer(i)).toBeUndefined();
    expect(manque(i)).toBe("Renseignez le trimestre et l'année de l'indice de référence et le trimestre et l'année du nouvel indice.");
    await cocher(i, "irl-trim-ref", "T2");
    await saisir(i, "irl-annee-ref", "2025");
    await cocher(i, "irl-trim-nouv", "T2");
    expect(manque(i)).toBe("Renseignez le trimestre et l'année du nouvel indice.");
    await saisir(i, "irl-annee-nouv", "2026");
    expect(nouveauLoyer(i)).toMatch(/^859,79\s€$/);
    expect(pastille(i)).toBe("Indices cohérents");
    await remplirLaLettre(i);
    expect(boutonImprimer(i)?.props.disabled).toBe(false);
    i.demonter();
  });
});
