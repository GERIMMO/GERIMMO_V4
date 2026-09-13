import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgendaLocataire } from "@/app/locataire/[orgId]/agenda-locataire";
import type { SuiviIntervention } from "@/app/locataire/[orgId]/demandes/suivi-intervention";

function mission(etape: string, incident_id = "incident"): SuiviIntervention {
  return {
    incident_id,
    etape,
    intervention_id: "mission",
    artisan: "Artisan test",
    nb_artisans_consultes: 1,
    nb_devis_recus: 1,
    rdv_debut: "2026-09-30T22:30:00Z",
    rdv_fin: "2026-09-30T23:30:00Z",
    terminee_le: null,
    creneaux_a_choisir: 0,
    mes_creneaux_en_attente: 0,
    creneaux_refuses: 0,
    arbitrage: false,
    travaux_realises: null,
    nouvelle_intervention_necessaire: false,
    photos_apres: [],
    deja_notee: false,
  };
}

describe("Agenda locataire", () => {
  it("affiche le rendez-vous dans le fuseau de Paris, y compris au changement de jour", () => {
    const html = renderToStaticMarkup(
      createElement(AgendaLocataire, {
        orgId: "agence",
        suivis: [mission("planifiee")],
      }),
    );
    expect(html).toContain("octobre");
    expect(html).toContain("00:30");
    expect(html).toContain("Artisan test");
  });
  it("ne présente pas une ancienne date d'une mission annulée ou terminée comme un rendez-vous", () => {
    const html = renderToStaticMarkup(
      createElement(AgendaLocataire, {
        orgId: "agence",
        suivis: [mission("annulee"), mission("terminee", "autre")],
      }),
    );
    expect(html).toContain("Aucun rendez-vous programmé");
    expect(html).not.toContain("Artisan test");
  });
  it("un choix de créneau reste une action vers le parcours existant", () => {
    const html = renderToStaticMarkup(
      createElement(AgendaLocataire, { orgId: "agence", choix: 1 }),
    );
    expect(html).toContain("Choisir un créneau");
    expect(html).toContain("/locataire/agence/demandes");
    expect(html).not.toContain("Aucun rendez-vous programmé");
  });
});
