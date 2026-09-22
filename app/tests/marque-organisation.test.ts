import { describe, expect, it } from "vitest";
import { couleurLisible, contraste, domaineValide, emailValide, enteteMarqueHtml, logoAffichable, logoInlineValide, liensMarque, styleMarque, typeImageLogo } from "../src/lib/marque-organisation";
import { appliquerMarqueDocument } from "../src/lib/documents/marque";
import { assemblerPage, Fusion } from "../src/lib/documents/gabarit";

describe("identité agence lisible et sûre", () => {
  it.each(["#ffffff", "#ffff00", "#00ff00", "#ff00ff", "#000000", "#2457f5"])("maintient le contraste sur %s", couleur => {
    expect(contraste(couleurLisible(couleur), "#ffffff")).toBeGreaterThanOrEqual(5);
    const style = styleMarque({ couleur_primaire: couleur }) as Record<string, string>;
    expect(style["--primary"]).toBe(style["--marque"]);
    expect(style["--primary-foreground"]).toBe("#ffffff");
    expect(contraste(style["--marque-sombre"], style["--marque-clair"])).toBeGreaterThanOrEqual(4.5);
  });
  it("ignore une couleur injectée depuis la base", () => {
    expect(JSON.stringify(styleMarque({ couleur_primaire: "red; background:url(x)" }))).not.toContain("url(");
  });
  it.each(["http://127.0.0.1/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://user:password@exemple.fr/a.png", "https://exemple.fr:444/a.png", "javascript:alert(1)", "data:image/svg+xml;base64,AAAA"])("refuse un logo non sûr %s", logo => {
    expect(logoAffichable(logo)).toBeNull();
  });
  it("vérifie type image réel, taille de texte et domaine", () => {
    expect(typeImageLogo(new Uint8Array([60,115,118,103]))).toBeNull();
    expect(typeImageLogo(new Uint8Array([255,216,255,224]))).toBe("image/jpeg");
    expect(logoInlineValide("data:image/png;base64,AAAA")).toBe(true);
    expect(logoInlineValide(`data:image/png;base64,${"A".repeat(280000)}`)).toBe(false);
    expect(domaineValide("espace.agence.fr")).toBe(true);
    expect(domaineValide("espace.agence.fr/connexion")).toBe(false);
    expect(emailValide("agence@exemple.fr\r\nBcc:voleur@exemple.fr")).toBe(false);
  });
  it("échappe le nom de marque et ne charge aucune image distante dans un PDF", () => {
    const marque = { name: '<Agence "test">', logo_url: "https://exemple.fr/logo.png", couleur_primaire: "#ffffff" };
    const entete = enteteMarqueHtml(marque);
    expect(entete).toContain("&lt;Agence &quot;test&quot;&gt;");
    expect(entete).not.toContain("<img");
    const document = assemblerPage({ f: new Fusion(), titreDocument: "Bail", nomPied: "Bail", reference: "B1", corps: "<p>Conditions contractuelles</p>" });
    const marqueDoc = appliquerMarqueDocument(document, marque);
    expect(marqueDoc.html).toContain("<p>Conditions contractuelles</p>");
    expect(marqueDoc.html).toContain("&lt;Agence &quot;test&quot;&gt;");
    expect(marqueDoc.piedHtml).toContain("&lt;Agence &quot;test&quot;&gt;");
    expect(marqueDoc.manquants).toEqual(document.manquants);
    expect(marqueDoc.empreinte).toBe(document.empreinte);
  });
});

it("ne remplace les liens que par une adresse personnalisée vérifiée", () => {
  const html = '<a href="https://www.gerimmo.app/locataire/org?x=1&amp;y=2">Compte</a><a href="https://service-public.fr">Source</a>';
  const m = { domaine_personnalise: "espace.alpha.fr" };
  expect(liensMarque(html, m, "https://www.gerimmo.app")).toBe(html);
  const verifie = liensMarque(html, { ...m, domaine_personnalise_verifie_le: "2026-09-22" }, "https://www.gerimmo.app");
  expect(verifie).toContain('href="https://espace.alpha.fr/locataire/org?x=1&amp;y=2"');
  expect(verifie).toContain('href="https://service-public.fr"');
});
