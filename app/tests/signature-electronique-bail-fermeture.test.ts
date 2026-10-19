/**
 * Lot B7, correction du 19/10 (relecture, défaut 4) : quand l'envoi de l'acte de cautionnement est fermé
 * (`vue.fermeture` posé), le composant affiche le message exact et n'annonce plus le coût de l'envoi
 * (« Estimation : X crédits Zoho pour cet envoi… ») que l'on vient de déclarer suspendu.
 *
 * Le mode « indisponible » générique (prestataire pas encore connecté) garde son texte et son estimation : il n'est
 * pas touché. Un circuit déjà envoyé n'a pas de `fermeture` (voir signature-bail-lecture.test.ts) : il garde sa barre
 * de progression, sans message de suspension.
 *
 * Banc : rendu serveur avec `useState` remplacé. Le rendu statique ne joue aucun effet, la vue que l'effet aurait chargée
 * est donc injectée dans le premier `useState` du composant ; les autres états gardent leur valeur initiale.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignataireBail } from "@/lib/signature-bail";

const banc = vi.hoisted(() => ({ vue: null as unknown, appels: 0 }));
vi.mock("react", async (original) => {
  const reel = await original<typeof import("react")>();
  const useState = (initial: unknown) => [banc.appels++ === 0 ? banc.vue : initial, vi.fn()];
  return { ...reel, useState, default: { ...reel, useState } };
});
vi.mock("@/app/actions/signature-bail", () => ({
  lireSignatureBail: vi.fn(),
  preparerSignatureBail: vi.fn(),
  envoyerSignatureBail: vi.fn(),
  actualiserSignatureBail: vi.fn(),
  annulerSignatureBail: vi.fn(),
  activerBailApresSignature: vi.fn(),
}));
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import type { VueSignatureBail } from "@/app/actions/signature-bail";
import { MESSAGE_CAUTIONNEMENT_FERME } from "@/lib/signature-interrupteurs";

const BAIL = "11111111-1111-4111-8111-111111111111";
const GARANT = "22222222-2222-4222-8222-222222222222";
const SELECTION = { code: "cautionnement" as const, cibleId: BAIL, options: { garant: GARANT } };
const signataire = (personId: string, qualite: SignataireBail["qualite"], statut?: string): SignataireBail => ({
  personId, qualite, nom: "Durand", prenom: "Camille", email: "camille@exemple.test", telephone: "+33600000000", statut,
});
const PARTIES = [signataire("g", "Garant"), signataire("p", "Propriétaire")];
const GENERIQUE = "Signature en ligne en préparation.";

function rendre(vue: VueSignatureBail): string {
  banc.vue = vue;
  banc.appels = 0;
  return renderToStaticMarkup(createElement(SignatureElectroniqueBail, { orgId: "org", bailId: BAIL, selection: SELECTION }));
}

beforeEach(() => {
  banc.vue = null;
  banc.appels = 0;
});

describe("Composant de signature : cautionnement fermé par réglage serveur", () => {
  it("affiche le message exact de fermeture, sans l’estimation du coût de l’envoi", () => {
    const html = rendre({ bailId: BAIL, selection: SELECTION, circuit: null, signataires: PARTIES, manquants: [], annexes: [], mode: "indisponible", fermeture: MESSAGE_CAUTIONNEMENT_FERME });
    expect(html).toContain(MESSAGE_CAUTIONNEMENT_FERME);
    expect(html).not.toContain(GENERIQUE);
    expect(html).not.toContain("Estimation");
    expect(html).not.toContain("crédits Zoho");
    // Les personnes restent listées : le propriétaire peut les vérifier et préparer le PDF.
    expect(html).toContain("Camille");
    expect(html).toContain("Garant");
  });

  it("le mode indisponible générique (prestataire non connecté) garde son texte et son estimation", () => {
    const html = rendre({ bailId: BAIL, selection: SELECTION, circuit: null, signataires: PARTIES, manquants: [], annexes: [], mode: "indisponible" });
    expect(html).toContain(GENERIQUE);
    expect(html).not.toContain(MESSAGE_CAUTIONNEMENT_FERME);
    expect(html).toContain("Estimation");
  });

  it("ouvert : estimation affichée, aucun message de suspension", () => {
    const html = rendre({ bailId: BAIL, selection: SELECTION, circuit: null, signataires: PARTIES, manquants: [], annexes: [], mode: "production" });
    expect(html).toContain("Estimation");
    expect(html).not.toContain(MESSAGE_CAUTIONNEMENT_FERME);
    expect(html).not.toContain(GENERIQUE);
  });

  it("un circuit déjà envoyé (sans fermeture, mode d’avant) garde sa progression sans message de suspension", () => {
    const parties = [signataire("g", "Garant", "signed"), signataire("p", "Propriétaire", "notified")];
    const circuit = {
      id: "c1", prestataire: "zoho" as const, organization_id: "org", bail_id: BAIL, document_id: "doc", etat: "en_cours" as const,
      environnement: "production" as const, empreinte: "x", pdf_hash: "h", signataires: parties, external_request_id: "req", external_document_id: null,
      annexes: [], document_signe: null, erreur: null, created_at: new Date().toISOString(), expire_le: new Date(Date.now() + 86400000).toISOString(),
      modele: "cautionnement" as const, cible_id: BAIL, options: { garant: GARANT },
    };
    const html = rendre({ bailId: BAIL, selection: SELECTION, circuit, signataires: parties, annexes: [], mode: "production" });
    expect(html).toContain("Signatures en cours");
    expect(html).toContain("1 / 2 signatures");
    expect(html).not.toContain(MESSAGE_CAUTIONNEMENT_FERME);
    expect(html).not.toContain(GENERIQUE);
  });
});
