import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { signaler, effet } = vi.hoisted(() => ({ signaler: vi.fn(), effet: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useEffect: effet }));
vi.mock("@/app/actions/autonomie", () => ({ signalerPresence: signaler }));
import { PresenceSupervision } from "../src/components/presence-supervision";

function ouvrir() {
  PresenceSupervision();
  return effet.mock.calls[0][0]() as () => void;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  signaler.mockReset().mockResolvedValue("confirmee");
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("reprend un échec du serveur et s'arrête après confirmation", async () => {
  signaler.mockResolvedValueOnce("indisponible");
  const fermer = ouvrir();
  await vi.advanceTimersByTimeAsync(25_000);
  expect(signaler).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(signaler).toHaveBeenCalledTimes(2);
  fermer();
});
it("attend le réseau, reprend une seule fois, même si la seconde réponse échoue", async () => {
  signaler.mockRejectedValue(new Error("503"));
  vi.stubGlobal("navigator", { onLine: false });
  const fermer = ouvrir();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(signaler).toHaveBeenCalledTimes(1);
  vi.stubGlobal("navigator", { onLine: true });
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(signaler).toHaveBeenCalledTimes(2);
  fermer();
});
it.each(["confirmee", "refusee"])("ne relance pas une réponse %s", async statut => {
  signaler.mockResolvedValue(statut);
  const fermer = ouvrir();
  await vi.advanceTimersByTimeAsync(25_000);
  window.dispatchEvent(new Event("online"));
  expect(signaler).toHaveBeenCalledTimes(1);
  fermer();
});
it("sortir de la supervision pendant un appel empêche toute relance", async () => {
  let finir!: (valeur: string) => void;
  signaler.mockReturnValue(new Promise(resolve => { finir = resolve; }));
  const fermer = ouvrir();
  fermer();
  finir("indisponible");
  await vi.advanceTimersByTimeAsync(30_000);
  window.dispatchEvent(new Event("online"));
  expect(signaler).toHaveBeenCalledTimes(1);
});
