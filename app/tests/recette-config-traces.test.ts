import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// RECETTE DE PRODUCTION — AUCUNE TRACE PLAYWRIGHT, JAMAIS.
//
// Une trace Playwright enregistre le réseau : en-têtes Cookie et Set-Cookie, donc les
// cookies de session Supabase (jeton d'accès et jeton de rafraîchissement) des comptes
// qui parcourent le site. Playwright n'offre aucune option pour les en retirer, et le
// rapport HTML recopie les pièces jointes dans son dossier. Le dépôt est public et
// l'artefact du chantier téléchargeable : la trace et la vidéo restent coupées partout,
// au niveau général comme dans chaque projet. Une capture d'écran d'échec (données
// fictives, sans cookie) reste admise, mais jamais systématique.
//
// Garde sans base, dans l'esprit de recette-ephemere-garde.test.ts : la configuration
// est importée telle que Playwright la charge (la cible est vérifiée au chargement).

type Reglages = { trace?: unknown; video?: unknown; screenshot?: unknown };
type Projet = { name?: string; use?: Reglages };
type Config = { use?: Reglages; projects?: Projet[] };

describe("recette de production : configuration Playwright sans trace", () => {
  let config: Config;
  const sansCopie = process.env.PLAYWRIGHT_NO_COPY_PROMPT;

  beforeAll(async () => {
    vi.stubEnv("RECETTE_URL", "http://localhost:3000");
    config = (await import("../e2e/recette-production/playwright.config")).default as Config;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (sansCopie === undefined) delete process.env.PLAYWRIGHT_NO_COPY_PROMPT;
    else process.env.PLAYWRIGHT_NO_COPY_PROMPT = sansCopie;
  });

  it("coupe la trace et la vidéo pour tous les tests", () => {
    expect(config.use?.trace).toBe("off");
    expect(config.use?.video).toBe("off");
  });

  it("ne prend jamais de capture d'écran systématique", () => {
    expect(config.use?.screenshot).not.toBe("on");
    expect(config.use?.screenshot).toBe("only-on-failure");
  });

  it("n'autorise aucun projet à rallumer la trace ou la vidéo", () => {
    expect(config.projects?.length).toBeGreaterThan(0);
    for (const projet of config.projects ?? []) {
      expect([undefined, "off"], `trace du projet ${projet.name}`).toContain(projet.use?.trace);
      expect([undefined, "off"], `vidéo du projet ${projet.name}`).toContain(projet.use?.video);
      expect(projet.use?.screenshot, `capture du projet ${projet.name}`).not.toBe("on");
    }
  });

  it("refuse la copie de l'instantané ARIA d'échec dans le rapport", () => {
    expect(process.env.PLAYWRIGHT_NO_COPY_PROMPT).toBe("1");
  });
});
