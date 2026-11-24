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
/** La balise d'un élément par son id, quel que soit l'ordre de ses attributs. */
const balise = (html: string, id: string) => new RegExp(`<(?:input|select|button)[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? "";
/** Aucun bouton radio de ces groupes n'est coché. */
const coches = (html: string, noms: string[]) =>
  [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => m[0]).filter((b) => noms.some((n) => b.includes(`name="${n}"`)) && /\bchecked/.test(b));
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("parcours automatique (série chargée)", () => {
  const html = renderToStaticMarkup(createElement(CalculateurIrl, { serie }));
  const t = texte(html);

  // Décision du dirigeant du 25/11/2026 : ce test affirmait l'exemple prérempli (loyer de 850 €, date un an avant le
  // dernier indice, d'où T2 2025 → T2 2026 et 859,79 €) ; aucun champ ne porte plus de valeur que l'utilisateur n'a
  // pas saisie. La source et le trimestre utilisé, qui ne s'affichent qu'avec un résultat, sont vérifiés après saisie
  // (tests/outils-irl-sans-valeur.test.ts).
  it("aucun exemple prérempli : loyer, date et trimestre vides, aucun montant, le dernier indice publié est annoncé", () => {
    for (const id of ["irl-loyer", "irl-date-bail"]) expect(html).toMatch(new RegExp(`id="${id}"[^>]*value=""`));
    expect(coches(html, ["irl-trim-bail", "irl-dpe"])).toEqual([]);
    expect(t).not.toMatch(/859,79|146,68|148,37|850,00/);
    expect(t).toContain("À compléter");
    expect(t).toMatch(/L'outil lit la série officielle de l'Insee\. Dernier indice disponible : T2 2026/);
  });

  it("l'exemple n'est qu'un texte indicatif, et chaque champ garde son libellé visible", () => {
    expect(balise(html, "irl-loyer")).toContain('value=""');
    expect(balise(html, "irl-loyer")).toContain('placeholder="Ex. 850"');
    // Les deux parcours : automatique (8 champs) et saisie manuelle (11, dont les deux listes des années).
    for (const [rendu, attendus] of [[html, 8], [renderToStaticMarkup(createElement(CalculateurIrl, { serie: null })), 11]] as const) {
      const ids = [...rendu.matchAll(/<(?:input|select)(?![^>]*type="radio")[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.length).toBe(attendus);
      for (const id of ids) expect(rendu, id).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>[^<]*[A-Za-zÀ-ÿ]`));
    }
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
    // Décision du 25/11/2026 : les trimestres et le loyer d'exemple ne sont plus préremplis non plus ; le message dit
    // désormais tout ce qui manque (il ne citait que les deux indices).
    expect(t).toContain(
      "Renseignez le loyer hors charges actuel, le trimestre et l'année de l'indice de référence, l'indice de référence, le trimestre et l'année du nouvel indice et le nouvel indice."
    );
    expect(balise(html, "irl-loyer")).toContain('value=""');
    for (const id of ["irl-annee-ref", "irl-annee-nouv"]) expect(html).toMatch(new RegExp(`id="${id}"[^>]*>\\s*<option value="" selected="">`));
    expect(coches(html, ["irl-trim-ref", "irl-trim-nouv", "irl-dpe"])).toEqual([]);
    // La lettre garde ses blancs (trimestre compris), et son bouton d'impression reste inactif, avec la raison.
    expect(t).toMatch(/Indice de référence \( ?\[trimestre\] ?\) \[indice\]/);
    const imprimer = /<button([^>]*)>(?:(?!<\/button>)[\s\S])*?Imprimer la lettre/.exec(html)?.[1] ?? "";
    expect(imprimer).toContain('disabled=""');
    expect(imprimer).toContain('aria-describedby="irl-lettre-manque"');
    expect(t).toContain("Pour imprimer la lettre, complétez d'abord le calcul du nouveau loyer");
  });
});
