import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ expire: null as string | null, verifie: "2026-01-01" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/locataire/org/documents", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/quittance-conforme", () => ({ disponibilitesQuittances: async () => ({}) }));
vi.mock("@/app/locataire/[orgId]/formulaire-attestation", () => ({ FormulaireAttestation: () => null }));
vi.mock("@/app/locataire/[orgId]/documents/depot-piece", () => ({ DepotPiece: () => null }));
vi.mock("@/app/locataire/[orgId]/documents/depot-signature", () => ({ DepotSignature: () => null }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async () => ({
    personne: { id: "alice", prenom: "Alice" }, adhesionActive: true,
    supabase: {
      from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
      rpc: (nom: string) => { const resultat = Promise.resolve({ error: null, data:
      nom === "mes_pieces_locataire" ? [{ document_id: "att", type: "attestation_assurance", titre: "Attestation habitation", depose_le: "2026-01-01", expire_le: banc.expire, verifie_le: banc.verifie, source: "dossier" }]
      : nom === "mon_bail_locataire" ? [{ bail_id: "bail", etat: "actif", date_debut: "2026-01-01", loyer_hc: 650, charges: 50 }]
      : [] }); return Object.assign(resultat, { order: () => ({ range: () => resultat }) }); } },
  }),
}));

import Accueil from "@/app/locataire/[orgId]/page";
import Documents from "@/app/locataire/[orgId]/documents/page";
beforeEach(() => { banc.expire = null; banc.verifie = "2026-01-01"; });

describe("les écrans ne déclarent pas valide une assurance sans échéance", () => {
  it("accueil : propose une vérification, sans prétendre que le fichier manque ou a expiré", async () => {
    const html = renderToStaticMarkup(await Accueil({ params: Promise.resolve({ orgId: "org" }) } as never));
    expect(html).toContain("La date de votre assurance est à vérifier");
    expect(html).toContain('href="/locataire/org/contact"');
    expect(html).not.toMatch(/Assurance à jour|assurance a expiré|assurance manque/);
  });
  it("documents : distingue date inconnue et pièce validée", async () => {
    const html = renderToStaticMarkup(await Documents({ params: Promise.resolve({ orgId: "org" }) } as never));
    expect(html).toContain("Date à vérifier");
    expect(html).not.toContain(">Validée</span>");
    expect(html).not.toContain("reste en vigueur");
  });
  it("une date future sans validation ne suffit pas à annoncer une assurance à jour", async () => {
    banc.expire = "2099-01-01"; banc.verifie = null;
    const html = renderToStaticMarkup(await Accueil({ params: Promise.resolve({ orgId: "org" }) } as never));
    expect(html).toContain("Assurance en cours de vérification");
    expect(html).not.toContain("Assurance à jour");
  });
});
