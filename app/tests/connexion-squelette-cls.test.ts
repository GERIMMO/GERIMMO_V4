import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// PRF-01 : sur mobile et réseau lent, la page de connexion affichait d'abord le
// titre et le chapeau seuls, centrés à mi-hauteur (le formulaire attend le JS : il
// lit l'URL avec useSearchParams, donc se rend côté client sous le <Suspense>) ;
// le formulaire arrivait ensuite et le bloc remontait de 220 px (CLS 0,212).
// Le <Suspense> garde désormais la place du formulaire : le bloc a sa hauteur
// finale dès le premier affichage et le titre ne bouge plus.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  // Hors navigateur, le formulaire ne peut pas lire l'URL : il se suspend, comme avant l'hydratation.
  useSearchParams: () => { throw new Error("BAILOUT_TO_CLIENT_SIDE_RENDERING"); },
}));

describe("PRF-01 : premier affichage de /connexion", () => {
  it("réserve la place du formulaire pendant qu'il se charge", async () => {
    const { default: PageConnexion } = await import("../src/app/connexion/page");
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(createElement(PageConnexion));
    erreurs.mockRestore();
    expect(html).not.toContain("<form");
    expect(html).toContain("<h1>Connexion</h1>");
    const reserve = /data-squelette-connexion[^>]*class="([^"]*)"|class="([^"]*)"[^>]*data-squelette-connexion/.exec(html);
    expect(reserve, "un repli doit tenir la place du formulaire").not.toBeNull();
    // 439 px mesurés pour la carte du formulaire (27,4 rem) : le repli en garde au moins autant.
    expect(reserve![1] ?? reserve![2]).toMatch(/min-h-\[27\.5rem\]/);
    expect(html).toMatch(/aria-hidden="true"[^>]*data-squelette-connexion|data-squelette-connexion[^>]*aria-hidden="true"/);
  });
});
