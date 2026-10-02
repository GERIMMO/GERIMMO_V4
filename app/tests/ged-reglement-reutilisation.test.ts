import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { deposerFichierGed } from "../src/lib/ged-depot";

const pdf = () => new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF"], "reglement.pdf", { type: "application/pdf" });
function client(type: string) {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "document-existant", titre: "Règlement", type } }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  return { db: { from } as unknown as SupabaseClient, query, from };
}
const user = { id: "gestionnaire" } as User;
describe("réutilisation du règlement identique", () => {
  it("réutilise le règlement visible de la même organisation sans téléverser ni créer de copie", async () => {
    const { db, query, from } = client("reglement_copropriete");
    const r = await deposerFichierGed(db, user, "organisation", pdf(), "reglement_copropriete", "Règlement", { reutiliserReglement: true });
    expect(r.documentId).toBe("document-existant");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "organisation");
    expect(query.is).toHaveBeenCalledWith("purged_at", null);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("ne réutilise jamais un autre type de document", async () => {
    const { db } = client("bail");
    expect((await deposerFichierGed(db, user, "organisation", pdf(), "reglement_copropriete", "Règlement", { reutiliserReglement: true })).documentId).toBeUndefined();
  });
  it("conserve le refus des doublons pour les baux et les nouvelles versions", async () => {
    const { db } = client("reglement_copropriete");
    for (const [type, options] of [["bail", { reutiliserReglement: true }], ["reglement_copropriete", { reutiliserReglement: true, remplaceId: "ancien" }], ["reglement_copropriete", {}]] as const) {
      const r = await deposerFichierGed(db, user, "organisation", pdf(), type, "Document", options);
      expect(r.erreur).toMatch(/identique/);
    }
  });
});
