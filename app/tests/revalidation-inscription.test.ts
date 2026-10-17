import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
import { definirNouveauMotDePasse } from "../src/app/actions/auth";
import { informationsAConfirmer } from "../src/lib/revalidation-inscription";

const form = (values: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [key, value] of Object.entries({ mot_de_passe: "nouveau-mot-de-passe-1", confirmation: "nouveau-mot-de-passe-1", espace: "artisan", nom: "Corrigé", cgu: "on", ...values })) f.set(key, value);
  return f;
};
let auth: { getUser: ReturnType<typeof vi.fn>; updateUser: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { user_metadata: { profil_a_confirmer: { nom: "Initial" } } } } }), updateUser: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn().mockResolvedValue({ error: null }) };
  rpc = vi.fn().mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth, rpc });
  mocks.cookies.mockResolvedValue({ delete: vi.fn() });
});

it("garde uniquement les champs proposés et borne leur longueur", () => {
  expect(informationsAConfirmer({ nom: "n".repeat(500), espace: "artisan", cgu_version: "ancienne", cgu_acceptee_le: "ancienne", inconnu: "x", telephone: 12 })).toEqual({ nom: "n".repeat(100), espace: "artisan" });
});
it("exige une acceptation explicite avant toute mise à jour", async () => {
  const f = form(); f.delete("cgu");
  expect((await definirNouveauMotDePasse({}, f)).erreur).toContain("conditions");
  expect(auth.updateUser).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
it.each([{ espace: "inconnu" }, { espace: "proprietaire_direct", nom: "" }, { nom: "n".repeat(101) }, { code_parrainage: "??" }] as Record<string, string>[])("refuse un profil invalide : %j", async (values) => {
  expect((await definirNouveauMotDePasse({}, form(values))).erreur).toBeTruthy();
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("garde le formulaire disponible si l’acceptation ne peut pas être enregistrée", async () => {
  rpc.mockResolvedValueOnce({ error: { message: "indisponible" } });
  expect((await definirNouveauMotDePasse({}, form())).erreur).toContain("enregistrée");
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("enregistre les informations validées et garde la suite d’une invitation", async () => {
  const suite = "/artisan/invitation/11111111-1111-4111-8111-111111111111";
  await expect(definirNouveauMotDePasse({}, form({ suite }))).rejects.toThrow(`REDIRECT /connexion?raison=mot-de-passe-modifie&suite=${encodeURIComponent(suite)}`);
  expect(rpc).toHaveBeenCalledWith("accepter_cgu", expect.objectContaining({ p_source: "compte" }));
  expect(auth.updateUser).toHaveBeenCalledWith({ password: "nouveau-mot-de-passe-1", data: expect.objectContaining({ nom: "Corrigé", espace: "artisan", profil_a_confirmer: null }) });
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
});
it("une récupération ordinaire conserve le profil confirmé", async () => {
  auth.getUser.mockResolvedValue({ data: { user: { user_metadata: { nom: "Valide", espace: "artisan" } } } });
  await expect(definirNouveauMotDePasse({}, form())).rejects.toThrow("REDIRECT");
  expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: "nouveau-mot-de-passe-1" });
  expect(rpc).not.toHaveBeenCalledWith("accepter_cgu", expect.anything());
});
