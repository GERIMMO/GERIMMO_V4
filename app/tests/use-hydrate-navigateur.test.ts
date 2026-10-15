/**
 * Décision D30 B (fiche PR178-B-04 du 13/10/2026) : le bouton d'envoi commun est inerte dans le HTML du serveur et
 * s'active à l'hydratation. tests/bouton-envoi-hydratation.test.ts rend le composant côté serveur et ne voit donc QUE
 * le premier état. Le second — « actif une fois la page prête » — se jouait nulle part : un crochet resté à « faux »
 * rendait tous les boutons d'envoi (plus de deux cents formulaires) inertes à vie, sans qu'aucun test ne rougisse
 * (relecture du lot interface-a, mutation H1).
 *
 * Ici, `useSyncExternalStore` de React est remplacé par ce que React en fait réellement : l'instantané SERVEUR pendant
 * le rendu du serveur et l'hydratation, l'instantané NAVIGATEUR dès que la page est prête. On rend le composant dans
 * l'une puis l'autre phase. La preuve au navigateur (HTML sans script : désactivé ; script chargé : actif ; script
 * retardé : la bascule) est e2e/bouton-envoi-hydratation.spec.ts.
 */
import { createElement, type ElementType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const phase = vi.hoisted(() => ({ courante: "serveur" as "serveur" | "navigateur" }));
vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const useSyncExternalStore = <T,>(_abonner: unknown, instantane: () => T, instantaneServeur?: () => T): T => {
    if (phase.courante === "navigateur") return instantane();
    if (!instantaneServeur) throw new Error("useSyncExternalStore sans instantané serveur : React refuse de rendre côté serveur");
    return instantaneServeur();
  };
  return { ...reel, useSyncExternalStore };
});

import { BoutonEnvoi } from "../src/components/ui/bouton-envoi";
import { AIDE_BOUTON_EN_ATTENTE, useHydrate } from "../src/lib/use-hydrate";

const rendre = (type: ElementType, props: Record<string, unknown> | null, ...enfants: ReactNode[]) =>
  renderToStaticMarkup(createElement(type, props, ...enfants));
const bouton = (html: string) => /<button\b[^>]*>/.exec(html)?.[0] ?? "";
const desactive = (html: string) => /\bdisabled=""/.test(bouton(html));
const Sonde = () => createElement("span", null, useHydrate() ? "prete" : "en-attente");

afterEach(() => {
  phase.courante = "serveur";
});

describe("useHydrate : serveur d'abord, navigateur ensuite", () => {
  it("rend « en attente » pendant le rendu du serveur et l'hydratation", () => {
    phase.courante = "serveur";
    expect(rendre(Sonde, null)).toBe("<span>en-attente</span>");
  });

  it("rend « prête » dès que la page est prête dans le navigateur", () => {
    phase.courante = "navigateur";
    expect(rendre(Sonde, null)).toBe("<span>prete</span>");
  });
});

describe("BoutonEnvoi, des deux côtés de l'hydratation", () => {
  it("serveur : désactivé, avec l'infobulle qui dit pourquoi", () => {
    phase.courante = "serveur";
    const html = rendre("form", null, createElement(BoutonEnvoi, null, "Enregistrer"));
    expect(desactive(html)).toBe(true);
    expect(html).toContain(`title="${AIDE_BOUTON_EN_ATTENTE}"`);
  });

  it("navigateur : actif, et l'infobulle d'attente a disparu", () => {
    phase.courante = "navigateur";
    const html = rendre("form", null, createElement(BoutonEnvoi, null, "Enregistrer"));
    expect(desactive(html)).toBe(false);
    expect(html).not.toContain(AIDE_BOUTON_EN_ATTENTE);
    expect(html).toContain("Enregistrer");
  });

  it("navigateur : l'infobulle de l'appelant est rendue telle quelle", () => {
    phase.courante = "navigateur";
    expect(rendre(BoutonEnvoi, { title: "Enregistre votre profil" }, "Enregistrer")).toContain('title="Enregistre votre profil"');
  });

  it("navigateur : reste désactivé quand l'appelant le demande ou qu'un envoi est en cours", () => {
    phase.courante = "navigateur";
    expect(desactive(rendre(BoutonEnvoi, { disabled: true }, "Enregistrer"))).toBe(true);
    expect(desactive(rendre(BoutonEnvoi, { enCours: true, enCoursTexte: "Envoi…" }, "Enregistrer"))).toBe(true);
  });

  it("`envoiNatif` : actif des deux côtés, sans attendre la page", () => {
    for (const p of ["serveur", "navigateur"] as const) {
      phase.courante = p;
      const html = rendre(BoutonEnvoi, { envoiNatif: true }, "Créer mon compte");
      expect(desactive(html), p).toBe(false);
      expect(html, p).not.toContain(AIDE_BOUTON_EN_ATTENTE);
    }
  });
});
