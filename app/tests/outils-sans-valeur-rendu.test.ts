/**
 * Q123 : les quatre autres outils publics (quittance, GLI / Visale, LMNP, rentabilité) suivent la règle de l'outil IRL
 * (décision du 25/11/2026, Q100). Rendu serveur de chaque composant, sans navigateur : la page telle qu'elle arrive au
 * visiteur, avant toute saisie. Le comportement après saisie : tests/outils-quittance-sans-valeur.test.ts et
 * tests/outils-calculateurs-sans-valeur.test.ts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({ default: () => ({ className: "police-document" }) }));

import { ComparateurGliVisale } from "../src/app/outils/comparateur-gli-visale/comparateur";
import { GenerateurQuittance } from "../src/app/outils/quittance-de-loyer/generateur-quittance";
import { CalculateurRentabilite } from "../src/app/outils/rentabilite-locative/calculateur-rentabilite";
import { SimulateurLmnp } from "../src/app/outils/simulateur-lmnp/simulateur";

const rendre = (composant: () => unknown) => renderToStaticMarkup(createElement(composant as () => null));
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
/** Les champs de saisie (hors boutons radio et cases à cocher). */
const champsTexte = (html: string) => [...html.matchAll(/<input(?![^>]*type="(?:radio|checkbox)")[^>]*>/g)].map((m) => m[0]);
const idDe = (balise: string) => /\bid="([^"]+)"/.exec(balise)?.[1] ?? "";
const placeholderDe = (html: string, id: string) =>
  new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0].match(/placeholder="([^"]*)"/)?.[1] ?? null;

const OUTILS = [
  {
    nom: "quittance de loyer",
    composant: GenerateurQuittance,
    exemples: { "q-loyer": "Ex. 850", "q-charges": "Ex. 120", "q-recu": "Ex. 970" },
    // Ni total, ni document, ni bouton d'impression : « Imprimer la quittance » était actif dès l'ouverture.
    absents: [/970,00/, /Imprimer (?:la quittance|le reçu)/, /id="quittance"/],
  },
  {
    nom: "comparateur GLI / Visale",
    composant: ComparateurGliVisale,
    exemples: { "cmp-loyer": "Ex. 970", "cmp-taux": "Ex. 2,7" },
    absents: [/314,28/, /165,94/, /Visale est (?:possible|exclue)/],
  },
  {
    nom: "simulateur LMNP",
    composant: SimulateurLmnp,
    exemples: { "lmnp-recettes": "Ex. 9 600", "lmnp-prix": "Ex. 160 000", "lmnp-duree-bati": "Ex. 30" },
    absents: [/2 265,60/, /554,29/, /Micro-BIC, le détail/],
  },
  {
    nom: "rentabilité locative",
    composant: CalculateurRentabilite,
    exemples: { "rt-prix": "Ex. 150 000", "rt-loyer": "Ex. 750", "rt-vacance": "Ex. 1" },
    absents: [/5,29/, /4,08/, /-350,44/],
  },
];

describe.each(OUTILS)("$nom : la page arrive vide (Q123)", ({ composant, exemples, absents }) => {
  const html = rendre(composant);
  const t = texte(html).replace(/[\u00a0\u202f]/g, " ");

  it("aucun champ ne porte de valeur, aucun bouton radio n'est coché, aucune liste n'a de choix fait", () => {
    const champs = champsTexte(html);
    expect(champs.length).toBeGreaterThan(1);
    for (const balise of champs) expect(balise, idDe(balise)).toMatch(/\bvalue=""/);
    expect([...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].filter((m) => /\bchecked/.test(m[0]))).toEqual([]);
    expect([...html.matchAll(/<option[^>]*selected[^>]*>/g)].filter((m) => !/value=""/.test(m[0]))).toEqual([]);
  });

  it("l'exemple n'est qu'un texte indicatif, et chaque champ garde son libellé visible", () => {
    for (const [id, attendu] of Object.entries(exemples)) expect(placeholderDe(html, id)?.replace(/[\u00a0\u202f]/g, " "), id).toBe(attendu);
    for (const balise of champsTexte(html)) {
      const id = idDe(balise);
      expect(html, id).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>[^<]*[A-Za-zÀ-ÿ]`));
    }
  });

  it("aucun résultat n'est affiché : la pastille dit « À compléter » et un message dit quoi saisir", () => {
    expect(t).toContain("À compléter");
    expect(t).toMatch(/Renseignez /);
    for (const motif of absents) expect(t + html, String(motif)).not.toMatch(motif);
  });
});
