/**
 * Audit final du 27/10/2026 (PUB-10) — une personne connectée qui lit la vitrine voit « Mon espace », pas « Se
 * connecter » ni « Créer mon compte ». La présence de la session se lit dans le cookie Supabase, découpé ou non.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccesEnTete, sessionPresente } from "@/components/acces-public";

describe("la session dans les cookies", () => {
  it.each([
    ["sb-127-auth-token=base64-abc", true],
    ["autre=1; sb-rddlxunppddzpsaatdaz-auth-token.0=base64-abc; sb-rddlxunppddzpsaatdaz-auth-token.1=def", true],
    ["gerimmo_activite=1", false],
    ["sb-127-auth-token-code-verifier=x", false],
    ["", false],
  ])("%s → %s", (cookies, attendu) => expect(sessionPresente(cookies)).toBe(attendu));

  it("le rendu du serveur reste celui du visiteur (pages statiques)", () => {
    const html = renderToStaticMarkup(createElement(AccesEnTete));
    expect(html).toContain("Se connecter");
    expect(html).toContain("Créer mon compte");
    expect(html).not.toContain("Mon espace");
  });
});
