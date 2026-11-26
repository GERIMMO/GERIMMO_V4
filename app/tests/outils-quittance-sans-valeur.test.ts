/**
 * Q123 (outil public de quittance), même règle que l'outil IRL (décision du dirigeant du 25/11/2026, Q100) :
 *  - aucun champ ne démarre avec une valeur : ni le loyer (850 €), ni les charges (120 €), ni le montant reçu (970 €, qui
 *    suivait le total), ni le mois et la date du jour (posés au montage), ni le mode « virement » ;
 *  - un exemple n'est qu'un texte indicatif (placeholder) dans un champ vide ;
 *  - le document ne se prépare qu'avec le terme saisi, et ne s'imprime que complet, avec un message qui dit ce qui manque
 *    (avant : « Imprimer la quittance » actif dès l'ouverture, une quittance de 970 € sans rien saisir).
 * Le composant réel tourne (moteur de hooks sans DOM, tests/aide/hooks-sans-dom.ts). Le rendu HTML (valeurs vides,
 * textes indicatifs, libellés reliés) : tests/outils-sans-valeur-rendu.test.ts.
 */
import { isValidElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  return { ...reel, ...hooks, default: { ...reel, ...hooks } };
});
vi.mock("next/font/local", () => ({ default: () => ({ className: "police-document" }) }));

import { GenerateurQuittance } from "../src/app/outils/quittance-de-loyer/generateur-quittance";
import { Champ, Segments } from "../src/components/outils/champs";
import { ChiffreHero, FeuillePapier, Pastille } from "../src/components/outils/resultats";
import { CLE_STOCKAGE_QUITTANCE } from "../src/lib/outils/quittance";
import { monter, type Instance } from "./aide/hooks-sans-dom";

type El = ReactElement<Record<string, unknown>>;
type Generateur = Instance<Record<string, never>, unknown>;

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
const tous = (i: Generateur) => elements(i.rendu);
const champ = (i: Generateur, id: string) => tous(i).find((e) => e.type === Champ && e.props.id === id);
const mode = (i: Generateur) => tous(i).find((e) => e.type === Segments && e.props.nom === "q-mode");
const bouton = (i: Generateur, debut: string) =>
  tous(i).find((e) => e.type === "button" && texte(e.props.children).trim().startsWith(debut));
const parTestId = (i: Generateur, id: string) => tous(i).find((e) => e.props["data-testid"] === id || e.props.testId === id);
const total = (i: Generateur) => tous(i).find((e) => e.type === ChiffreHero && e.props.testId === "q-total")?.props.valeur;
const pastille = (i: Generateur) => texte(tous(i).find((e) => e.type === Pastille)?.props.children);
const document = (i: Generateur) => tous(i).find((e) => e.type === FeuillePapier);
/** Le bloc qui porte directement l'aperçu du document (retiré de l'impression tant qu'il est incomplet). */
const enveloppe = (i: Generateur) =>
  tous(i).find((e) => e.type === "div" && [e.props.children].flat().some((x) => isValidElement(x) && x.type === FeuillePapier));

