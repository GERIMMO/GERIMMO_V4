import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatutCopieLocale, statutStableSuivant } from "@/components/reprise-locale";

// PR178-A-06 : la région role="status" de la copie locale alternait deux phrases
// (« Conservation… » / « …conservés ») à chaque écriture : 25 changements de texte
// pour 12 caractères, donc autant d'annonces au lecteur d'écran. « attente » n'est
// qu'un passage : la région annoncée ne doit bouger que sur un état stable.
type Statut = Parameters<typeof StatutCopieLocale>[0]["statut"];
const rendre = (statut: Statut) => renderToStaticMarkup(createElement(StatutCopieLocale, { statut }));
const regionAnnoncee = (html: string) => /<p[^>]*role="status"[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? null;

describe("PR178-A-06 : annonces de la copie locale", () => {
  it("douze frappes ne produisent qu’un changement de la région annoncée", () => {
    // Une écriture par pause de frappe : vide → (attente → conserve) × n.
    const sequence: Statut[] = ["vide"];
    for (let i = 0; i < 12; i++) sequence.push("attente", "conserve");
    let stable: Statut = "vide";
    const annonces: Statut[] = [];
    for (const courant of sequence) { stable = statutStableSuivant(stable, courant); annonces.push(stable); }
    const changements = annonces.filter((s, i) => i > 0 && s !== annonces[i - 1]).length;
    expect(changements).toBe(1); // vide → conserve, une seule fois
    expect(annonces).not.toContain("attente");
  });

  it("« attente » ne change pas la région annoncée mais reste visible", () => {
    const html = rendre("attente");
    const region = regionAnnoncee(html);
    expect(region).toBeTruthy();
    expect(region).not.toMatch(/Conservation de votre saisie/);
    expect(html).toContain("Conservation de votre saisie sur cet appareil…"); // texte visible
    expect(html).toMatch(/aria-hidden="true"[^>]*>Conservation de votre saisie/); // sans doublon pour le lecteur d’écran
  });

  it("l’état conservé est annoncé une fois, avec la mise en garde du poste partagé", () => {
    const html = rendre("conserve");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain('role="alert"');
    expect(regionAnnoncee(html)).toMatch(/Évitez un appareil partagé/);
  });

  it("l’état vide garde lui aussi la mise en garde", () => {
    expect(regionAnnoncee(rendre("vide"))).toMatch(/Évitez un appareil partagé/);
  });

  it.each(["refuse", "conflit"] as const)("%s reste une alerte, sans doublon dans la région polie", statut => {
    const html = rendre(statut);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(regionAnnoncee(html)).toBe("");
  });

  it("un retour à l’état conservé après une alerte est de nouveau annoncé", () => {
    let stable: Statut = "conserve";
    stable = statutStableSuivant(stable, "refuse");
    expect(stable).toBe("refuse");
    stable = statutStableSuivant(stable, "attente");
    expect(stable).toBe("refuse");
    stable = statutStableSuivant(stable, "conserve");
    expect(stable).toBe("conserve");
  });

  // Même constat : après « Reprendre ma saisie », le bouton disparaît et le focus tombait sur le body.
  it("le focus est rendu au titre du formulaire repris", () => {
    const reprise = readFileSync("src/components/reprise-locale/index.tsx", "utf8");
    expect(reprise).toContain('document.querySelector<HTMLElement>("[data-titre-reprise]")?.focus(');
    expect((reprise.match(/deplacerFocus\.current = true/g) ?? []).length).toBe(2); // reprendre et effacer
    for (const f of ["src/app/agence/[orgId]/personnes/formulaire-personne.tsx", "src/app/locataire/[orgId]/incident/formulaire-incident-locataire.tsx"]) {
      expect(readFileSync(f, "utf8")).toMatch(/tabIndex=\{-1\} data-titre-reprise>/);
    }
  });
});
