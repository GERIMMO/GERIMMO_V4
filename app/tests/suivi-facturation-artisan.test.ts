import { describe, expect, it } from "vitest";
import { classerFacturation, montantEngage } from "@/app/artisan/facturation/suivi-facturation";
import type { LigneAgenda } from "@/app/artisan/acces";

function mission(changements: Partial<LigneAgenda> = {}): LigneAgenda {
  return { intervention_id: "mission", statut: "terminee", compte_rendu_depose: true, photo_apres_deposee: true, facture_deposee: false, montant_plafond_cents: null, montant_ttc_cents: 12000, ...changements } as LigneAgenda;
}

describe("suivi de facturation artisan", () => {
  it("ne propose le dépôt que pour une intervention terminée avec compte rendu et photo", () => {
    const lignes = [mission({ intervention_id: "prete" }), mission({ intervention_id: "sans-photo", photo_apres_deposee: false }), mission({ intervention_id: "sans-compte-rendu", compte_rendu_depose: false }), mission({ intervention_id: "encore-en-cours", statut: "en_cours" })];
    const suivi = classerFacturation(lignes);
    expect(suivi.aFacturer.map(l => l.intervention_id)).toEqual(["prete"]);
    expect(suivi.aCompleter.map(l => l.intervention_id)).toEqual(["sans-photo", "sans-compte-rendu"]);
  });
  it("sépare une facture déjà déposée et ne la repropose pas au dépôt", () => {
    const ligne = mission({ facture_deposee: true });
    const suivi = classerFacturation([ligne]);
    expect(suivi.deposees).toEqual([ligne]);
    expect(suivi.aFacturer).toEqual([]);
    expect(suivi.aCompleter).toEqual([]);
  });
  it("les rendez-vous à venir ne sont pas affichés comme dossiers incomplets", () => {
    const suivi = classerFacturation([mission({ statut: "planifiee", compte_rendu_depose: false, photo_apres_deposee: false }), mission({ intervention_id: "en-cours", statut: "en_cours", photo_apres_deposee: false })]);
    expect(suivi.aCompleter.map(l => l.intervention_id)).toEqual(["en-cours"]);
  });
  it("utilise l’avenant accepté en priorité, conserve zéro et ne chiffre pas un montant inconnu", () => {
    expect(montantEngage(mission({ montant_plafond_cents: 15000 }))).toBe(15000);
    expect(montantEngage(mission({ montant_plafond_cents: 0 }))).toBe(0);
    expect(montantEngage(mission())).toBe(12000);
    expect(montantEngage(mission({ montant_ttc_cents: null }))).toBeNull();
  });
});
