import { beforeEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
import { signalerPresence } from "../src/app/actions/autonomie";

beforeEach(() => rpc.mockReset());
it("réserve la mise à jour de présence au superviseur habilité", async () => {
  rpc.mockResolvedValueOnce({ data: false, error: null });
  await expect(signalerPresence()).resolves.toBe("refusee");
  expect(rpc.mock.calls).toEqual([["is_permanent_super_admin"]]);
});
it("ne signale aucune présence quand le contrôle des droits est indisponible", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "indisponible" } });
  await expect(signalerPresence()).resolves.toBe("indisponible");
  expect(rpc.mock.calls).toEqual([["is_permanent_super_admin"]]);
});
it.each([
  [null, "confirmee"],
  [{ message: "service indisponible" }, "indisponible"],
])("renvoie le résultat effectif du signal", async (error, etat) => {
  rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ error });
  await expect(signalerPresence()).resolves.toBe(etat);
  expect(rpc.mock.calls).toEqual([["is_permanent_super_admin"],["signaler_presence_supervision"]]);
});
