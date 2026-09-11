/**
 * L'adresse d'expédition des e-mails (11/09).
 *
 * Elle était en dur sur `no-reply@gerimmo.app`. Resend refuse TOUT envoi tant
 * que le domaine de l'expéditeur n'est pas vérifié chez lui : le produit était
 * donc bloqué par une constante, clé d'API valide comprise. Elle se règle
 * désormais par l'environnement.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function chargerEmail() {
  vi.resetModules();
  return import("../src/lib/email");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("l'expéditeur", () => {
  it("sans réglage, garde l'adresse de la marque", async () => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    vi.stubEnv("RESEND_EXPEDITEUR", "");
    let envoye: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      envoye = JSON.parse(String(init.body));
      return new Response("{}", { status: 200 });
    });
    const { envoyerEmail } = await chargerEmail();
    await envoyerEmail({ to: "a@b.fr", subject: "S", html: "<p>x</p>" });
    expect(envoye!.from).toBe("Gerimmo <no-reply@gerimmo.app>");
  });

  it("se règle par l'environnement, pour démarrer avant la vérification du domaine", async () => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    vi.stubEnv("RESEND_EXPEDITEUR", "Gerimmo <onboarding@resend.dev>");
    let envoye: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      envoye = JSON.parse(String(init.body));
      return new Response("{}", { status: 200 });
    });
    const { envoyerEmail } = await chargerEmail();
    await envoyerEmail({ to: "a@b.fr", subject: "S", html: "<p>x</p>" });
    expect(envoye!.from).toBe("Gerimmo <onboarding@resend.dev>");
  });

  it("traduit le refus de domaine non vérifié, au lieu de rendre le jargon", async () => {
    // Le message brut de Resend parle de « domain » et ne dit jamais quoi
    // faire. Celui qui le lit est un gérant, pas un administrateur système.
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({ message: "The gerimmo.app domain is not verified." }),
        { status: 403 }
      )
    );
    const { envoyerEmail } = await chargerEmail();
    const r = await envoyerEmail({ to: "a@b.fr", subject: "S", html: "<p>x</p>" });
    expect(r.erreur).toMatch(/n'est pas vérifié chez Resend/);
    expect(r.erreur).toMatch(/RESEND_EXPEDITEUR/);
  });

  it("sans clé, ne prétend pas avoir envoyé", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { envoyerEmail } = await chargerEmail();
    const r = await envoyerEmail({ to: "a@b.fr", subject: "S", html: "<p>x</p>" });
    expect(r.erreur).toMatch(/non configuré/);
  });
});
