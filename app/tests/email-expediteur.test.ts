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
    expect(r.erreur).toMatch(/adresse d’envoi doit encore être vérifiée/);
    expect(r.erreur).not.toMatch(/RESEND_EXPEDITEUR/);
  });

  it("sans clé, ne prétend pas avoir envoyé", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { envoyerEmail } = await chargerEmail();
    const r = await envoyerEmail({ to: "a@b.fr", subject: "S", html: "<p>x</p>" });
    expect(r.erreur).toMatch(/non configuré/);
  });
});

it("transmet une pièce jointe et la clé anti-doublon, et conserve la référence du prestataire", async () => {
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-test" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const { envoyerEmail } = await chargerEmail();
  expect(await envoyerEmail({ to: "a@b.fr", subject: "Rapport", html: "<p>Votre PDF</p>", piecesJointes: [{ nom: "rapport.pdf", contenuBase64: "cGRm" }], cleIdempotence: "rapport/test" })).toEqual({ id: "message-test" });
  const requete = fetch.mock.calls[0][1];
  expect(requete.headers["Idempotency-Key"]).toBe("rapport/test");
  expect(JSON.parse(requete.body).attachments).toEqual([{ filename: "rapport.pdf", content: "cGRm" }]);
});


async function emailAvecMarque(marque: Record<string, unknown>) {
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
  vi.stubEnv("RESEND_EXPEDITEUR", "Gerimmo <no-reply@gerimmo.app>");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "mail" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: marque, error: null }) };
  const db = { from: () => query } as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { envoyerEmail } = await chargerEmail();
  await envoyerEmail({ to: "locataire@exemple.fr", subject: "Avis", html: "<p>Loyer</p>", organisation: { db, id: "agence" } });
  return JSON.parse(fetch.mock.calls[0][1].body);
}
it("une adresse seulement enregistrée ne devient jamais un expéditeur", async () => {
  const mail = await emailAvecMarque({ name: "Agence Alpha", email_contact: "contact@alpha.fr", email_expediteur: "gestion@alpha.fr" });
  expect(mail.from).toBe("Agence Alpha <no-reply@gerimmo.app>");
  expect(mail.reply_to).toBe("contact@alpha.fr");
  expect(mail.html).toContain("Agence Alpha");
});
it("une adresse vérifiée porte la marque agence sans injection d’en-tête", async () => {
  const mail = await emailAvecMarque({ nom_portail: 'Alpha <faux>\r\n', email_expediteur: "gestion@alpha.fr", email_expediteur_verifie_le: "2026-09-22T10:00:00Z" });
  expect(mail.from).toBe("Alpha faux <gestion@alpha.fr>");
});
