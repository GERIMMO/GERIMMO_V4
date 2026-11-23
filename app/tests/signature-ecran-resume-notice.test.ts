/**
 * Phase 3 de la mission palier 1, reprise du lot 45 (T15, contre-relecture) : l'écran de signature électronique du bail rangeait
 * le résumé de la notice d'information sous « Annexes jointes au contrat · N », alors que la page de garde du même dossier le
 * liste à part (« Document d’information joint ») et dit qu'il « n’est pas une annexe du contrat », et que l'envoi au prestataire
 * le nomme « resume-notice-information.pdf ». L'écran suit désormais la même règle (estResumeNoticeJoint). Un résumé rangé sous
 * l'ancien titre reste parmi les annexes, comme sur sa page de garde. Le cas échouait avant le correctif.
 *
 * Banc : rendu serveur avec `useState` remplacé (comme signature-electronique-bail-relecture.test.ts) ; la vue est injectée dans
 * le premier `useState`, les autres gardent leur valeur initiale.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnexeSignature, CircuitBail, SignataireBail } from "@/lib/signature-bail";

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
import { TITRE_GED_RESUME_NOTICE } from "@/lib/documents-bail";

const BAIL = "11111111-1111-4111-8111-111111111111";
const ANCIEN_TITRE = "Notice d'information (annexe au bail)";
const signataire = (personId: string, qualite: SignataireBail["qualite"]): SignataireBail => ({
  personId, qualite, nom: "Durand", prenom: "Camille", email: `${personId}@example.invalid`, telephone: "+33600000000",
});
const parties = [signataire("l", "Locataire"), signataire("p", "Propriétaire")];
const piece = (id: string, titre: string): AnnexeSignature => ({ id, titre, storage_path: `org/${id}.pdf`, empreinte: id.repeat(64).slice(0, 64) });
const circuit = (annexes: AnnexeSignature[], etat: CircuitBail["etat"] = "pret"): CircuitBail => ({
  id: "c1", prestataire: "zoho", organization_id: "org", bail_id: BAIL, document_id: "doc", etat, environnement: "production",
  empreinte: "x", pdf_hash: "h", signataires: parties, external_request_id: etat === "pret" ? null : "req", external_document_id: null, annexes,
  document_signe: null, erreur: null, created_at: new Date().toISOString(), expire_le: new Date(Date.now() + 20 * 86400000).toISOString(),
});

function rendre(vue: VueSignatureBail): string {
  banc.vue = vue;
  banc.appels = 0;
  return renderToStaticMarkup(createElement(SignatureElectroniqueBail, { orgId: "org", bailId: BAIL }));
}
/** Chaque bloc de pièces : son intitulé et les titres des pièces qu'il liste. */
function blocs(html: string) {
  const annexes = /<p class="font-medium">Annexes jointes au contrat · (\d+)<\/p><ul[^>]*>(.*?)<\/ul>/.exec(html);
  const information = /<div class="text-sm" data-document-information-joint="[^"]*">(.*?)<\/div>/.exec(html);
  const titres = (ul: string | undefined) => [...(ul ?? "").matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1].replace(/&#x27;/g, "'"));
  return {
    annexes: annexes ? { nombre: Number(annexes[1]), titres: titres(annexes[2]) } : null,
    information: information ? { texte: information[1].replace(/<[^>]+>/g, " "), titres: titres(information[1]) } : null,
  };
}
beforeEach(() => { banc.vue = null; banc.appels = 0; });

describe("T15 (reprise) — l'écran de signature ne range plus le résumé de la notice parmi les annexes du contrat", () => {
  const pieces = [piece("a", "DPE"), piece("b", "ERP — état des risques"), piece("c", TITRE_GED_RESUME_NOTICE)];

  it.each(["pret", "en_cours"] as const)("circuit %s : deux annexes, le résumé listé à part comme sur la page de garde", (etat) => {
    const c = circuit(pieces, etat);
    const { annexes, information } = blocs(rendre({ bailId: BAIL, circuit: c, signataires: parties, manquants: [], annexes: pieces, mode: "production" }));
    expect(annexes).toEqual({ nombre: 2, titres: ["DPE", "ERP — état des risques"] });
    expect(information?.titres).toEqual([TITRE_GED_RESUME_NOTICE]);
    expect(information?.texte).toContain("Document d’information joint");
    expect(information?.texte).toContain("Il n’est pas une annexe du contrat");
  });

  it("avant toute préparation (pièces lues pour le dossier) : même partage", () => {
    const { annexes, information } = blocs(rendre({ bailId: BAIL, signataires: parties, manquants: [], annexes: pieces, mode: "production" }));
    expect(annexes).toEqual({ nombre: 2, titres: ["DPE", "ERP — état des risques"] });
    expect(information?.titres).toEqual([TITRE_GED_RESUME_NOTICE]);
  });

  it("le résumé seul : aucun bloc « Annexes jointes au contrat »", () => {
    const seul = [piece("c", TITRE_GED_RESUME_NOTICE)];
    const { annexes, information } = blocs(rendre({ bailId: BAIL, circuit: circuit(seul), signataires: parties, manquants: [], annexes: seul, mode: "production" }));
    expect(annexes).toBeNull();
    expect(information?.titres).toEqual([TITRE_GED_RESUME_NOTICE]);
  });

  it("un résumé rangé sous l'ancien titre reste parmi les annexes, comme sur la page de garde de son dossier", () => {
    const anciens = [piece("a", "DPE"), piece("c", ANCIEN_TITRE)];
    const { annexes, information } = blocs(rendre({ bailId: BAIL, circuit: circuit(anciens), signataires: parties, manquants: [], annexes: anciens, mode: "production" }));
    expect(annexes).toEqual({ nombre: 2, titres: ["DPE", ANCIEN_TITRE] });
    expect(information).toBeNull();
  });
});
