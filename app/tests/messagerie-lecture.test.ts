import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { totalMessagesNonLus } from "../src/lib/messagerie";
function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) } as unknown as SupabaseClient;
}
describe("messages non lus", () => {
  it("distingue un échec de lecture d’une messagerie à jour", async () => {
    expect(await totalMessagesNonLus(client(null, {}), "org")).toBeNull();
    expect(await totalMessagesNonLus(client([]), "org")).toBe(0);
  });
  it("additionne les comptes renvoyés par le périmètre serveur", async () => {
    expect(await totalMessagesNonLus(client([{ non_lus: 2 }, { non_lus: 3 }]), "org")).toBe(5);
  });
});
