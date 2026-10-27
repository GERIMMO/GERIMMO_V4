import { describe, expect, it } from "vitest";
import { archiveSignee, etatSignatureDocument, signatureDuBail, type SignatureLisible } from "@/lib/presentation-signatures";
import { titreAffiche } from "@/app/agence/[orgId]/documents/titre-document";
const signe: SignatureLisible = { bail_id: "bail", modele: "bail", etat: "termine", document_id: "original", document_signe: "archive", created_at: "2026-10-24T12:00:00Z" };
describe("Signature et activation séparées", () => {
  it("reconnaît seulement une signature terminée avec son archive", () => {
    expect(archiveSignee(signe)).toBe("archive");
    expect(archiveSignee({ ...signe, document_signe: null })).toBeNull();
    for (const etat of ["pret", "en_cours", "a_verifier", "refuse", "expire", "annule"]) expect(archiveSignee({ ...signe, etat })).toBeNull();
  });
  it("n'utilise ni l'EDL ni un autre bail, ni un ancien circuit pour le contrat courant", () => {
    const circuits = [signe, { ...signe, etat: "pret", document_signe: null, created_at: "2026-10-24T13:00:00Z" }, { ...signe, modele: "edl", created_at: "2026-10-24T14:00:00Z" }, { ...signe, bail_id: "autre", created_at: "2026-10-24T15:00:00Z" }];
    expect(archiveSignee(signatureDuBail(circuits, "bail"))).toBeNull();
    expect(etatSignatureDocument(circuits, "archive")).toBe("signe");
    expect(etatSignatureDocument(circuits, "original")).toBe("original");
    expect(etatSignatureDocument(circuits, "inconnu")).toBeNull();
  });
  it("nettoie les titres contradictoires sans renommer les originaux à signer", () => {
    const original = "Bail nu (généré, à faire signer) — à signer en ligne";
    expect(titreAffiche(original)).toBe(original);
    expect(titreAffiche(`${original} — signé`)).toBe("Bail nu — signé");
    expect(titreAffiche(`Certificat de réalisation — ${original}`)).toBe("Certificat de réalisation — Bail nu");
    expect(titreAffiche("DPE — 2026-10-24")).toBe("DPE — 24/10/2026");
  });
});
