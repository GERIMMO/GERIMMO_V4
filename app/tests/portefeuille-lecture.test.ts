import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "../src/lib/portefeuille";

function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, supabase: { rpc } as unknown as SupabaseClient };
}
describe("périmètre des incidents", () => {
  it("distingue une panne d’un portefeuille vide sans ouvrir le parc", async () => {
    const c = client(null, { message: "indisponible" });
    const lots = await lotsDuPortefeuille(c.supabase, "org", "agent", "compte");
    expect(lots).toBeInstanceOf(PortefeuilleIndisponible);
    expect(lots?.size).toBe(0);
  });
  it("conserve la liste serveur, y compris les lots non confiés", async () => {
    const c = client(["lot-nouveau", "lot-confie"]);
    expect(await lotsDuPortefeuille(c.supabase, "org", "agent", "compte"))
      .toEqual(new Set(["lot-nouveau", "lot-confie"]));
    expect(c.rpc).toHaveBeenCalledWith("lots_de_mon_portefeuille", { p_org: "org" });
  });
  it("ne transforme pas une agence entière en portefeuille vide", async () => {
    const c = client(null, {});
    expect(await lotsDuPortefeuille(c.supabase, "org", "admin", "compte")).toBeNull();
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
