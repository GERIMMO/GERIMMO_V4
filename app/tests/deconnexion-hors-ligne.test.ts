import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { MESSAGE_DECONNEXION_ECHEC, MESSAGE_DECONNEXION_HORS_LIGNE, tenterDeconnexion } from "../src/lib/deconnexion";

/**
 * VFL-02 (vérification finale, 14/10) : « Se déconnecter » hors ligne remplaçait la page par l'écran d'erreur générique
 * (« Cette page n'a pas pu s'afficher ») : l'échec réseau de l'action serveur remontait à la limite d'erreur, et la saisie
 * à l'écran disparaissait avec la page. La copie locale et la session étaient intactes, mais la personne ne le voyait pas.
 *
 * Le formulaire de déconnexion intercepte maintenant l'échec côté client et le dit. La déconnexion RÉUSSIE reste ce
 * qu'elle était : l'action redirige vers /connexion?raison=deconnecte (où les copies locales sont purgées, voir
 * copies-locales-arrivee.test.ts), et cette redirection n'est jamais avalée.
 */

const enLigne = () => true;
const horsLigne = () => false;
/** La vraie erreur de redirection de Next, telle que `redirect()` la lève dans une action serveur. */
function erreurDeRedirection(): unknown {
  try { redirect("/connexion?raison=deconnecte"); } catch (e) { return e; }
  throw new Error("redirect() n'a rien levé");
}

describe("tenterDeconnexion", () => {
  it("hors ligne : dit pourquoi, sans même envoyer la requête qui échouerait", async () => {
    const action = vi.fn(async () => undefined);
    const message = await tenterDeconnexion(action, horsLigne);
    expect(message).toBe(MESSAGE_DECONNEXION_HORS_LIGNE);
    expect(message).toContain("Déconnexion impossible hors ligne ; votre saisie est conservée");
    expect(action).not.toHaveBeenCalled();
  });

  it("l'échec réseau de l'action (« Failed to fetch ») devient un message, pas un écran d'erreur", async () => {
    const message = await tenterDeconnexion(async () => { throw new TypeError("Failed to fetch"); }, enLigne);
    expect(message).toBe(MESSAGE_DECONNEXION_ECHEC);
    expect(message).toContain("votre saisie est conservée");
    expect(message).not.toMatch(/hors ligne/);
  });

  it("la connexion perdue PENDANT l'envoi est dite hors ligne", async () => {
    let connecte = true;
    const message = await tenterDeconnexion(async () => { connecte = false; throw new TypeError("Failed to fetch"); }, () => connecte);
    expect(message).toBe(MESSAGE_DECONNEXION_HORS_LIGNE);
  });

  it("une réponse inattendue du serveur (erreur 500) est dite elle aussi, sans prétendre être hors ligne", async () => {
    const message = await tenterDeconnexion(async () => { throw new Error("An unexpected response was received from the server."); }, enLigne);
    expect(message).toBe(MESSAGE_DECONNEXION_ECHEC);
  });

  it("la déconnexion réussie (redirection de l'action) n'est jamais avalée : elle remonte à Next", async () => {
    const redirection = erreurDeRedirection();
    await expect(tenterDeconnexion(async () => { throw redirection; }, enLigne)).rejects.toBe(redirection);
  });

  it("une action qui revient sans erreur ne laisse aucun message", async () => {
    expect(await tenterDeconnexion(async () => undefined, enLigne)).toBeNull();
  });
});

describe("le formulaire de déconnexion", () => {
  it("rend un vrai formulaire (action serveur gardée pour le clic avant hydratation), non suivi, sans message au repos", async () => {
    vi.resetModules();
    vi.doMock("@/app/actions/auth", () => ({ seDeconnecter: async () => undefined }));
    const { FormulaireDeconnexion } = await import("../src/components/formulaire-deconnexion");
    const props = { className: "menu-compte-sortir", role: "menuitem" as const, children: "Se déconnecter" };
    const html = renderToStaticMarkup(createElement(FormulaireDeconnexion, props));
    vi.doUnmock("@/app/actions/auth");
    expect(html).toMatch(/<form[^>]*data-saisie-libre/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Se déconnecter<\/button>/);
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('class="menu-compte-sortir"');
    expect(html).not.toContain('role="alert"');
  });

  const SOURCES = ["src/components/menu-compte.tsx", "src/app/compte/page.tsx", "src/app/securite/page.tsx", "src/app/espaces/page.tsx"];
  it.each(SOURCES)("%s : plus de <form action={seDeconnecter}> nu, il passe par FormulaireDeconnexion", fichier => {
    const source = readFileSync(fichier, "utf8");
    expect(source).not.toMatch(/action=\{seDeconnecter\}/);
    expect(source).not.toMatch(/import \{ seDeconnecter \}/);
    expect(source).toMatch(/<FormulaireDeconnexion\b/);
    expect(source).toMatch(/import \{ FormulaireDeconnexion \} from ["']@\/components\/formulaire-deconnexion["']/);
  });

  it("le composant garde l'action serveur, intercepte l'envoi et ne purge rien lui-même", () => {
    const source = readFileSync("src/components/formulaire-deconnexion.tsx", "utf8");
    expect(source).toMatch(/action=\{seDeconnecter\}/);
    expect(source).toMatch(/onSubmit=\{/);
    expect(source).toMatch(/tenterDeconnexion\(seDeconnecter/);
    // La purge des copies locales reste à l'ARRIVÉE sur /connexion?raison=deconnecte (VER-PR178-05), jamais au clic.
    expect(source).not.toMatch(/purgerCopiesLocales/);
  });
});
