import { describe, expect, it } from "vitest";
import { marquerDocumentEssai, signatureEnEssai } from "@/lib/signature-essai";
import { configurationSignatureBail } from "@/lib/signature-bail";
import type { DocumentAssemble } from "@/lib/documents/gabarit";

const org = "11111111-1111-4111-8111-111111111111";
const env = { SIGNATURE_BAIL_ORGS_ESSAI: org, SIGNATURE_BAIL_PRESTATAIRE: "zoho", ZOHO_SIGN_ENV: "production", ZOHO_SIGN_CLIENT_ID: "client-fictif", ZOHO_SIGN_CLIENT_SECRET: "secret-fictif", ZOHO_SIGN_REFRESH_TOKEN: "jeton-fictif", ZOHO_SIGN_WEBHOOK_SECRET: "hmac-fictif", ZOHO_SIGN_BAIL_ACTIF: "false" };
describe("Recette de signature limitée aux organisations désignées", () => {
  it("ouvre uniquement le compte prévu lorsque les envois clients sont fermés", () => {
    expect(configurationSignatureBail(env, "zoho", org)?.environnement).toBe("production");
    expect(configurationSignatureBail(env, "zoho", "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(configurationSignatureBail(env)).toBeNull();
    expect(configurationSignatureBail({...env, SIGNATURE_BAIL_ORGS_ESSAI: ""}, "zoho", org)).toBeNull();
  });
  it.each(["*", `${org},*`, `${org}-suffixe`, " ", "invalide"])('refuse une liste non explicite %s', liste => {
    expect(signatureEnEssai(org, { SIGNATURE_BAIL_ORGS_ESSAI: liste })).toBe(false);
  });
  it("conserve les exigences du prestataire et du retour sécurisé", () => {
    expect(configurationSignatureBail({...env, ZOHO_SIGN_WEBHOOK_SECRET:""}, "zoho", org)).toBeNull();
    expect(configurationSignatureBail({...env, ZOHO_SIGN_CLIENT_SECRET:""}, "zoho", org)).toBeNull();
    expect(configurationSignatureBail(env, "youtrust", org)).toBeNull();
  });
  it("annonce l’absence d’engagement avant le contrat sans enlever son contenu", () => {
    const doc = {html:'<html><body class="document"><h1>Bail</h1></body></html>'} as DocumentAssemble;
    const html=marquerDocumentEssai(doc).html;
    expect(html.indexOf("ESSAI TECHNIQUE — SANS ENGAGEMENT")).toBeLessThan(html.indexOf("<h1>Bail</h1>"));
    expect(html).toContain("aucune obligation de paiement");expect(html).toContain("<h1>Bail</h1>");
    expect(doc.html).not.toContain("ESSAI TECHNIQUE");
  });
});
