import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), eq: vi.fn(), saved: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  const q = { update: mocks.update, eq: mocks.eq, select: () => q, maybeSingle: mocks.saved };
  mocks.update.mockReturnValue(q); mocks.eq.mockReturnValue(q);
  return { rpc: mocks.rpc, from: () => q };
} }));
import { reglerBlocageSouscription } from "@/app/actions/reglage-souscription";

function form(blocage = "lever", revision = "4") {
  const f = new FormData(); f.set("blocage", blocage); f.set("revision", revision); return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.saved.mockResolvedValue({ data: { revision: 5 }, error: null });
});

describe("réglage du blocage des souscriptions", () => {
  it.each([false, null, "true"])("refuse un compte non superadmin permanent (%s)", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await reglerBlocageSouscription({}, form())).erreur).toContain("supervision permanent");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuse une erreur de vérification d'accès", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: { message: "indisponible" } });
    expect((await reglerBlocageSouscription({}, form())).erreur).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([["lever", false], ["activer", true]] as const)("%s modifie seulement la règle et sa révision", async (choix, actif) => {
    expect((await reglerBlocageSouscription({}, form(choix))).succes).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledWith("is_permanent_super_admin");
    expect(mocks.update).toHaveBeenCalledWith({ blocage_souscription_identite: actif, revision: 5 });
    expect(mocks.eq).toHaveBeenCalledWith("singleton", true);
    expect(mocks.eq).toHaveBeenCalledWith("revision", 4);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/parametres");
    expect(mocks.revalidate).toHaveBeenCalledWith("/agence/[orgId]/abonnement", "page");
    expect(mocks.revalidate).toHaveBeenCalledWith("/espace/[orgId]/abonnement", "page");
  });
  it.each(["", "-1", "4.5", "NaN", "2147483647"])("refuse une révision invalide (%s)", async revision => {
    expect((await reglerBlocageSouscription({}, form("lever", revision))).erreur).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuse un choix inconnu", async () => {
    expect((await reglerBlocageSouscription({}, form("ignorer"))).erreur).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: "refus" } },
  ])("ne présente pas un succès si la révision a changé ou la base refuse", async saved => {
    mocks.saved.mockResolvedValue(saved);
    const r = await reglerBlocageSouscription({}, form());
    expect(r.erreur).toBeTruthy(); expect(r.succes).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
