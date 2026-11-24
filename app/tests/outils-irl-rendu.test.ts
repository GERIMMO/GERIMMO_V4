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

  it("saisie manuelle des deux indices, avec un message discret", () => {
    expect(html).toContain('data-testid="irl-serie-indisponible"');
    expect(html).toContain('id="irl-indice-ref"');
    expect(html).toContain('id="irl-indice-nouv"');
    expect(html).not.toContain("Saisir les indices moi-même");
  });

  // Défauts d'écran E054 = E167 (passe 1) : les deux indices démarraient avec l'exemple écrit dans le code (146,68 et
  // 148,37). Sans série lue, l'écran affichait « Indices cohérents », un nouveau loyer de 859,79 € et une lettre
  // imprimable fondés sur des indices que personne n'avait relevés chez l'Insee.
  it("aucun indice n'est prérempli : pas de montant ni d'« Indices cohérents » tant qu'ils ne sont pas saisis", () => {
    const t = texte(html);
    for (const champ of ["irl-indice-ref", "irl-indice-nouv"]) expect(html).toMatch(new RegExp(`id="${champ}"[^>]*value=""`));
    expect(t).not.toMatch(/146,68|148,37|859,79/);
    expect(t).not.toContain("Indices cohérents");
    expect(t).toContain("À compléter");
    expect(t).toContain("Renseignez l'indice de référence, le nouvel indice.");
    // La lettre garde ses blancs, et son bouton d'impression reste inactif.
    expect(t).toMatch(/Indice de référence \(T2 2025\) \[indice\]/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Imprimer la lettre/);
  });
});
