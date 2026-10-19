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
/** La revendication `amr` du jeton : d'où vient la session (audit du 19/10, g). */
const revendications = (methode: string) => ({ data: { claims: { sub: "u1", amr: [{ method: methode, timestamp: 1 }] } }, error: null });
let auth: { getUser: ReturnType<typeof vi.fn>; getClaims: ReturnType<typeof vi.fn>; updateUser: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { user_metadata: { profil_a_confirmer: { nom: "Initial" } } } } }),
    // Par défaut, la session est née d'un lien de récupération : le cas ordinaire de ce formulaire.
    getClaims: vi.fn().mockResolvedValue(revendications("recovery")),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
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
it("une confirmation d'inscription (amr email/signup) ouvre le formulaire comme un lien de récupération", async () => {
  auth.getClaims.mockResolvedValue(revendications("email/signup"));
  await expect(definirNouveauMotDePasse({}, form())).rejects.toThrow("REDIRECT /connexion?raison=mot-de-passe-modifie");
  expect(auth.updateUser).toHaveBeenCalledOnce();
});
it("connecté par mot de passe : l'action refuse, sans toucher au mot de passe, au profil ni aux sessions", async () => {
  // Audit du 19/10 (g) : la page redirige déjà, mais l'action serveur reste appelable directement par un compte
  // connecté ; elle doit refuser elle-même de poser un mot de passe sans l'ancien.
  auth.getClaims.mockResolvedValue(revendications("password"));
  expect((await definirNouveauMotDePasse({}, form())).erreur).toBe(
    "Ce formulaire est réservé au lien reçu par e-mail. Depuis votre compte, changez votre mot de passe dans « Mon compte », avec le mot de passe actuel."
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it("sans revendication lisible : même refus, rien n'est modifié", async () => {
  auth.getClaims.mockResolvedValue({ data: null, error: { message: "jeton illisible" } });
  expect((await definirNouveauMotDePasse({}, form())).erreur).toContain("réservé au lien reçu par e-mail");
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(auth.signOut).not.toHaveBeenCalled();
});
