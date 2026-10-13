/**
 * Audit du 13/10/2026 (PR178-A-03, PR178-A-05) : quand la session expire pendant la création d'une fiche, le proxy refuse
 * l'envoi avant l'action. La marque « création incertaine » posée avant l'envoi restait, le bouton restait désactivé
 * pour toujours et l'écran parlait d'une réponse perdue.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { enregistrerFicheAvecJustificatifs, type BilanCreationFiche } from "../src/lib/creation-fiche-personne";
import { MESSAGE_SESSION_EXPIREE } from "../src/lib/session-expiree";

afterEach(() => vi.unstubAllGlobals());

function actions(echec: Error) {
  const memoires: BilanCreationFiche[] = [];
  return {
    memoires,
    memoriser: async (b: BilanCreationFiche) => { memoires.push(structuredClone(b)); },
    creer: vi.fn(async () => { throw echec; }),
    deposer: vi.fn(),
    demander: vi.fn(),
  };
}

describe("création de fiche : l'envoi échoue", () => {
  it("session expirée : message dédié, la marque « incertaine » est retirée, le bouton se rouvre", async () => {
    vi.stubGlobal("location", { href: "https://exemple.test/agence/1/personnes/nouveau" });
    vi.stubGlobal("fetch", async () => ({ type: "opaqueredirect" }));
    const a = actions(new Error("redirigé"));
    const bilan = await enregistrerFicheAvecJustificatifs("org", new FormData(), [], {}, a);
    expect(bilan.erreur).toBe(MESSAGE_SESSION_EXPIREE);
    expect(bilan.creationIncertaine).toBeUndefined();
    expect(a.memoires.at(0)?.creationIncertaine).toBe(true);
    expect(a.memoires.at(-1)?.creationIncertaine).toBeUndefined();
  });

  it("réponse perdue, session ouverte : la création reste incertaine, rien n'est rejoué", async () => {
    vi.stubGlobal("location", { href: "https://exemple.test/agence/1/personnes/nouveau" });
    vi.stubGlobal("fetch", async () => ({ type: "basic", status: 200 }));
    const a = actions(new Error("réseau coupé"));
    const bilan = await enregistrerFicheAvecJustificatifs("org", new FormData(), [], {}, a);
    expect(bilan.creationIncertaine).toBe(true);
    expect(bilan.erreur).toMatch(/Vérifiez la liste des fiches/);
    expect(a.creer).toHaveBeenCalledTimes(1);
    expect(a.memoires.at(-1)?.creationIncertaine).toBe(true);
  });
});
