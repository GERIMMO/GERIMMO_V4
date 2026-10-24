/**
 * Relectures adverses du 24/10 (domaine signature), côté écran du bailleur :
 *  · état des lieux : la date de la visite est celle que porte l'état des lieux, préremplie et verrouillée ; l'écran ne
 *    promet plus une conservation « avec le document signé » ; la confirmation donnée reste lisible dans le suivi ;
 *  · acte de cautionnement envoyé avant la confirmation du mobile par la caution : l'écran ne dit plus que « le numéro de
 *    sa fiche n'est pas utilisé », il dit le contraire et comment y remédier.
 *
 * Banc : rendu serveur avec `useState` remplacé (comme signature-electronique-bail-fermeture.test.ts) ; la vue est
 * injectée dans le premier `useState`, les autres gardent leur valeur initiale.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CircuitBail, SignataireBail } from "@/lib/signature-bail";

const banc = vi.hoisted(() => ({ vue: null as unknown, appels: 0 }));
vi.mock("react", async (original) => {
  const reel = await original<typeof import("react")>();
  const useState = (initial: unknown) => [banc.appels++ === 0 ? banc.vue : initial, vi.fn()];
  return { ...reel, useState, default: { ...reel, useState } };
});
vi.mock("@/app/actions/signature-bail", () => ({
  lireSignatureBail: vi.fn(), preparerSignatureBail: vi.fn(), envoyerSignatureBail: vi.fn(),
  actualiserSignatureBail: vi.fn(), annulerSignatureBail: vi.fn(), activerBailApresSignature: vi.fn(),
}));
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import type { VueSignatureBail } from "@/app/actions/signature-bail";
import type { SelectionSignature } from "@/lib/politique-signature";

const BAIL = "11111111-1111-4111-8111-111111111111";
const EDL = "33333333-3333-4333-8333-333333333333";
const GARANT = "22222222-2222-4222-8222-222222222222";
const signataire = (personId: string, qualite: SignataireBail["qualite"], plus: Partial<SignataireBail> = {}): SignataireBail => ({
  personId, qualite, nom: "Durand", prenom: "Camille", email: `${personId}@example.invalid`, telephone: "+33600000000", ...plus,
});
const circuit = (plus: Partial<CircuitBail>): CircuitBail => ({
  id: "c1", prestataire: "zoho", organization_id: "org", bail_id: BAIL, document_id: "doc", etat: "pret", environnement: "production",
  empreinte: "x", pdf_hash: "h", signataires: [], external_request_id: null, external_document_id: null, annexes: [], document_signe: null,
  erreur: null, created_at: new Date().toISOString(), expire_le: new Date(Date.now() + 20 * 86400000).toISOString(), ...plus,
} as CircuitBail);

function rendre(vue: VueSignatureBail, selection: SelectionSignature): string {
  banc.vue = vue;
  banc.appels = 0;
  return renderToStaticMarkup(createElement(SignatureElectroniqueBail, { orgId: "org", bailId: BAIL, selection }));
}
beforeEach(() => { banc.vue = null; banc.appels = 0; });

describe("état des lieux : la visite confirmée est celle de l'état des lieux", () => {
  const selection: SelectionSignature = { code: "edl", cibleId: EDL };
  const parties = [signataire("l", "Locataire"), signataire("p", "Propriétaire")];

  it("la date est préremplie avec celle de l'état des lieux et verrouillée ; la case la reprend", () => {
    const html = rendre({ bailId: BAIL, selection, circuit: circuit({ modele: "edl", cible_id: EDL, signataires: parties }), signataires: parties, manquants: [], annexes: [], mode: "production", dateEdl: "2026-10-20" }, selection);
    expect(html).toMatch(/<input type="date"[^>]*readOnly=""[^>]*value="2026-10-20"|<input type="date"[^>]*value="2026-10-20"[^>]*readOnly=""/);
    expect(html).toContain("établi contradictoirement, sur place, le 20/10/2026, en présence du locataire ou de son représentant.");
    expect(html).not.toContain("conservées avec le document signé");
    expect(html).toContain("affichées dans le suivi de ce circuit");
  });

  it("la confirmation donnée reste lisible dans le suivi d'un circuit envoyé", () => {
    const confirmation = { texte: "Je confirme que cet état des lieux a été établi contradictoirement, sur place, le 20/10/2026, en présence du locataire ou de son représentant.", visite_le: "2026-10-20", confirme_le: "2026-10-20T15:04:00Z", confirme_par: "owner" };
    const html = rendre({ bailId: BAIL, selection, circuit: circuit({ modele: "edl", cible_id: EDL, etat: "en_cours", signataires: parties, confirmation_sur_place: confirmation }), signataires: parties, annexes: [], mode: "production" }, selection);
    expect(html).toContain("Confirmation du bailleur avant l’envoi");
    expect(html).toContain(confirmation.texte);
    expect(html).toContain("20 octobre");
  });
});

describe("acte de cautionnement envoyé avant la confirmation du mobile par la caution", () => {
  const selection: SelectionSignature = { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } };
  const enCours = (garant: SignataireBail) => circuit({ modele: "cautionnement", cible_id: BAIL, options: { garant: GARANT }, etat: "en_cours", external_request_id: "req", signataires: [garant, signataire("p", "Propriétaire")] });

  it("l'écran ne prétend pas que le numéro de la fiche n'est pas utilisé ; il dit comment y remédier", () => {
    const c = enCours(signataire("g", "Garant"));
    const html = rendre({ bailId: BAIL, selection, circuit: c, signataires: c.signataires, annexes: [], mode: "production" }, selection);
    expect(html).not.toContain("le numéro de sa fiche n’est pas utilisé");
    expect(html).toContain("envoyé avant que la caution confirme elle-même son numéro");
  });

  it("un acte envoyé avec le numéro confirmé par la caution garde le texte habituel", () => {
    const c = enCours(signataire("g", "Garant", { telephoneConfirmeLe: "2026-10-24T08:00:00Z" }));
    const html = rendre({ bailId: BAIL, selection, circuit: c, signataires: c.signataires, annexes: [], mode: "production" }, selection);
    expect(html).toContain("le numéro de sa fiche n’est pas utilisé");
    expect(html).not.toContain("envoyé avant que la caution confirme");
  });
});
