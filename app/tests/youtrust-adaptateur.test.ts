import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  configurationYoutrust,
  creerDemandeYoutrust,
  webhookYoutrustValide,
} from "@/lib/youtrust";

afterEach(() => vi.unstubAllGlobals());

describe("configuration Youtrust", () => {
  it("reste désactivée sans secret", () => {
    expect(configurationYoutrust({})).toBeNull();
  });

  it("utilise la sandbox par défaut et la production seulement sur demande", () => {
    expect(configurationYoutrust({ YOUTRUST_API_KEY: "secret" })?.baseUrl).toContain("api-sandbox");
    expect(configurationYoutrust({ YOUTRUST_API_KEY: "secret", YOUTRUST_ENV: "production" })?.baseUrl)
      .toBe("https://api.yousign.app/v3");
  });
});

describe("création d'une signature", () => {
  it("enchaîne demande, PDF, signataire avec OTP puis activation", async () => {
    const reponses = [
      { id: "demande" },
      { id: "document" },
      { id: "signataire" },
      { status: "ongoing" },
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(reponses.shift()), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultat = await creerDemandeYoutrust({
      config: { cleApi: "secret", environnement: "sandbox", baseUrl: "https://sandbox.test/v3" },
      pdf: new Uint8Array([37, 80, 68, 70]),
      nomFichier: "bail.pdf",
      titre: "Bail test",
      referenceExterne: "demande-gerimmo",
      signataire: {
        prenom: "Alice",
        nom: "Martin",
        email: "alice@example.test",
        telephone: "+33700000000",
      },
      pageSignature: 2,
    });

    expect(resultat).toEqual({
      demandeId: "demande",
      documentId: "document",
      signataireId: "signataire",
      statut: "ongoing",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const requeteSignataire = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
    expect(requeteSignataire.signature_authentication_mode).toBe("otp_sms");
    expect(requeteSignataire.fields[0]).toMatchObject({ document_id: "document", page: 2 });
  });
});

describe("webhook Youtrust", () => {
  it("accepte seulement le HMAC du corps brut", () => {
    const corps = '{"event_id":"evt_1"}';
    const secret = "secret-webhook";
    const signature = `sha256=${createHmac("sha256", secret).update(corps).digest("hex")}`;
    expect(webhookYoutrustValide(corps, signature, secret)).toBe(true);
    expect(webhookYoutrustValide(`${corps} `, signature, secret)).toBe(false);
    expect(webhookYoutrustValide(corps, null, secret)).toBe(false);
  });
});
