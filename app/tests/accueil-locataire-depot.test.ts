/**
 * Décision D36 (SOR-05), options B puis C — le locataire sortant voit son dépôt
 * de garantie :
 *   B  l'accueil porte la carte « Votre dépôt de garantie » à la place de « Rien
 *      à régler pour l'instant » quand une restitution existe (en cours ou
 *      décompte établi), avec un lien ;
 *   C  à l'envoi du décompte, une pièce « décompte » est mise à disposition dans
 *      « Mes documents » (action marquerDecompteEnvoye).
 * Les montants affichés sont ceux que la base rend : rien n'est recalculé ici.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  donnees: {} as Record<string, unknown>,
  erreurs: {} as Record<string, unknown>,
  rpc: vi.fn(),
  generer: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: { rpc: banc.rpc } }),
}));
vi.mock("@/lib/ged-depot", () => ({ preparerFichierGed: vi.fn() }));
vi.mock("@/app/actions/documents-generes", () => ({ genererDocument: banc.generer }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async () => ({
    supabase: {
      rpc: async (nom: string) => ({
        data: banc.donnees[nom] ?? [],
        error: banc.erreurs[nom] ?? null,
      }),
    },
    personne: { prenom: "Claire" },
    adhesionActive: false,
  }),
}));
vi.mock("@/lib/quittance-conforme", () => ({ disponibilitesQuittances: async () => ({}) }));

import PageAccueilLocataire from "@/app/locataire/[orgId]/page";
import { CarteDepotGarantie, ANCRE_DEPOT_GARANTIE, type RestitutionLocataire } from "@/app/locataire/[orgId]/carte-depot-garantie";
import { marquerDecompteEnvoye } from "@/app/actions/restitution";

const ORG = "org-test";

const enCours: RestitutionLocataire = {
  statut: "en_cours",
  date_remise_cles: "2026-10-05",
  delai_mois: 2,
  depot: 650,
  impayes: null,
  solde: null,
  date_emission: null,
  sans_edl_entree: false,
};

const etabliCreance: RestitutionLocataire = {
  statut: "finalise",
  date_remise_cles: "2026-10-05",
  delai_mois: 2,
  depot: 650,
  impayes: 700,
  solde: -561.43,
  date_emission: "2026-10-14",
  sans_edl_entree: false,
};

const bailActif = {
  bail_id: "b1", type: "nu", etat: "actif", loyer_hc: 650, charges: 50, date_debut: "2025-08-01",
  date_fin: null, lot_nom: "Lot A", document_signe: null, charges_mode: "provision", jour_echeance: 5,
  surface_m2: 40, pieces: 2, etage: "1", meuble: false, adresse: "1 rue A, 75012 Paris", ville: "Paris",
  zone_tendue: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  banc.donnees = {};
  banc.erreurs = {};
  banc.rpc.mockResolvedValue({ error: null });
});

async function accueil() {
  const element = await PageAccueilLocataire({ params: Promise.resolve({ orgId: ORG }) } as never);
  return renderToStaticMarkup(element);
}

function carte(r: RestitutionLocataire) {
  return renderToStaticMarkup(
    createElement(CarteDepotGarantie, { orgId: ORG, restitution: r, classeCarte: "carte-test", classeLien: "lien-test" })
  );
}

describe("D36 (B) — la carte « Votre dépôt de garantie »", () => {
  it("restitution en cours : le dépôt, la remise des clés, le délai, et un lien pour suivre", () => {
    const html = carte(enCours);
    expect(html).toContain("Votre dépôt de garantie");
    expect(html).toContain("650,00");
    expect(html).toContain("sous 2 mois");
    expect(html).toContain("05/10/2026");
    expect(html).toContain("Restitution en cours");
    expect(html).toContain(`href="/locataire/${ORG}/loyers#${ANCRE_DEPOT_GARANTIE}"`);
    expect(html).toContain("Suivre ma restitution");
    expect(html).not.toContain("Rien à régler");
    // Avant le décompte, rien ne promet la totalité du dépôt : il peut y avoir des retenues
    expect(html).toContain("dépôt versé");
    expect(html).not.toContain("à vous restituer");
  });

  it("décompte établi avec une créance : le montant restant dû est dit, jamais « Rien à régler »", () => {
    const html = carte(etabliCreance);
    expect(html).toContain("561,43");
    expect(html).toContain("restant dû");
    expect(html).toContain("Décompte établi le 14/10/2026");
    expect(html).toContain("ambre");
    expect(html).toContain("Voir le décompte");
    expect(html).not.toContain("Rien à régler");
  });

  it("décompte établi avec un solde en faveur du locataire : « à vous restituer »", () => {
    const html = carte({ ...etabliCreance, impayes: 0, solde: 650 });
    expect(html).toContain("650,00");
    expect(html).toContain("à vous restituer");
    expect(html).toContain("vert");
    expect(html).not.toContain("restant dû");
  });
});

describe("D36 (B) — l'accueil du locataire", () => {
  it("locataire sorti (plus de bail en cours), décompte établi : la carte remplace « Rien à régler »", async () => {
    banc.donnees = {
      mon_bail_locataire: [],
      mon_echeancier_locataire: [
        { periode: "2026-10-01", montant_du: 700, montant_couvert: 0, statut: "impaye", quittance_id: null },
      ],
      ma_restitution_locataire: [etabliCreance],
    };
    const html = await accueil();
    expect(html).toContain("Votre dépôt de garantie");
    expect(html).toContain("561,43");
    expect(html).toContain("Décompte établi");
    expect(html).not.toContain("Rien à régler pour l");
    expect(html).toContain(`/locataire/${ORG}/loyers#${ANCRE_DEPOT_GARANTIE}`);
  });

  it("restitution en cours, rien d'autre à régler : la carte dit où en est le dépôt", async () => {
    banc.donnees = { mon_bail_locataire: [], mon_echeancier_locataire: [], ma_restitution_locataire: [enCours] };
    const html = await accueil();
    expect(html).toContain("Votre dépôt de garantie");
    expect(html).toContain("Restitution en cours");
    expect(html).not.toContain("Rien à régler pour l");
  });

  it("sans restitution, « Rien à régler » reste dit comme avant", async () => {
    banc.donnees = { mon_bail_locataire: [], mon_echeancier_locataire: [], ma_restitution_locataire: [] };
    const html = await accueil();
    expect(html).toContain("Rien à régler pour l");
    expect(html).not.toContain("Votre dépôt de garantie");
  });

  it("un loyer encore à suivre garde sa carte, même si une restitution existe", async () => {
    banc.donnees = {
      mon_bail_locataire: [bailActif],
      mon_echeancier_locataire: [
        { periode: "2026-10-01", montant_du: 700, montant_couvert: 0, statut: "impaye", quittance_id: null },
      ],
      ma_restitution_locataire: [enCours],
    };
    const html = await accueil();
    expect(html).toContain("Loyer restant à régler");
    expect(html).not.toContain("Votre dépôt de garantie");
  });

  it("si la restitution ne se lit pas, l'accueil ne prétend pas qu'il n'y a rien à régler", async () => {
    banc.donnees = { mon_bail_locataire: [], mon_echeancier_locataire: [] };
    banc.erreurs = { ma_restitution_locataire: { message: "panne" } };
    const html = await accueil();
    expect(html).not.toContain("Rien à régler pour l");
    expect(html).toContain("Impossible d&#x27;afficher votre dépôt de garantie");
  });
});

describe("D36 (C) — la pièce « décompte » dans Mes documents, à l'envoi", () => {
  function envoi() {
    const f = new FormData();
    f.set("date", "2026-10-14");
    return marquerDecompteEnvoye(ORG, "bail-1", "rst-1", {}, f);
  }

  it("envoyé : le décompte PDF est généré puis mis à disposition du locataire", async () => {
    banc.generer.mockResolvedValue({ documentId: "doc-decompte", succes: "ok" });
    const r = await envoi();
    expect(banc.rpc).toHaveBeenNthCalledWith(1, "marquer_decompte_envoye", { p_restitution: "rst-1", p_date: "2026-10-14" });
    expect(banc.generer).toHaveBeenCalledWith(ORG, "decompte_restitution", "bail-1", `/agence/${ORG}/baux/bail-1`);
    expect(banc.rpc).toHaveBeenNthCalledWith(2, "partager_document_locataire", {
      p_org: ORG,
      p_doc: "doc-decompte",
      p_partager: true,
    });
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("Décompte marqué envoyé");
    expect(r.succes).toContain("à disposition du locataire dans « Mes documents »");
  });

  it("l'envoi refusé par la base ne génère ni ne partage rien", async () => {
    banc.rpc.mockResolvedValue({ error: { message: "Décompte déjà envoyé le 13/10/2026" } });
    const r = await envoi();
    expect(r.erreur).toContain("déjà envoyé");
    expect(banc.generer).not.toHaveBeenCalled();
    expect(banc.rpc).toHaveBeenCalledTimes(1);
  });

  it("PDF impossible à générer : l'envoi reste enregistré, la pièce manquante est dite et le geste manuel indiqué", async () => {
    banc.generer.mockResolvedValue({ erreur: "Document incomplet : adresse du bailleur manquante" });
    const r = await envoi();
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("Décompte marqué envoyé");
    expect(r.succes).toContain("n'a pas pu être mis à disposition");
    expect(r.succes).toContain("adresse du bailleur manquante");
    expect(r.succes).toContain("depuis Documents");
    expect(banc.rpc).toHaveBeenCalledTimes(1);
  });

  it("mise à disposition refusée par la base : même message honnête", async () => {
    banc.generer.mockResolvedValue({ documentId: "doc-decompte" });
    banc.rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "Rattachez d'abord le document à la fiche de la personne concernée" } });
    const r = await envoi();
    expect(r.succes).toContain("n'a pas pu être mis à disposition");
    expect(r.succes).toContain("Rattachez d'abord le document");
  });

  it("une erreur technique de la génération ne fait pas perdre l'envoi", async () => {
    banc.generer.mockRejectedValue(new Error("moteur PDF indisponible"));
    const r = await envoi();
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("Décompte marqué envoyé");
    expect(r.succes).toContain("n'a pas pu être mis à disposition");
    expect(r.succes).not.toContain("moteur PDF");
  });
});
