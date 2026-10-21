import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ modifier: vi.fn() }));
vi.mock("react", async original => {
  const reel = await original<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  function useCallback<T>(fn: T, deps: readonly unknown[]) {
    const r = hooks.useRef({ fn, deps });
    if (deps.some((d, i) => !Object.is(d, r.current.deps[i]))) r.current = { fn, deps };
    return r.current.fn;
  }
  return { ...reel, ...hooks, useCallback, useContext: () => null };
});
vi.mock("@/lib/brouillon-fichiers", async original => ({
  ...await original<typeof import("@/lib/brouillon-fichiers")>(), modifierCopieFichiers: m.modifier,
}));
vi.mock("@/lib/garde-copie-locale", () => ({ installerGardeCopieLocale: () => () => {} }));
import { useCopieFichiers, DELAI_COPIE_LOCALE_MS } from "@/components/reprise-locale";
import { monter } from "./aide/hooks-sans-dom";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("document", new EventTarget()); vi.stubGlobal("window", new EventTarget());
  m.modifier.mockReset().mockImplementation(async (_cle, _revision, donnees) => donnees === null ? null : { revision: crypto.randomUUID(), date: Date.now(), donnees });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ordre de conservation de la copie locale", () => {
  it("une réponse serveur ne peut pas être remplacée par la frappe différée précédente", async () => {
    const i = monter(() => useCopieFichiers<{ envoye: boolean; bilan: string }>("incident-fictif", null), {});
    i.stabiliser();
    i.rendu.differer({ envoye: false, bilan: "" });
    await i.rendu.enregistrer({ envoye: true, bilan: "Photos à reprendre" });
    await vi.advanceTimersByTimeAsync(DELAI_COPIE_LOCALE_MS + 1); await i.vider();
    expect(m.modifier.mock.calls.map(c => c[2])).toEqual([{ envoye: true, bilan: "Photos à reprendre" }]);
    i.demonter();
  });
  it("la frappe suivante reste conservée après un enregistrement immédiat", async () => {
    const i = monter(() => useCopieFichiers<string>("fiche-fictive", null), {}); i.stabiliser();
    await i.rendu.enregistrer("confirmé"); i.rendu.differer("nouvelle saisie");
    await vi.advanceTimersByTimeAsync(DELAI_COPIE_LOCALE_MS + 1); await i.vider();
    expect(m.modifier.mock.calls.map(c => c[2])).toEqual(["confirmé", "nouvelle saisie"]);
    i.demonter();
  });
  it("une copie effacée après succès ne réapparaît pas à la fin du délai", async () => {
    const i = monter(() => useCopieFichiers<string>("fiche-fictive", null), {}); i.stabiliser();
    i.rendu.differer("ancienne saisie"); await i.rendu.enregistrer(null);
    await vi.advanceTimersByTimeAsync(DELAI_COPIE_LOCALE_MS + 1); await i.vider();
    expect(m.modifier.mock.calls.map(c => c[2])).toEqual([null]);
    i.demonter();
  });
});
