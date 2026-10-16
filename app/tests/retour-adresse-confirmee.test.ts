import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ service: vi.fn(), rpc: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.service }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
import { GET } from "../src/app/auth/confirm/route";

const CODE = "8245fcb7-a6c0-4dcc-8f39-93a78f2bbfe1";
const COMPTE = "30c187a1-2b9a-4b4f-ac14-3a127062d89a";
const requete = (parametres = `code=${CODE}`) => new NextRequest(`https://www.gerimmo.app/auth/confirm?${parametres}`);
const cible = (r: Response) => new URL(r.headers.get("location")!);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.service.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: COMPTE, error: null });
});

it("refuse un code incomplet avant tout appel", async () => {
  const r = await GET(requete("code=incomplet"));
  expect(cible(r).searchParams.get("raison")).toBe("lien-invalide");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
});

it.each([
  { data: null, error: null },
  { data: COMPTE, error: { message: "Indisponible" } },
])("sans contexte serveur accepté, aucun échange de session", async (resultat) => {
  mocks.rpc.mockResolvedValue(resultat);
  const r = await GET(requete());
  expect(cible(r).searchParams.get("raison")).toBe("lien-invalide");
  expect(mocks.client).not.toHaveBeenCalled();
});

it("ouvre seulement le compte attendu et conserve le retour compte, sans cache", async () => {
  const auth = { exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user: { id: COMPTE }, session: {} }, error: null }) };
  mocks.client.mockResolvedValue({ auth });
  const r = await GET(requete(`code=${CODE}&next=/nouveau-mot-de-passe`));
  expect(mocks.rpc).toHaveBeenCalledWith("autoriser_retour_adresse_confirmee", { p_code: CODE });
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith(CODE);
  expect(cible(r).pathname).toBe("/compte");
  expect(r.headers.get("cache-control")).toBe("no-store");
});

it.each([
  { user: { id: COMPTE }, session: null },
  { user: { id: "autre-compte" }, session: {} },
])("une session incomplète ou incohérente est fermée localement", async (data) => {
  const auth = { exchangeCodeForSession: vi.fn().mockResolvedValue({ data, error: null }), signOut: vi.fn() };
  mocks.client.mockResolvedValue({ auth });
  const r = await GET(requete());
  expect(cible(r).searchParams.get("raison")).toBe("lien-invalide");
  expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
});

it("un refus PKCE ne produit pas de retour compte", async () => {
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ data: null, error: { message: "Refus" } }) } });
  expect(cible(await GET(requete())).searchParams.get("raison")).toBe("lien-invalide");
});

it("l'étape intermédiaire ne crée ni session ni autorisation", async () => {
  const r = await GET(requete(new URLSearchParams({ message: "Confirmation link accepted. Please proceed to confirm link sent to the other email" }).toString()));
  expect(cible(r).pathname).toBe("/auth/confirmer");
  expect(cible(r).searchParams.get("etape")).toBe("autre-adresse");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
});
