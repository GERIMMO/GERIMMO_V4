/**
 * Audit de la PR #264, FL-12 — l'aide du propriétaire n'avait que sept réponses : rien sur les incidents, la colocation
 * par chambre, la reprise d'un bail ni l'invitation du locataire. Chaque rubrique principale du menu (biens, incidents,
 * locataires) a désormais au moins une réponse qui y mène ; chaque lien ouvre un écran qui existe, sous son nom.
 * Sans base.
 */
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/racine-espace-contexte", () => ({ useBaseEspace: (orgId: string) => `/espace/${orgId}` }));
vi.mock("../src/app/agence/[orgId]/profil/famille-reglages", () => ({ EnteteReglages: () => null }));

import { LIBELLES_LIEN_AIDE, QUESTIONS, THEMES_AIDE } from "@/app/agence/[orgId]/faq/questions";
import { AideProprietaire } from "@/app/agence/[orgId]/faq/aide-proprietaire";

describe("aide du propriétaire : les réponses couvrent le menu et mènent à un écran réel (FL-12)", () => {
  it("chaque rubrique principale du menu (biens, incidents, locataires) a au moins une réponse qui y mène", () => {
    for (const rubrique of ["parc", "incidents", "personnes"]) {
      expect(QUESTIONS.filter((q) => q.lien === rubrique).length, rubrique).toBeGreaterThan(0);
    }
  });

  it("chaque thème a ses réponses, et chaque réponse a un thème du filtre", () => {
    const themes = THEMES_AIDE.filter((t) => t !== "Tout");
    for (const q of QUESTIONS) expect(themes, q.question).toContain(q.theme);
    for (const t of themes) expect(QUESTIONS.some((q) => q.theme === t), t).toBe(true);
  });

  it("chaque lien ouvre un écran de l'espace qui existe, nommé par son libellé (plus de « mes finances » par défaut)", () => {
    for (const q of QUESTIONS.filter((q) => q.lien)) {
      expect(existsSync(`src/app/agence/[orgId]/${q.lien}/page.tsx`), q.lien!).toBe(true);
      expect(LIBELLES_LIEN_AIDE[q.lien!], q.lien!).toBeTruthy();
    }
    const html = renderToStaticMarkup(createElement(AideProprietaire, { orgId: "org-1", assistance: "/espace/org-1/faq#nouvelle" }));
    expect(html).toContain('href="/espace/org-1/incidents"');
    expect(html).toMatch(/href="\/espace\/org-1\/incidents">Ouvrir mes incidents/);
    expect(html).toMatch(/href="\/espace\/org-1\/parc">Ouvrir mes biens/);
    expect(html).toMatch(/href="\/espace\/org-1\/personnes">Ouvrir mes locataires/);
  });

  it("la réponse sur les messages dit qu'il faut d'abord inviter le locataire (FL-08)", () => {
    expect(QUESTIONS.find((q) => q.question === "Comment mes locataires me joignent-ils ?")?.reponse).toContain("accepté votre invitation");
  });
});
