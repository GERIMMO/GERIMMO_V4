/**
 * Audit final du 27/10/2026 (PUB-15) — la frontière d'erreur (error.tsx) couvre aussi la vitrine, les outils et la
 * connexion : son titre est un vrai <h1>, et le visiteur sans compte a une sortie (le formulaire de contact), au lieu
 * d'être renvoyé vers « Aide et retours », qui n'existe que connecté.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/tarifs" }));
vi.mock("@/app/actions/erreurs", () => ({ signalerErreurEcran: vi.fn() }));
import Erreur from "../src/app/error";

describe("la page d'erreur", () => {
  it("un h1, le formulaire de contact pour le visiteur, la référence affichée", () => {
    const erreur = Object.assign(new Error("panne"), { digest: "REF-1234" });
    const html = renderToStaticMarkup(createElement(Erreur, { error: erreur, reset: () => {} }));
    expect(html).toMatch(/<h1 class="titre">Cette page n(&#x27;|')a pas pu s(&#x27;|')afficher<\/h1>/);
    expect(html).toContain('href="/#contact"');
    expect(html).toContain("si vous êtes connecté");
    expect(html).toContain("réf. REF-1234");
    expect(html).toContain("Réessayer");
  });
});
