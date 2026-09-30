/**
 * Inviter un agent (audit du 30/09, M2 et M4) : le lien de l'e-mail au compte
 * déjà existant suit la configuration (adresseDuSite), jamais l'en-tête
 * `Origin` de la requête ; sans adresse configurée, l'e-mail ne part pas et
 * l'admin le sait. Le lien d'un compte nouveau compte dans la limite de
 * l'organisation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ gerant: vi.fn(), email: vi.fn(), lien: vi.fn(), revalidate: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: mocks.gerant }));
vi.mock("@/lib/email", () => ({ envoyerEmail: mocks.email }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: mocks.lien }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { inviterAgent } from "../src/app/actions/organisation";

const ORG = "11111111-1111-4111-8111-111111111111";

function admin(compteDejaExistant: boolean) {
  const rpc = vi.fn(async () => ({ data: [{ email: "agent@agence.fr", compte_deja_existant: compteDejaExistant }], error: null }));
  mocks.gerant.mockResolvedValue({ supabase: { rpc }, user: { id: "admin" }, role: "admin_agence" });
  return rpc;
}
const form = () => { const f = new FormData(); f.set("email", " Agent@Agence.fr "); return f; };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.email.mockResolvedValue({ id: "courriel" });
  mocks.lien.mockResolvedValue({});
  // Un en-tête Origin forgé : il ne doit jamais apparaître dans l'e-mail.
  mocks.headers.mockResolvedValue(new Headers({ origin: "https://pirate.example" }));
});

describe("inviterAgent — compte déjà existant", () => {
  it("le lien « Ouvrir mes espaces » suit la configuration, pas l'en-tête Origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app/");
    admin(true);
    const r = await inviterAgent(ORG, {}, form());
    expect(r.succes).toMatch(/retrouve l’agence/);
    const html = String(mocks.email.mock.calls[0][0].html);
    expect(html).toContain('href="https://www.gerimmo.app/espaces"');
    expect(html).not.toContain("pirate.example");
    expect(mocks.lien).not.toHaveBeenCalled();
  });

  it("sans adresse configurée, refuse d'envoyer et le dit à l'admin — l'adhésion, elle, est faite", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const rpc = admin(true);
    const r = await inviterAgent(ORG, {}, form());
    expect(rpc).toHaveBeenCalledWith("inviter_agent", { p_org: ORG, p_email: "agent@agence.fr" });
    expect(mocks.email).not.toHaveBeenCalled();
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("fait partie de l’équipe");
    expect(r.succes).toContain("NEXT_PUBLIC_SITE_URL");
    expect(mocks.revalidate).toHaveBeenCalled();
  });
});

describe("inviterAgent — compte nouveau", () => {
  it("confie le lien à la fabrique, dans la limite de l'organisation", async () => {
    admin(false);
    const r = await inviterAgent(ORG, {}, form());
    expect(mocks.lien).toHaveBeenCalledWith({
      email: "agent@agence.fr",
      motif: "invitation_agent",
      next: "/nouveau-mot-de-passe",
      organisation: ORG,
    });
    expect(r.succes).toMatch(/Invitation envoyée/);
  });

  it("dit le refus de la limite à l'admin", async () => {
    admin(false);
    mocks.lien.mockResolvedValue({ erreur: "Trop d’invitations envoyées par cette organisation en une heure. Réessayez plus tard.", limite: true });
    const r = await inviterAgent(ORG, {}, form());
    expect(r.succes).toContain("Trop d’invitations");
  });

  it("réservé à l'admin de l'agence", async () => {
    mocks.gerant.mockResolvedValue({ supabase: {}, user: { id: "agent" }, role: "agent" });
    expect((await inviterAgent(ORG, {}, form())).erreur).toMatch(/Réservé/);
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.lien).not.toHaveBeenCalled();
  });
});
