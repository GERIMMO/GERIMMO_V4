import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { preparerVerificationsProprietaire } from "@/lib/verifications-proprietaire";

const m = vi.hoisted(() => ({ pilotage: vi.fn(), verifications: vi.fn(), carte: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/pilotage-proprietaire", () => ({ chargerPilotageProprietaire: m.pilotage }));
vi.mock("@/lib/lecture-verifications-proprietaire", () => ({ chargerVerificationsProprietaire: m.verifications }));
vi.mock("@/lib/incidents-verifications", () => ({ chargerIncidentsVerifications: async () => ({ incidents: new Map(), indisponible: false }) }));
vi.mock("@/components/accueil-bienvenue", () => ({ AccueilBienvenue: () => null }));
vi.mock("@/components/parcours-demarrage", () => ({ ParcoursDemarrage: () => null }));
vi.mock("@/components/actions-rapides-incident", () => ({ ActionsRapidesIncident: () => null }));
vi.mock("@/components/rappels-loyers", () => ({ RappelsLoyers: () => null }));
vi.mock("@/components/carte-verifications", () => ({ CarteVerifications: (props: { children: ReactNode }) => {
  m.carte(props); return createElement("div", { "data-carte-verifications": true }, props.children);
} }));
import { AccueilProprietaire } from "@/app/agence/[orgId]/accueil-proprietaire";

const lot = { id: "lot", bien_id: "bien", nom: "Studio des Lilas", etat: "disponible" };
const action = (cle: string, critique = false): ActionDuJour => ({
  source: "bail", cle, nature: "Sur un bail", titre: cle, criticite: critique ? "critique" : "normale",
  href: `/espace/org/baux/${cle}#edl`, detail: null, echeance: null,
});
function lecture(actions: ActionDuJour[] = [], loyers = false, error = false) {
  return { erreurs: { baux: error }, lectureLoyers: { error: null },
    verifications: preparerVerificationsProprietaire({ actions, aujourdHui: "2026-10-27", loyersIndisponibles: false,
      lignesLoyers: loyers ? [{ appel_id: "appel", bail_id: "bail", lot_nom: lot.nom, locataire: "Camille", periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 800, montant_couvert: 0, non_recu_signale_le: null }] : [],
    }),
  };
}
const pilotage = () => ({
  patrimoine: { biens: 1, lots: [lot], contrats: 0, lotsOccupes: 0, lotsSansBail: [], chambresSansBail: 0 },
  encaisse: 0, diagnostics: [], reglages: { appels_envoi_auto: false, quittances_envoi_auto: false, relances_envoi_auto: false },
});
beforeEach(() => {
  vi.clearAllMocks(); m.pilotage.mockResolvedValue(pilotage()); m.verifications.mockResolvedValue(lecture());
  m.rpc.mockResolvedValue({ data: [], error: null });
});
async function rendre() {
  return renderToStaticMarkup(await AccueilProprietaire({ supabase: { rpc: m.rpc } as never, orgId: "org", userId: "gerant",
    organisation: { name: "SCI", status: "active", essai_fin: null } }));
}

describe("accueil propriétaire : priorités et tâches à leur place", () => {
  it("compte uniquement les urgences et loyers dans la carte rouge, sans répéter les tâches", async () => {
    m.verifications.mockResolvedValue(lecture([action("Urgence TEST", true), action("Demande courante TEST")], true));
    const html = await rendre();
    expect(m.carte).toHaveBeenCalledWith(expect.objectContaining({ total: 2, critiques: 1, loyersAConfirmer: 1 }));
    const carteTaches = html.split('id="taches-proprietaire"')[1];
    expect(carteTaches).toContain("Demande courante TEST");
    expect(carteTaches).not.toContain("Urgence TEST");
    expect(html.split('id="taches-proprietaire"')[0]).not.toContain("Demande courante TEST");
  });

  it("oriente les demandes courantes vers la liste visible, puis revient au patrimoine une fois traitées", async () => {
    m.verifications.mockResolvedValue(lecture([action("Demande TEST")]));
    await rendre();
    expect(m.carte).toHaveBeenLastCalledWith(expect.objectContaining({ total: 1, critiques: 0, hrefTaches: "#taches-proprietaire" }));
    m.verifications.mockResolvedValue(lecture()); await rendre();
    expect(m.carte).toHaveBeenLastCalledWith(expect.objectContaining({ total: 0, critiques: 0, patrimoine: { biens: 1, lots: 1 }, indisponible: false }));
  });

  it("garde les tâches fiables sans annoncer un repos quand une source échoue", async () => {
    m.verifications.mockResolvedValue(lecture([action("Demande connue")], false, true));
    const html = await rendre();
    expect(html).toContain("Demande connue");
    expect(html).toContain("La liste peut être incomplète");
    expect(html).not.toContain("Aucune tâche");
    expect(m.carte).toHaveBeenLastCalledWith(expect.objectContaining({ total: 0, indisponible: true }));
  });

  it("garde la préparation accessible après une rupture de transport du contrôle", async () => {
    const donnees = pilotage();
    m.pilotage.mockResolvedValue({ ...donnees, patrimoine: { ...donnees.patrimoine, lotsSansBail: [lot] } });
    m.rpc.mockRejectedValue(new Error("lecture indisponible"));
    const html = await rendre();
    expect(html).toContain("Préparation à vérifier");
    expect(html).toContain('href="/espace/org/parc/bien/lots/lot"');
    expect(html).not.toContain("Le logement est prêt");
  });

  it("ne fait pas disparaître les autres tâches si le patrimoine ou les diagnostics sont illisibles", async () => {
    m.pilotage.mockResolvedValue({ ...pilotage(), patrimoine: null, diagnostics: null });
    m.verifications.mockResolvedValue(lecture([action("Demande fiable")]));
    const html = await rendre();
    expect(html).toContain("Demande fiable");
    expect(html).toContain("La liste peut être incomplète");
    expect(html).not.toContain("Aucune tâche");
  });
});
