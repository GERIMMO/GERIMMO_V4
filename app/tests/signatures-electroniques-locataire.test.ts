/**
 * LA CARTE « SIGNATURE ÉLECTRONIQUE » DU LOCATAIRE — audit palier 1 du 22/11/2026, P1-06.
 *
 * Sans base (la lecture a son test : signatures-electroniques-locataire-base.test.ts). Tient :
 *  1. chaque état se dit en une phrase juste : à signer, signé par moi, en attente de mon tour, complet, refusé, expiré ;
 *  2. la carte ne s'affiche que s'il y a quelque chose à dire, nomme le document, et ne propose aucun dépôt ;
 *  3. ce qu'elle affirme du prestataire (invitation par e-mail, code par SMS, signatures l'une après l'autre) est ce
 *     que le code d'envoi fait réellement ;
 *  4. la page lit l'état par la fonction réservée au locataire, et signale une lecture en panne.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { phraseSignature, resteASigner, SignaturesElectroniques, type SignatureLocataire } from "@/app/locataire/[orgId]/documents/signatures-electroniques";

const circuit = (patch: Partial<SignatureLocataire> = {}): SignatureLocataire => ({
  circuit_id: "c-1", modele: "bail", etat: "en_cours", envoye_le: "2026-11-20T09:00:00Z", expire_le: "2026-12-05T09:00:00Z", acheve_le: null,
  mon_statut: "notified", signatures_recues: 0, signatures_attendues: 3, ...patch,
});
const rendre = (signatures: SignatureLocataire[]) => renderToStaticMarkup(createElement(SignaturesElectroniques, { signatures }));

describe("une phrase par état", () => {
  it("invitation envoyée : à signer, avec le décompte et la date de validité", () => {
    const s = circuit();
    expect(resteASigner(s)).toBe(true);
    expect(phraseSignature(s)).toBe("À signer : l’invitation vous a été envoyée par e-mail. 0 signature reçue sur 3. La demande est valable jusqu’au 05/12/2026.");
  });

  it("j'ai signé : dit ce qui manque encore", () => {
    const s = circuit({ mon_statut: "signed", signatures_recues: 2 });
    expect(resteASigner(s)).toBe(false);
    expect(phraseSignature(s)).toBe("Vous avez signé. 2 signatures reçues sur 3 : le document sera complet quand tous auront signé. La demande est valable jusqu’au 05/12/2026.");
  });

  it.each(["initiated", null, "verified", "processing"])("pas encore mon tour, ou état intermédiaire (%s) : signatures en cours, l'une après l'autre", (statut) => {
    const s = circuit({ mon_statut: statut, signatures_recues: 1 });
    expect(resteASigner(s)).toBe(true);
    expect(phraseSignature(s)).toBe("Signatures en cours : 1 signature reçue sur 3. Elles se recueillent l’une après l’autre ; votre invitation arrive par e-mail quand vient votre tour. La demande est valable jusqu’au 05/12/2026.");
  });

  it.each([
    ["termine", "Signé par tous les signataires le 21/11/2026."],
    ["refuse", "Un signataire a refusé de signer le 21/11/2026 : ce document n’est pas signé."],
    ["expire", "La demande de signature a expiré le 21/11/2026 sans réunir toutes les signatures : ce document n’est pas signé."],
  ])("circuit achevé (%s)", (etat, attendu) => {
    const s = circuit({ etat, acheve_le: "2026-11-21T10:00:00Z", mon_statut: "signed", signatures_recues: 3 });
    expect(resteASigner(s)).toBe(false);
    expect(phraseSignature(s)).toBe(attendu);
  });

  it("sans date connue, la phrase reste entière", () => {
    expect(phraseSignature(circuit({ expire_le: null }))).toBe("À signer : l’invitation vous a été envoyée par e-mail. 0 signature reçue sur 3.");
    expect(phraseSignature(circuit({ etat: "termine", acheve_le: null }))).toBe("Signé par tous les signataires.");
  });
});

describe("la carte", () => {
  it("rien à dire : rien d'affiché", () => {
    expect(rendre([])).toBe("");
  });

  it("nomme le document, dit l'état, et ne propose aucun dépôt", () => {
    const html = rendre([circuit(), circuit({ circuit_id: "c-2", modele: "edl", etat: "termine", acheve_le: "2026-11-21T10:00:00Z", mon_statut: "signed", signatures_recues: 2, signatures_attendues: 2 })]);
    expect(html).toContain("data-signatures-electroniques");
    expect(html).toContain("Signature électronique");
    expect(html).toContain("Bail de location");
    expect(html).toContain("État des lieux");
    expect(html).toContain("Envoyé en signature le 20/11/2026");
    expect(html).toMatch(/<span class="loc-tag ambre">à signer<\/span>/);
    expect(html).toMatch(/<span class="loc-tag vert">signé<\/span>/);
    expect(html).toContain("Rien n’est à déposer ici.");
    expect(html).not.toMatch(/<(button|form|input|a)\b/);
  });

  it("un modèle inconnu reste lisible, un circuit refusé est marqué en rouge", () => {
    const html = rendre([circuit({ modele: "inconnu", etat: "refuse", acheve_le: "2026-11-21T10:00:00Z" })]);
    expect(html).toContain("<b class=\"min-w-0 flex-1 font-medium\">Document</b>");
    expect(html).toMatch(/<span class="loc-tag rouge">refusé<\/span>/);
  });
});

describe("ce que la carte affirme est ce que le code fait", () => {
  const zoho = readFileSync("src/lib/zoho-sign.ts", "utf8");
  const carte = readFileSync("src/app/locataire/[orgId]/documents/signatures-electroniques.tsx", "utf8");

  it("le code vient par SMS, et les signatures se recueillent l'une après l'autre", () => {
    expect(carte).toContain("un code vous\n        est envoyé par SMS au moment de signer");
    expect(zoho).toContain('verify_recipient: true, verification_type: "SMS"');
    expect(zoho).toContain("is_sequential: true");
    // « Invitation envoyée » correspond aux états du prestataire où l'e-mail est parti.
    expect(zoho).toContain('UNOPENED: "notified", VIEWED: "notified", SIGNED: "signed"');
  });

  it("la page lit l'état par la fonction réservée au locataire, et signale une lecture en panne", () => {
    const page = readFileSync("src/app/locataire/[orgId]/documents/page.tsx", "utf8");
    expect(page).toContain('supabase.rpc("mes_signatures_electroniques", { p_org: orgId })');
    // Lot D5 du 24/11 (Q21) : la lecture des anciennes demandes manuelles (eSignatures) est retirée avec leur écran.
    expect(page).toContain("aEchoue(ePieces, eEcheancier, eDemandes, eCircuits)");
    expect(page).not.toContain("mes_demandes_signature");
    expect(page).toContain("<SignaturesElectroniques signatures={signaturesElectroniques} />");
    expect(page).not.toMatch(/from\(["']bail_signature_circuits["']\)/);
  });
});
