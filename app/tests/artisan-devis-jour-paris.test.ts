/**
 * Audit du 13/10/2026 (ARC-10, suite) : le devis des missions Gerimmo proposait « aujourd'hui + 30 jours » calculé sur
 * le jour UTC (`toISOString()`). Entre minuit et 2 h à Paris (heure d'été), le jour UTC est celui de la veille : la
 * validité par défaut perdait un jour. Même famille que la date du règlement et la date d'accord du client des clients
 * externes, déjà corrigées côté page ; ici, la page du devis et la proposition préparée à l'ouverture de la demande.
 *
 * Le serveur est simulé en UTC, l'horloge à 01:47 à Paris le 14/10/2026 (23:47 UTC le 13/10) : le jour de Paris + 30
 * jours est le 13/11/2026, le jour UTC + 30 jours le 12/11/2026.
 */
process.env.TZ = "UTC";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  charger: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  proposer: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({ user: { id: "u1" } }),
  chargerFicheArtisan: async () => ({ fiche: { artisan_id: "a1", decennale_valide: true } }),
  chargerSollicitations: async () => ({
    lignes: [{
      sollicitation_id: "s1", organization_id: "o1", agence_nom: "Agence TEST", incident_numero: "INC-1", categorie: "plomberie",
      description: "Fuite sous l’évier", urgence: "normale", metier: "plombier", nature_travaux: "reparation", decennale_requise: false,
      code_postal: "75011", ville: "Paris", envoyee_le: "2026-10-13T08:00:00.000Z", statut: "envoyee", valide_jusqu_au: null, montant_ttc_cents: null,
    }],
  }),
  // D16 (14/10) : la page charge aussi les photos jointes par le locataire ; ici, il n'y en a pas.
  chargerPhotosDemande: async () => ({ photos: [], erreur: false }),
  // D18 (livraison 2) : et l'historique des versions de son devis ; ici, une seule version, rien à montrer.
  chargerVersionsDevis: async () => ({ lignes: [], erreur: false }),
  verifierArtisanAction: vi.fn(),
}));
vi.mock("@/lib/parcours-devis-serveur", () => ({ chargerPreparationDevis: m.charger }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifierDevisRecu: vi.fn() }));
vi.mock("@/lib/proposition-devis-ia", () => ({ proposerDevis: m.proposer }));
// Le formulaire est un composant client : on ne garde de lui que ce que la page lui transmet.
vi.mock("../src/app/artisan/devis/[sollicitationId]/formulaire-avec-reprise", () => ({
  FormulaireAvecReprise: (props: { echeanceParDefaut: string }) =>
    createElement("input", { "data-test": "echeance", name: "valide_jusqu_au", readOnly: true, defaultValue: props.echeanceParDefaut }),
}));

import PageRepondreDevis from "@/app/artisan/devis/[sollicitationId]/page";
import { preparerPropositionDevis } from "@/app/artisan/devis/actions-preparation";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T23:47:00.000Z"));
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("validité par défaut du devis : jour de Paris + 30 jours, pas jour UTC + 30 jours (ARC-10)", () => {
  it("page de réponse : la date proposée au formulaire est le 13/11/2026 à 01:47 à Paris", async () => {
    m.charger.mockResolvedValue({ preparation: null });
    const page = renderToStaticMarkup(
      (await PageRepondreDevis({ params: Promise.resolve({ sollicitationId: "s1" }) } as never)) as never
    );
    const champ = page.match(/<input[^>]*data-test="echeance"[^>]*>/)?.[0] ?? "";
    expect(champ).toContain('value="2026-11-13"');
  });

  it("proposition préparée à l'ouverture de la demande : la validité enregistrée est le 13/11/2026", async () => {
    const demande = { statut: "envoyee", categorie: "plomberie", description: "Fuite sous l’évier" };
    const service = {
      rpc: m.rpc.mockResolvedValue({ data: [], error: null }),
      from: () => ({ upsert: m.upsert.mockResolvedValue({ error: null }) }),
    };
    m.proposer.mockResolvedValue({ diagnostic: "Fuite", lignes: [] });
    m.charger
      .mockResolvedValueOnce({ service, fiche: { artisan_id: "a1" }, demande, preparation: null })
      .mockResolvedValueOnce({ preparation: { statut: "brouillon", revision: 0 } });

    expect(await preparerPropositionDevis("s1")).toMatchObject({ preparation: { statut: "brouillon" } });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.upsert.mock.calls[0][0].saisie.valideJusquAu).toBe("2026-11-13");
  });

  it("le jour de Paris + 30 jours ne dérive pas au changement d'heure (25/10/2026) : 10/10 → 09/11", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00.000Z"));
    m.charger.mockResolvedValue({ preparation: null });
    const page = renderToStaticMarkup(
      (await PageRepondreDevis({ params: Promise.resolve({ sollicitationId: "s1" }) } as never)) as never
    );
    expect(page).toContain('value="2026-11-09"');
  });
});
