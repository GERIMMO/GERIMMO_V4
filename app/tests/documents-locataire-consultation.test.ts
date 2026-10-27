/**
 * Un seul geste de consultation dans l'espace locataire (décision du 27/10,
 * audit #264 ED-04) : dans « Mes documents », le titre de chaque pièce, du bail
 * signé et de chaque quittance disponible est un bouton qui ouvre l'aperçu en
 * fenêtre ; aucun rang n'ouvre plus de nouvel onglet, aucun n'a de bouton
 * « Aperçu », « Ouvrir » ou « Enregistrer en PDF » à côté du titre. Le bail
 * signé de l'accueil et de « Mon logement » passe par le même geste.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/locataire/org/documents", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/quittance-conforme", () => ({
  disponibilitesQuittances: async () => ({ "q-sept": "disponible", "q-oct": "en_preparation" }),
}));
vi.mock("@/app/locataire/[orgId]/formulaire-attestation", () => ({ FormulaireAttestation: () => null }));
vi.mock("@/app/locataire/[orgId]/documents/depot-piece", () => ({ DepotPiece: () => null }));
vi.mock("@/app/locataire/[orgId]/documents/depot-signature", () => ({ DepotSignature: () => null }));
vi.mock("@/components/fenetre-lot", () => ({ FenetreLotProvider: ({ children }: { children: unknown }) => children, BoutonLot: () => null }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async () => ({
    personne: { prenom: "Alice" }, adhesionActive: true,
    supabase: { rpc: async (nom: string) => ({ error: null, data:
      nom === "mes_pieces_locataire" ? [
        { document_id: "bail-doc", type: "bail", titre: "Bail signé", mime_type: "application/pdf", depose_le: "2026-09-01", expire_le: null, verifie_le: null, source: "bail" },
        { document_id: "att", type: "attestation_assurance", titre: "Attestation habitation", mime_type: "image/jpeg", depose_le: "2026-01-01", expire_le: "2099-01-01", verifie_le: "2026-01-01", source: "dossier" },
      ]
      : nom === "mon_echeancier_locataire" ? [
        { statut: "partiel", periode: "2026-09-01", quittance_id: "q-sept" },
        { statut: "paye", periode: "2026-10-01", quittance_id: "q-oct" },
        { statut: "a_venir", periode: "2026-11-01", quittance_id: null },
      ]
      : nom === "mon_bail_locataire" ? [{ bail_id: "bail", etat: "actif", date_debut: "2026-01-01", loyer_hc: 650, charges: 50, document_signe: "bail-doc", lot_nom: "T2", type: "nu" }]
      : nom === "mon_lot_locataire" ? "lot"
      : [] }) },
  }),
}));

import Accueil from "@/app/locataire/[orgId]/page";
import Documents from "@/app/locataire/[orgId]/documents/page";
import Logement from "@/app/locataire/[orgId]/logement/page";

const params = { params: Promise.resolve({ orgId: "org" }) } as never;
const rangs = (html: string) => html.slice(html.indexOf("Documents disponibles"), html.indexOf("Conservation") === -1 ? undefined : html.indexOf("Conservation"));
const boutonsApercu = (html: string) => html.match(/<button type="button" aria-haspopup="dialog"[^>]*>/g) ?? [];

describe("Mes documents : un seul geste de consultation", () => {
  it("le titre de chaque pièce et de chaque quittance disponible ouvre l'aperçu en fenêtre", async () => {
    const liste = rangs(renderToStaticMarkup(await Documents(params)));
    // Trois rangs consultables : le bail signé, l'attestation, le reçu de septembre.
    expect(boutonsApercu(liste)).toHaveLength(3);
    for (const titre of ["Bail signé", "Attestation habitation", "Reçu de paiement partiel — septembre 2026"]) {
      expect(liste).toMatch(new RegExp(`aria-haspopup="dialog"[^>]*>(?:(?!</button>).)*${titre}`));
    }
  });
  it("aucun rang n'ouvre de nouvel onglet ni ne garde une commande à côté du titre", async () => {
    const liste = rangs(renderToStaticMarkup(await Documents(params)));
    expect(liste).not.toContain('target="_blank"');
    expect(liste).not.toContain("/quittance/");
    expect(liste).not.toMatch(/>Aperçu<|>Ouvrir<|>Enregistrer en PDF<|>Télécharger</);
  });
  it("une quittance en préparation reste un rang sans geste, avec son étiquette", async () => {
    const liste = rangs(renderToStaticMarkup(await Documents(params)));
    expect(liste).toContain("Quittance — octobre 2026");
    expect(liste).toContain("En préparation");
    expect(liste).not.toMatch(/aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*octobre 2026/);
  });
  it("le bail signé de l'accueil et de « Mon logement » s'ouvre par le même geste, sans nouvel onglet", async () => {
    for (const Page of [Accueil, Logement]) {
      const html = renderToStaticMarkup(await Page(params));
      expect(html).toMatch(/aria-haspopup="dialog"[^>]*>Consulter mon bail signé<\/button>/);
      expect(html).not.toMatch(/<a[^>]*href="\/locataire\/org\/bail\/fichier"/);
    }
  });
});
