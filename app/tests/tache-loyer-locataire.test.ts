/**
 * Audit final du 27/10 (DRT-01) : la tâche « loyer à régler » de l'accueil du locataire porte le total dû sur toutes les
 * échéances en retard, pas seulement la plus ancienne. DRT-12 : la légende de l'attestation s'accorde et s'élide.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listerMois, tacheLoyerEnRetard } from "@/lib/tache-loyer-locataire";
import { legendeAttestationIndisponible } from "@/lib/locataire-textes";
import { queElide } from "@/lib/elision";

const banc = vi.hoisted(() => ({ donnees: {} as Record<string, unknown> }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async () => ({
    supabase: { rpc: async (nom: string) => ({ data: banc.donnees[nom] ?? [], error: null }) },
    personne: { prenom: "Camille" },
    adhesionActive: true,
  }),
}));
vi.mock("@/lib/quittance-conforme", () => ({ disponibilitesQuittances: async () => ({}) }));
import PageAccueilLocataire from "@/app/locataire/[orgId]/page";

/** Les montants portent des espaces insécables (eur) : on compare à plat. */
const plat = (texte: string) => texte.replace(/[\u202f\u00a0]/g, " ");
const tache = (retards: Parameters<typeof tacheLoyerEnRetard>[0]) => { const t = tacheLoyerEnRetard(retards); return t && { titre: t.titre, detail: plat(t.detail) }; };

const septembre = { periode: "2026-09-01", montant_du: 700, montant_couvert: 300, statut: "partiel", quittance_id: null };
const octobre = { periode: "2026-10-01", montant_du: 700, montant_couvert: 0, statut: "impaye", quittance_id: null };
const bail = { bail_id: "b1", type: "nu", etat: "actif", loyer_hc: 650, charges: 50, date_debut: "2025-08-01", date_fin: null, lot_nom: "Lot A",
  document_signe: null, charges_mode: "provision", jour_echeance: 1, surface_m2: 40, pieces: 2, etage: "1", meuble: false, adresse: "1 rue A", ville: "Paris", zone_tendue: false };

describe("tacheLoyerEnRetard", () => {
  it("une seule échéance partielle : « Il reste 400,00 € »", () => {
    expect(tache([septembre])).toEqual({
      titre: "Loyer de septembre 2026 à régler",
      detail: "Il reste 400,00 € à régler par virement à votre gestionnaire.",
    });
    expect(tache([octobre])).toEqual({
      titre: "Loyer d’octobre 2026 à régler",
      detail: "700,00 € à régler par virement à votre gestionnaire.",
    });
  });
  it("deux échéances : le total au centime, les deux mois cités, la plus ancienne détaillée", () => {
    expect(tache([octobre, septembre])).toEqual({
      titre: "Loyers de septembre et octobre 2026 à régler",
      detail: "1 100,00 € restent dus sur 2 échéances, dont 400,00 € de septembre 2026, à régler par virement à votre gestionnaire.",
    });
    expect(tache([{ ...septembre, montant_du: "700.10", montant_couvert: "0.20" }, octobre])?.detail).toContain("1 399,90 €");
  });
  it("au-delà de trois mois, le titre dit depuis quand plutôt que d'énumérer", () => {
    const mois = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"].map((periode) => ({ ...octobre, periode }));
    expect(tache(mois)).toEqual({
      titre: "Loyers impayés depuis juin 2026",
      detail: "2 800,00 € restent dus sur 4 échéances, dont 700,00 € de juin 2026, à régler par virement à votre gestionnaire.",
    });
    expect(tache(mois.slice(1))?.titre).toBe("Loyers de juillet, août et septembre 2026 à régler");
  });
  it("rien en retard : aucune tâche ; les mois de deux années se citent en entier", () => {
    expect(tacheLoyerEnRetard([])).toBeNull();
    expect(listerMois(["2026-11-01", "2026-12-01", "2027-01-01"])).toBe("novembre 2026, décembre 2026 et janvier 2027");
    expect(listerMois(["2026-08-01", "2026-09-01", "2026-10-01"])).toBe("août, septembre et octobre 2026");
  });
  it("l'accueil du locataire porte le total et les deux mois (DRT-01)", async () => {
    banc.donnees = { mon_bail_locataire: [bail], mon_echeancier_locataire: [septembre, octobre] };
    const html = plat(renderToStaticMarkup(await PageAccueilLocataire({ params: Promise.resolve({ orgId: "org" }) } as never)));
    expect(html).toContain("Loyers de septembre et octobre 2026 à régler");
    expect(html).toContain("1 100,00 € restent dus sur 2 échéances, dont 400,00 € de septembre 2026");
    expect(html).not.toContain("Il reste 400,00 €");
  });
});

describe("légende de l'attestation de bon paiement (DRT-12)", () => {
  beforeEach(() => { banc.donnees = {}; });
  it.each([
    ["octobre 2026", 1, "Disponible dès qu’octobre 2026 et 1 autre mois seront soldés."],
    ["octobre 2026", 2, "Disponible dès qu’octobre 2026 et 2 autres mois seront soldés."],
    ["septembre 2026", 0, "Disponible dès que septembre 2026 sera soldé."],
    ["août 2026", 0, "Disponible dès qu’août 2026 sera soldé."],
  ])("%s + %i autre(s) → %s", (mois, autres, attendu) => expect(legendeAttestationIndisponible(mois, autres)).toBe(attendu));
  it("queElide suit la même règle que deElide", () => {
    expect(queElide("octobre 2026")).toBe("qu’octobre 2026");
    expect(queElide("Hélène")).toBe("qu’Hélène");
    expect(queElide("mars 2026")).toBe("que mars 2026");
  });
});
