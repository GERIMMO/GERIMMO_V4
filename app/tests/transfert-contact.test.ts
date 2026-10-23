import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurationTransfert, lireCorpsBorne, traiterTransfertContact } from "../src/lib/transfert-contact";

const NOW = Date.parse("2026-10-22T10:00:00Z");
const ID = "11111111-2222-4333-8444-555555555555";
const SECRET = Buffer.alloc(32, 7);
const ENV = { RESEND_CONTACT_TRANSFERT_ACTIF: "true", RESEND_CONTACT_TRANSFERT_VERS: "dirigeant@example.invalid", RESEND_API_KEY: "test-local", RESEND_CONTACT_WEBHOOK_SECRET: `whsec_${SECRET.toString("base64")}` };
const MIME = [
  'From: "Client" <client@example.invalid>',
  'To: contact@gerimmo.app',
  'Cc: autre@example.invalid',
  'Reply-To: reponse@example.invalid',
  'Subject: Demande et photo',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="test"', '',
  '--test', 'Content-Type: text/plain; charset=utf-8', '', 'Bonjour, voici la photo.',
  '--test', 'Content-Type: image/png', 'Content-Disposition: inline; filename="photo.png"',
  'Content-ID: <photo1>', 'Content-Transfer-Encoding: base64', '', 'aGVsbG8=', '--test--', '',
].join('\r\n');

function requete(overrides: Record<string, unknown> = {}, stamp = NOW / 1000, signatureValide = true) {
  const body = JSON.stringify({ type: "email.received", created_at: new Date(NOW).toISOString(), data: { email_id: ID, to: ["contact@gerimmo.app"] }, ...overrides });
  const signature = createHmac("sha256", SECRET).update(`evt_test.${stamp}.${body}`).digest("base64");
  return new Request("https://gerimmo.test/api/resend/contact", { method: "POST", body, headers: { "svix-id": "evt_test", "svix-timestamp": String(stamp), "svix-signature": signatureValide ? `v1,${signature}` : "v1,faux" } });
}

