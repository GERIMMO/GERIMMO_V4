/**
 * Décision D22 : les gestes du locataire sous son rendez-vous confirmé (gestes-rendez-vous.tsx), rendus sans navigateur.
 *
 * `useState` est simulé par sa valeur initiale (même méthode que artisan-facture-relecture-formulaire.test.ts) :
 * `null` → le panneau ouvert (`sim.ouvert`), `false` → la case de confirmation (`sim.confirme`) ; tout autre état garde
 * sa valeur initiale. Le bouton d'envoi est réputé hydraté. On lit le HTML produit.
 *
 * Ce qui est gardé : le bouton « Je ne peux plus être là » est masqué quand une demande attend ou que l'annulation n'est
 * plus possible ; « Retirer ma demande » n'apparaît que pour une demande en attente ; la raison sans report est dite ;
 * la mention « tardive » vient de la base (`annulation_tardive`), jamais déduite ; la case active l'envoi.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ ouvert: null as null | string, confirme: false }));

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  return {
    ...reel,
    useState: (initial: unknown) => {
      if (initial === null) return [sim.ouvert, () => {}];
      if (initial === false) return [sim.confirme, () => {}];
      return [initial, () => {}];
    },
  };
});
vi.mock("@/lib/use-hydrate", () => ({ useHydrate: () => true, AIDE_BOUTON_EN_ATTENTE: "" }));
vi.mock("@/lib/use-action-state-protegee", () => ({
  useActionStateProtegee: (_action: unknown, initial: unknown) => [initial, () => {}],
}));
vi.mock("@/app/actions/incidents-locataire", () => ({
  annulerRdvLocataire: vi.fn(),
  demanderReportRdv: vi.fn(),
  retirerDemandeRdv: vi.fn(),
}));

import { GestesRendezVous } from "@/app/locataire/[orgId]/demandes/gestes-rendez-vous";
import type { RendezVousLocataire } from "@/lib/rendez-vous-locataire";

function rv(partiel: Partial<RendezVousLocataire> = {}): RendezVousLocataire {
  return {
    intervention_id: "iv", incident_id: "inc", statut_mission: "planifiee",
    rdv_debut: "2026-10-22T07:00:00Z", rdv_fin: "2026-10-22T09:00:00Z",
    report_possible: true, annulation_possible: true, reports_restants: 2,
    demande_id: null, demande_type: null, demande_statut: null, demande_motif_code: null,
    demandee_le: null, expire_le: null, repondu_le: null, reponse_motif: null,
    demande_rdv_debut: null, demande_rdv_fin: null, nouveau_debut: null, nouvelle_fin: null,
    tardive: false, annulation_tardive: false,
    ...partiel,
  };
}
function rendre(rendezVous: RendezVousLocataire, peutAgir = true) {
  return renderToStaticMarkup(
    createElement(GestesRendezVous, { orgId: "org-1", rendezVous, rdvTexte: "jeudi 22 octobre, 9 h – 11 h", peutAgir })
  );
}
/** La balise du bouton d'envoi de l'annulation. */
function boutonAnnuler(html: string) {
  return /<button[^>]*type="submit"[^>]*>[^<]*Annuler le rendez-vous/.exec(html)?.[0] ?? "";
}

beforeEach(() => {
  sim.ouvert = null;
  sim.confirme = false;
});

describe("GestesRendezVous — ce qui est montré", () => {
  it("rendez-vous confirmé, aucune demande : le bouton « Je ne peux plus être là »", () => {
    const html = rendre(rv());
    expect(html).toContain("Je ne peux plus être là");
    expect(html).not.toContain("Retirer ma demande");
  });

  it("une demande de report attend : pas de nouveau geste, mais « Retirer ma demande »", () => {
    const html = rendre(rv({ report_possible: false, reports_restants: 1, demande_id: "d", demande_type: "report", demande_statut: "en_attente" }));
    expect(html).not.toContain("Je ne peux plus être là");
    expect(html).toContain("Retirer ma demande");
    expect(html).toContain("Report demandé");
  });

  it("annulation plus possible (rendez-vous passé ou commencé), ou locataire sans droit d'agir : aucun geste", () => {
    expect(rendre(rv({ report_possible: false, annulation_possible: false }))).not.toContain("Je ne peux plus être là");
    expect(rendre(rv(), false)).not.toContain("Je ne peux plus être là");
  });

  it("demande expirée : pas de « Retirer ma demande », le locataire lit que son rendez-vous est maintenu", () => {
    const html = rendre(rv({ reports_restants: 1, demande_id: "d", demande_type: "report", demande_statut: "expiree" }));
    expect(html).not.toContain("Retirer ma demande");
    expect(html).toContain("rendez-vous actuel est maintenu");
    expect(html).toContain("Je ne peux plus être là");
  });
});

describe("GestesRendezVous — le choix et ses raisons", () => {
  it("report possible : les deux chemins", () => {
    sim.ouvert = "choix";
    const html = rendre(rv());
    expect(html).toContain("Demander un report");
    expect(html).toContain("Annuler le rendez-vous");
  });

  it("plafond atteint : pas de report, la raison est dite", () => {
    sim.ouvert = "choix";
    const html = rendre(rv({ report_possible: false, reports_restants: 0 }));
    expect(html).not.toContain("Demander un report");
    expect(html).toContain("déjà fait l&#x27;objet de 2 demandes de report");
  });

  it("moins de 24 h (la base le dit) : pas de report, la raison du délai", () => {
    sim.ouvert = "choix";
    const html = rendre(rv({ report_possible: false, reports_restants: 2, annulation_tardive: true }));
    expect(html).not.toContain("Demander un report");
    expect(html).toContain("moins de 24 heures");
  });
});

describe("GestesRendezVous — l'annulation", () => {
  it("« tardive » seulement quand la base le dit : une demande échue n'en fait pas une annulation tardive", () => {
    sim.ouvert = "annulation";
    // Le cas relevé : report impossible, des reports restants, aucune demande en attente — mais rendez-vous à 7 jours.
    const loin = rendre(rv({ report_possible: false, reports_restants: 1, demande_id: "d", demande_type: "report", demande_statut: "expiree", annulation_tardive: false }));
    expect(loin).toContain("L&#x27;annulation prend effet tout de suite");
    expect(loin).not.toContain("moins de 24 heures");
    const proche = rendre(rv({ report_possible: false, reports_restants: 2, annulation_tardive: true }));
    expect(proche).toContain("moins de 24 heures");
    expect(proche).toContain("notée au dossier");
  });

  it("la case de confirmation active l'envoi", () => {
    sim.ouvert = "annulation";
    expect(boutonAnnuler(rendre(rv()))).toMatch(/disabled=""/);
    sim.confirme = true;
    const actif = boutonAnnuler(rendre(rv()));
    expect(actif).toContain("Annuler le rendez-vous");
    expect(actif).not.toMatch(/disabled=""/);
  });
});
