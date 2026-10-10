import { beforeEach, expect, it, vi } from "vitest";
const banc = vi.hoisted(() => ({ role: "proprietaire_direct", rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({ user: { id: "user" }, role: banc.role, supabase: { rpc: banc.rpc } }) }));
import { creerOuRattacherArtisan } from "@/app/agence/[orgId]/artisans/actions";
beforeEach(() => { vi.clearAllMocks(); banc.rpc.mockResolvedValue({ error: null }); });
function formulaire() {
  const form = new FormData();
  for (const [k,v] of Object.entries({ raison_sociale: "Entreprise test", siret: "12345678901234", telephone: "0600000000", metiers: "plomberie", codes_postaux: "69007" })) form.set(k,v);
  return form;
}
it("refuse la création et le rattachement par un propriétaire avant tout appel en base", async () => {
  banc.role = "proprietaire_direct";
  expect((await creerOuRattacherArtisan("org", {}, formulaire())).erreur).toBeTruthy();
  expect(banc.rpc).not.toHaveBeenCalled();
});
it.each(["admin_agence", "agent"])("conserve l’ajout pour %s", async (role) => {
  banc.role = role;
  expect((await creerOuRattacherArtisan("org", {}, formulaire())).succes).toBeTruthy();
  expect(banc.rpc).toHaveBeenCalledWith("artisan_creer_ou_rattacher", expect.objectContaining({ p_org: "org" }));
});
