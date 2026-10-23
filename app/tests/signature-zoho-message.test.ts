/**
 * Constat R53 (plan de conformité du 23/10/2026) : le message commun de l'invitation (« notes » Zoho) part dès la
 * création de la demande et à l'activation, pour tous les actes ; pour le cautionnement, Zoho doit l'avoir conservé
 * avant toute invitation. Doublure de l'API Zoho (fetch) : aucun appel réel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionsSignatureZoho, activerDemandeZoho, preparerCircuitZoho, telephoneZoho, type ConfigurationZohoSign } from "@/lib/zoho-sign";
import { texteMentionCaution, noteMentionCaution } from "@/lib/mention-caution";
import { messageInvitationSignature } from "@/lib/message-invitation-signature";

let config: ConfigurationZohoSign;
let compteur = 0;
const parties = [{ prenom: "Alice", nom: "Test", email: "alice@example.invalid", telephone: "+33600000001" }, { prenom: "Benoit", nom: "Test", email: "benoit@example.invalid", telephone: "+33600000002" }];
const id = "11000000000001", doc = "11000000000002";
const dossier = () => ({ request_id: id, request_status: "draft", description: "gerimmo:circuit:circuit", is_sequential: true,
  document_ids: [{ document_id: doc, document_name: "bail", document_order: "0", total_pages: 6 }],
  actions: parties.map((s, i) => ({ action_id: `1100000000000${i + 3}`, action_type: "SIGN", recipient_name: `${s.prenom} ${s.nom}`, recipient_email: s.email, signing_order: i, action_status: "NOACTION", verify_recipient: true, verification_type: "SMS", ...telephoneZoho(s.telephone) })) });
const attendu = () => ({ id: "circuit", external_document_id: doc, annexes: [], signataires: parties.map((s, i) => ({ ...s, externalId: `1100000000000${i + 3}` })) });
const MESSAGE = messageInvitationSignature({ modele: "bail", bailleur: "Benoit Test", lienConfidentialite: "https://site.example/confidentialite" });
function api(reponses: unknown[]) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => url.includes("/oauth/") ? Response.json({ access_token: "test-jeton", expires_in: 3600 }) : Response.json(reponses.shift()));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const donnees = (init?: RequestInit) => JSON.parse((init!.body as FormData).get("data") as string).requests;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-18T10:00:00Z")); config = { prestataire: "zoho", environnement: "sandbox", clientId: `msg-${++compteur}`, clientSecret: "s", refreshToken: "r" }; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("message d'invitation Zoho (R53)", () => {
  it("part dès la création de la demande", async () => {
    const fetch = api([{ code: 0, requests: dossier() }]);
    await preparerCircuitZoho({ config, pdf: new TextEncoder().encode("%PDF-x"), nomFichier: "bail.pdf", titre: "Essai", referenceExterne: "circuit", expiration: "2026-11-17", signataires: parties, demandeCreee: vi.fn(async () => {}), message: MESSAGE });
    expect(donnees(fetch.mock.calls[1][1]).notes).toBe(MESSAGE);
  });

  it("sans message, la création reste celle d'avant (aucune note)", async () => {
    const fetch = api([{ code: 0, requests: dossier() }]);
    await preparerCircuitZoho({ config, pdf: new TextEncoder().encode("%PDF-x"), nomFichier: "bail.pdf", titre: "Essai", referenceExterne: "circuit", expiration: "2026-11-17", signataires: parties, demandeCreee: vi.fn(async () => {}) });
    expect(donnees(fetch.mock.calls[1][1])).not.toHaveProperty("notes");
  });

  it("accompagne l'activation d'un acte ordinaire", async () => {
    const fetch = api([{ code: 0, requests: dossier() }, { code: 0 }]);
    await activerDemandeZoho(config, id, { ...attendu(), modele: "avenant", message: MESSAGE });
    expect(fetch.mock.calls[2][0]).toContain("/submit");
    expect(donnees(fetch.mock.calls[2][1]).notes).toBe(MESSAGE);
  });

  it("cautionnement : Zoho doit avoir conservé le message complet avant l'invitation", async () => {
    const mention = texteMentionCaution({ caution: "Alice Test", locataires: "Carla Test", plafond: "mille euros (1 000,00 €)", solidaire: true });
    const message = messageInvitationSignature({ modele: "cautionnement", bailleur: "Benoit Test", lienConfidentialite: "https://site.example/confidentialite" });
    const circuit = { ...attendu(), modele: "cautionnement", message, signataires: attendu().signataires.map((s, i) => ({ ...s, qualite: i === 0 ? "Garant" : "Propriétaire", mentionCaution: i === 0 ? mention : undefined })) };
    const controle = (notes: string) => ({ ...dossier(), notes, actions: actionsSignatureZoho(dossier(), circuit).map((a, i) => ({ ...dossier().actions[i], private_notes: a.private_notes, fields: a.fields.map((f, k) => ({ ...f, field_id: `11000000000${i}${k}1` })) })) });
    let fetch = api([{ code: 0, requests: dossier() }, { code: 0 }, { code: 0, requests: controle(message) }, { code: 0 }]);
    await activerDemandeZoho(config, id, circuit);
    expect(donnees(fetch.mock.calls[2][1]).notes).toBe(message);
    expect(donnees(fetch.mock.calls[4][1]).notes).toBe(message);
    expect(donnees(fetch.mock.calls[2][1]).actions[0].private_notes).toBe(noteMentionCaution(mention));
    expect(donnees(fetch.mock.calls[2][1]).actions[0].fields[0].field_label).toBe("Saisissez ou collez le texte du Message privé de votre e-mail");
    // Message tronqué chez Zoho : aucune invitation.
    fetch = api([{ code: 0, requests: dossier() }, { code: 0 }, { code: 0, requests: controle(message.slice(0, 200)) }]);
    await expect(activerDemandeZoho(config, id, circuit)).rejects.toThrow("texte à copier");
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/submit"))).toBe(false);
  });
});
