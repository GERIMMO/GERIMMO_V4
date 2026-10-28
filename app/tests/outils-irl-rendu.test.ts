/**
 * Outil « Calcul IRL » (30/09) : rendu du parcours automatique quand la
 * série de l'Insee est chargée (fixture), et repli en saisie manuelle quand
 * elle ne l'est pas. Rendu serveur du composant, sans navigateur.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({ default: () => ({ className: "police-document" }) }));

import { CalculateurIrl } from "../src/app/outils/calcul-irl/calculateur-irl";
import { lireSerieSdmx } from "../src/lib/outils/irl-insee";

const serie = lireSerieSdmx(readFileSync(path.resolve(__dirname, "fixtures", "insee-irl-generic.xml"), "utf8"));
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("parcours automatique (série chargée)", () => {
  const html = renderToStaticMarkup(createElement(CalculateurIrl, { serie }));
  const t = texte(html);

  it("l'exemple part du dernier trimestre publié : T2 2025 → T2 2026, 850 € → 859,79 €", () => {
    expect(t).toMatch(/Nouveau loyer hors charges 859,79/);
    expect(t).toMatch(/Indice de référence \(T2 2025\) 146,68/);
    expect(t).toMatch(/Nouvel indice \(T2 2026\) 148,37/);
  });

  it("dit sa source, le trimestre utilisé et le dernier indice disponible", () => {
    expect(t).toMatch(/Source : Insee, publié au Journal officiel/);
    expect(t).toMatch(/Trimestre utilisé : T2/);
    expect(t).toMatch(/Dernier indice disponible : T2 2026/);
  });

  it("tout reste modifiable, et la saisie manuelle n'est pas affichée", () => {
    expect(t).toContain("Saisir les indices moi-même");
    expect(html).not.toContain('id="irl-indice-ref"');
    expect(html).toContain('id="irl-date-bail"');
  });
});

describe("repli (série indisponible)", () => {
  const html = renderToStaticMarkup(createElement(CalculateurIrl, { serie: null }));
  const t = texte(html);

  it("saisie manuelle des deux indices, avec une alerte visible", () => {
    expect(html).toContain('data-testid="irl-serie-indisponible"');
    expect(t).toContain("Les indices de l'Insee n'ont pas pu être chargés");
    expect(html).toContain('id="irl-indice-ref"');
    expect(html).toContain('id="irl-indice-nouv"');
    expect(html).not.toContain("Saisir les indices moi-même");
  });

  // Audit final (PUB-02) : les indices d'exemple (146,68 / 148,37) étaient pré-remplis comme de vraies valeurs, la
  // pastille disait « Indices cohérents » et une lettre à 859,79 € était prête à imprimer, pendant que la page
  // affirmait qu'aucune valeur d'indice n'est écrite dans l'outil.
  it("les deux indices partent vides, marqués comme exemples : ni verdict, ni lettre, ni impression", () => {
    const champ = (id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    expect(champ("irl-indice-ref")).toContain('value=""');
    expect(champ("irl-indice-ref")).toContain('placeholder="ex. 146,68"');
    expect(champ("irl-indice-nouv")).toContain('value=""');
    expect(t).not.toContain("Indices cohérents");
    expect(t).toContain("À compléter");
    expect(t).not.toContain("859,79");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[\s\S]*?Imprimer la lettre/);
  });

  it("la page ne prétend plus qu'aucune valeur d'indice n'est écrite dans l'outil", () => {
    const page = readFileSync(path.resolve(__dirname, "../src/app/outils/calcul-irl/page.tsx"), "utf8");
    expect(page).not.toContain("Aucune valeur d&apos;indice");
    expect(page).toContain("si la série est indisponible, saisissez-les vous-même");
  });
});