function fournisseur(metadata: Record<string, unknown> = {}, mime = MIME, envoiStatus = 200) {
  const envois: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://api.resend.com/emails/receiving/")) return Response.json({ id: ID, to: ["contact@gerimmo.app"], cc: [], bcc: [], received_for: [], created_at: new Date(NOW).toISOString(), raw: { download_url: "https://stockage.resend.com/message.eml" }, ...metadata });
    if (url === "https://stockage.resend.com/message.eml") return new Response(mime);
    if (url === "https://api.resend.com/emails") {
      envois.push({ body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
      return Response.json({ id: "envoi-local" }, { status: envoiStatus });
    }
    throw new Error("Accès réseau inattendu");
  });
  vi.stubGlobal("fetch", fetchMock);
  return { envois, fetchMock };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("configuration fermée par défaut", () => {
  it.each([
    {}, { ...ENV, RESEND_CONTACT_TRANSFERT_ACTIF: "false" }, { ...ENV, RESEND_CONTACT_TRANSFERT_VERS: "" },
    { ...ENV, RESEND_CONTACT_TRANSFERT_VERS: "contact@gerimmo.app" }, { ...ENV, RESEND_CONTACT_TRANSFERT_VERS: "a@b.fr\r\nBcc:x@y.fr" },
    { ...ENV, RESEND_API_KEY: "" }, { ...ENV, RESEND_CONTACT_WEBHOOK_SECRET: "" }, { ...ENV, VERCEL_ENV: "preview" },
  ])("aucun transfert sans configuration complète et autorisée", async (env) => {
    expect(configurationTransfert(env)).toBeNull();
    const { fetchMock } = fournisseur();
    expect((await traiterTransfertContact(requete(), env, NOW)).statut).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("vérifie réellement la signature avant tout appel au fournisseur", async () => {
  const { fetchMock } = fournisseur();
  expect((await traiterTransfertContact(requete({}, NOW / 1000, false), ENV, NOW)).statut).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([-601, 601])("refuse une signature hors fenêtre (%s secondes)", async (decalage) => {
  const { fetchMock } = fournisseur();
  expect((await traiterTransfertContact(requete({}, NOW / 1000 + decalage), ENV, NOW)).statut).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("ignore les événements sortants pour ne pas déclencher une boucle", async () => {
  const { fetchMock } = fournisseur();
  expect(await traiterTransfertContact(requete({ type: "email.sent" }), ENV, NOW)).toEqual({ statut: 200, etat: "ignore" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("refuse une référence malformée avant la lecture", async () => {
  const { fetchMock } = fournisseur();
  expect((await traiterTransfertContact(requete({ data: { email_id: "../../autre" } }), ENV, NOW)).statut).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("transfère contenu, pièce jointe et adresse de réponse vers le seul dirigeant", async () => {
  const { envois, fetchMock } = fournisseur();
  expect(await traiterTransfertContact(requete(), ENV, NOW)).toEqual({ statut: 200, etat: "transfere" });
  expect(envois).toHaveLength(1);
  expect(envois[0].body).toMatchObject({ from: '"Client via Gerimmo" <contact@gerimmo.app>', to: ["dirigeant@example.invalid"], reply_to: "reponse@example.invalid", subject: "[Contact Gerimmo] Demande et photo", attachments: [{ filename: "photo.png", content: "aGVsbG8=", content_type: "image/png", content_id: "photo1" }] });
  expect(envois[0].body.text).toContain("Bonjour, voici la photo.");
  expect(envois[0].body).not.toHaveProperty("cc"); expect(envois[0].body).not.toHaveProperty("bcc");
  expect(fetchMock.mock.calls[1][1]).not.toHaveProperty("headers");
});
it("conserve le HTML et utilise l'expéditeur sans Reply-To", async () => {
  const { envois } = fournisseur({}, "From: client@example.invalid\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Bonjour</p>");
  await traiterTransfertContact(requete(), ENV, NOW);
  expect(envois[0].body).toMatchObject({ reply_to: "client@example.invalid" });
  expect(String(envois[0].body.html).trim()).toBe("<p>Bonjour</p>");
});
it("les reprises rapprochées transmettent exactement le même corps et la même clé", async () => {
  const { envois } = fournisseur();
  await traiterTransfertContact(requete(), ENV, NOW);
  await traiterTransfertContact(requete(), ENV, NOW);
  expect(envois[0]).toEqual(envois[1]);
  expect(envois[0].headers["Idempotency-Key"]).toBe(`contact-transfert-v1/${ID}`);
});
it.each(["evenement", "message"])("après 23 h, l'ancien %s exige une reprise contrôlée", async (cible) => {
  const created_at = new Date(NOW - 24 * 3600_000).toISOString();
  const { envois } = fournisseur(cible === "message" ? { created_at } : {});
  expect(await traiterTransfertContact(requete(cible === "evenement" ? { created_at } : {}), ENV, NOW)).toEqual({ statut: 409, etat: "reprise_manuelle_requise" });
  expect(envois).toHaveLength(0);
});
it("ne transfère pas les autres boîtes du domaine", async () => {
  const { fetchMock } = fournisseur({ to: ["autre@gerimmo.app"] });
  expect((await traiterTransfertContact(requete(), ENV, NOW)).etat).toBe("hors_boite_contact");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("accepte contact en copie cachée", async () => {
  const { envois } = fournisseur({ to: [], bcc: ["contact@gerimmo.app"] });
  await traiterTransfertContact(requete(), ENV, NOW);
  expect(envois).toHaveLength(1);
});
it("un message déjà transféré ne repart pas", async () => {
  const { envois } = fournisseur({}, `X-Gerimmo-Transfer: contact-v1\r\n${MIME}`);
  expect((await traiterTransfertContact(requete(), ENV, NOW)).etat).toBe("boucle_ignoree");
  expect(envois).toHaveLength(0);
});
it.each(["http://localhost/cle", "https://evil.invalid/mail", "https://resend.com.evil.invalid/mail", "https://user:password@stockage.resend.com/mail"])("refuse un lien de stockage non autorisé : %s", async (url) => {
  const { fetchMock } = fournisseur({ raw: { download_url: url } });
  expect((await traiterTransfertContact(requete(), ENV, NOW)).etat).toBe("contenu_indisponible");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("ne transforme pas un refus Resend en succès", async () => {
  fournisseur({}, MIME, 500);
  expect(await traiterTransfertContact(requete(), ENV, NOW)).toEqual({ statut: 503, etat: "transfert_non_confirme" });
});
it("nomme un refus 429 (débit ou quota du prestataire) et laisse le webhook le rejouer (503)", async () => {
  const { envois } = fournisseur({}, MIME, 429);
  expect(await traiterTransfertContact(requete(), ENV, NOW)).toEqual({ statut: 503, etat: "transfert_limite_prestataire" });
  expect(envois).toHaveLength(1);
});
it("ne transforme pas une coupure après l'envoi en succès", async () => {
  const { fetchMock } = fournisseur();
  const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url, init) => {
    if (url === "https://api.resend.com/emails") throw new Error("réseau indisponible après POST");
    return normal(url, init);
  });
  expect((await traiterTransfertContact(requete(), ENV, NOW)).statut).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("borne les flux sans Content-Length", async () => {
  await expect(lireCorpsBorne(new Response("123456789").body, 5)).rejects.toThrow("corps_trop_grand");
  const { fetchMock } = fournisseur();
  const req = new Request("https://gerimmo.test/api/resend/contact", { method: "POST", body: "x".repeat(262_145) });
  expect((await traiterTransfertContact(req, ENV, NOW)).statut).toBe(413);
  expect(fetchMock).not.toHaveBeenCalled();
});
