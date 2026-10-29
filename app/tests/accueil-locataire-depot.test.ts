/**
 * Décision D36 (SOR-05), option B — le locataire sortant voit son dépôt de
 * garantie : l'accueil porte la carte « Votre dépôt de garantie » à la place de
 * « Rien à régler pour l'instant » quand une restitution existe (en cours ou
 * décompte établi), avec un lien.
 * L'option C (pièce « décompte » dans « Mes documents » à l'envoi) est reportée :
 * l'envoi du décompte ne publie rien au locataire (dernier bloc).
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
      rpc: (nom: string) => {
        const resultat = { data: banc.donnees[nom] ?? [], error: banc.erreurs[nom] ?? null, count: Array.isArray(banc.donnees[nom]) ? banc.donnees[nom].length : 0 };
        const q = { order: () => q, range: () => Promise.resolve(resultat), then: (resolve: (r: typeof resultat) => unknown) => Promise.resolve(resultat).then(resolve) };
        return q;
      },
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

describe("D36 — l'envoi du décompte n'est qu'un envoi (option C reportée)", () => {
  // La page « Complément » range D36 C parmi les options reportées : la mise à disposition du
  // décompte au locataire est un geste distinct (RM-12, partager_document_locataire), et
  // l'effet juridique d'une créance publiée n'a pas été examiné. L'envoi ne publie donc rien.
  function envoi() {
    const f = new FormData();
    f.set("date", "2026-10-14");
    return marquerDecompteEnvoye(ORG, "bail-1", "rst-1", {}, f);
  }

  it("envoyé : seul l'envoi est enregistré, le décompte n'est ni généré ni mis à disposition du locataire", async () => {
    banc.generer.mockResolvedValue({ documentId: "doc-decompte", succes: "ok" });
    const r = await envoi();
    expect(banc.rpc).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledWith("marquer_decompte_envoye", { p_restitution: "rst-1", p_date: "2026-10-14" });
    expect(banc.rpc).not.toHaveBeenCalledWith("partager_document_locataire", expect.anything());
    expect(banc.generer).not.toHaveBeenCalled();
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toBe("Décompte marqué envoyé — l'alerte d'envoi est fermée.");
    expect(r.succes).not.toContain("Mes documents");
  });

  it("l'envoi refusé par la base remonte tel quel et ne génère rien", async () => {
    banc.rpc.mockResolvedValue({ error: { message: "Décompte déjà envoyé le 13/10/2026" } });
    const r = await envoi();
    expect(r.erreur).toContain("déjà envoyé");
    expect(banc.generer).not.toHaveBeenCalled();
    expect(banc.rpc).toHaveBeenCalledTimes(1);
  });
});
