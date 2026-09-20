import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerSyntheseAlertes } from "@/lib/alertes";

function clientFactice() {
  const requete = {
    data: [],
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  requete.select.mockReturnValue(requete);
  requete.eq.mockReturnValue(requete);
  requete.or.mockReturnValue(requete);
  requete.order.mockReturnValue(requete);
  requete.limit.mockReturnValue(requete);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "compte-test" } } }) },
    from: vi.fn(() => requete),
  } as unknown as SupabaseClient;
  return { client, requete };
}

describe("visibilité de la synthèse des alertes", () => {
  it("garde la file confiée à l'utilisateur dans les espaces métier", async () => {
    const { client, requete } = clientFactice();
    await chargerSyntheseAlertes(client, { orgId: "agence-test" });
    expect(requete.or).toHaveBeenCalledWith("assigned_all.eq.true,assignee_account_id.eq.compte-test");
    expect(requete.eq).toHaveBeenCalledWith("organization_id", "agence-test");
  });

  it("montre à la supervision toutes les alertes ouvertes, quelle que soit l'affectation", async () => {
    const { client, requete } = clientFactice();
    await chargerSyntheseAlertes(client, { toutes: true });
    expect(requete.eq).toHaveBeenCalledWith("statut", "ouverte");
    expect(requete.or).not.toHaveBeenCalled();
  });
});