async function demarrer(): Promise<Generateur> {
  const i = monter(GenerateurQuittance, {}) as Generateur;
  i.stabiliser();
  await i.vider();
  return i;
}
async function saisir(i: Generateur, id: string, valeur: string) {
  const el = champ(i, id);
  expect(el, `champ ${id}`).toBeDefined();
  (el!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
async function choisirMode(i: Generateur, valeur: string) {
  (mode(i)!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
async function cliquer(i: Generateur, debut: string) {
  const b = bouton(i, debut);
  expect(b, `bouton ${debut}`).toBeDefined();
  (b!.props.onClick as () => void)();
  await i.vider();
}
async function remplirLeTerme(i: Generateur) {
  await saisir(i, "q-periode", "2026-09");
  await saisir(i, "q-date", "2026-09-03");
  await saisir(i, "q-loyer", "850");
  await saisir(i, "q-charges", "120");
  await saisir(i, "q-recu", "970");
}
async function remplirLesMentions(i: Generateur) {
  await choisirMode(i, "virement");
  await saisir(i, "q-bailleur", "Durand Paul");
  await saisir(i, "q-bailleur-adresse", "3 rue Fictive, 75011 Paris");
  await saisir(i, "q-locataire", "Martin Claire");
  await saisir(i, "q-logement", "8 avenue Exemple, 69003 Lyon");
}

const CHAMPS = ["q-periode", "q-date", "q-loyer", "q-charges", "q-recu", "q-bailleur", "q-bailleur-adresse", "q-locataire", "q-logement"];
const MANQUE_DOCUMENT =
  "le mode de paiement, le nom du bailleur, l'adresse du bailleur, le nom du locataire et l'adresse du logement loué";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("outil public de quittance : rien de prérempli (Q123)", () => {
  it("au départ, et après le montage, aucun champ ne porte de valeur : ni montant, ni mois, ni date, ni mode", async () => {
    const i = await demarrer();
    for (const id of CHAMPS) expect(champ(i, id)?.props.valeur, id).toBe("");
    expect(mode(i)?.props.valeur).toBeNull();
    // Rien n'est produit : ni total, ni document, ni bouton d'impression ; le message dit tout ce qui manque.
    expect(pastille(i)).toBe("À compléter");
    expect(total(i)).toBeUndefined();
    expect(document(i)).toBeUndefined();
    expect(bouton(i, "Imprimer")).toBeUndefined();
    expect(texte(parTestId(i, "q-manque")?.props.children)).toBe(
      "Renseignez le loyer hors charges, la provision pour charges (0 si aucune), le montant reçu, le mois du terme et la date du paiement pour préparer le document."
    );
    // Le mois suivant n'a pas de mois de départ : il n'en invente pas (il partait du mois du jour).
    expect(bouton(i, "Mois suivant")?.props.disabled).toBe(true);
    expect(bouton(i, "Reprendre le total du terme")).toBeUndefined();
  });

  it("l'exemple n'est qu'un texte indicatif dans un champ vide", async () => {
    const i = await demarrer();
    expect(champ(i, "q-loyer")?.props.placeholder).toBe("Ex. 850");
    expect(champ(i, "q-charges")?.props.placeholder).toBe("Ex. 120");
    expect(champ(i, "q-recu")?.props.placeholder).toBe("Ex. 970");
    // Le montant reçu ne « suit » plus le total : l'aide le dit déclaré.
    expect(texte(champ(i, "q-recu")?.props.aide)).not.toMatch(/suit le total/i);
  });

  it("le montant reçu ne suit plus le total : il se saisit, ou se recopie à la demande", async () => {
    const i = await demarrer();
    await saisir(i, "q-loyer", "850");
    await saisir(i, "q-charges", "120");
    expect(champ(i, "q-recu")?.props.valeur).toBe("");
    expect(total(i)).toBeUndefined();
    await cliquer(i, "Reprendre le total du terme");
    expect(champ(i, "q-recu")?.props.valeur).toBe("970");
    expect(bouton(i, "Reprendre le total du terme")).toBeUndefined();
  });

  it("le terme saisi prépare le document ; il ne s'imprime qu'avec chaque mention, et le message dit lesquelles manquent", async () => {
    const i = await demarrer();
    await remplirLeTerme(i);
    expect(total(i)).toMatch(/^970,00\s€$/);
    expect(texte(parTestId(i, "q-type")?.props.children)).toBe("Quittance de loyer");
    expect(document(i)).toBeDefined();
    const imprimer = () => bouton(i, "Imprimer");
    expect(imprimer()?.props.disabled).toBe(true);
    expect(imprimer()?.props["aria-describedby"]).toBe("q-impression-manque");
    expect(texte(parTestId(i, "q-impression-manque")?.props.children)).toBe(`Pour imprimer la quittance, renseignez ${MANQUE_DOCUMENT}.`);
    // Incomplet, le document est retiré de l'impression du navigateur.
    expect(enveloppe(i)?.props.className).toBe("print:hidden");

    await remplirLesMentions(i);
    expect(imprimer()?.props.disabled).toBe(false);
    expect(imprimer()?.props["aria-describedby"]).toBeUndefined();
    expect(parTestId(i, "q-impression-manque")).toBeUndefined();
    expect(enveloppe(i)).toBeDefined();
    expect(enveloppe(i)?.props.className).toBeUndefined();
  });

  it("reçu partiel : même blocage, avec son propre libellé", async () => {
    const i = await demarrer();
    await remplirLeTerme(i);
    await saisir(i, "q-recu", "500");
    expect(texte(parTestId(i, "q-type")?.props.children)).toBe("Reçu de paiement partiel");
    expect(bouton(i, "Imprimer")?.props.disabled).toBe(true);
    expect(texte(parTestId(i, "q-impression-manque")?.props.children)).toBe(`Pour imprimer le reçu, renseignez ${MANQUE_DOCUMENT}.`);
  });

  it("« Mois suivant » avance le mois saisi et vide la date et le montant du nouveau paiement (plus de date du jour)", async () => {
    const i = await demarrer();
    await remplirLeTerme(i);
    await cliquer(i, "Mois suivant");
    expect(champ(i, "q-periode")?.props.valeur).toBe("2026-10");
    expect(champ(i, "q-date")?.props.valeur).toBe("");
    expect(champ(i, "q-recu")?.props.valeur).toBe("");
    expect(bouton(i, "Imprimer")).toBeUndefined();
    expect(texte(parTestId(i, "q-manque")?.props.children)).toBe("Renseignez le montant reçu et la date du paiement pour préparer le document.");
  });

  it("ce que l'utilisateur a demandé de retenir revient ; ni mois, ni date, ni montant reçu ne sont posés à sa place", async () => {
    const retenu = {
      bailleurNom: "Durand Paul",
      bailleurAdresse: "3 rue Fictive, 75011 Paris",
      locataireNom: "Martin Claire",
      logementAdresse: "8 avenue Exemple, 69003 Lyon",
      loyerHc: "850",
      charges: "120",
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (cle: string) => (cle === CLE_STOCKAGE_QUITTANCE ? JSON.stringify(retenu) : null),
        setItem: () => {},
        removeItem: () => {},
      },
    });
    const i = await demarrer();
    expect(champ(i, "q-bailleur")?.props.valeur).toBe("Durand Paul");
    expect(champ(i, "q-loyer")?.props.valeur).toBe("850");
    expect(champ(i, "q-charges")?.props.valeur).toBe("120");
    for (const id of ["q-periode", "q-date", "q-recu"]) expect(champ(i, id)?.props.valeur, id).toBe("");
    expect(mode(i)?.props.valeur).toBeNull();
    expect(bouton(i, "Imprimer")).toBeUndefined();
  });
});
