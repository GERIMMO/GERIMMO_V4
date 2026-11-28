import { describe, expect, it } from "vitest";
import { prochaineActionIncident } from "@/lib/prochaine-action-incident";

describe("prochaine action du dossier", () => {
  it.each([
    ["declare", "Examiner le signalement"],
    ["qualifie", "Organiser la résolution"],
    ["affecte", "Organiser le rendez-vous"],
    ["en_cours", "Terminer l’intervention"],
    ["termine", "Vérifier l’intervention et clôturer le dossier"],
    ["clos", "Dossier clos"],
    ["rouvert", "Réexaminer le signalement"],
  ])("indique l’action pour un incident %s", (etat, titre) => {
    expect(prochaineActionIncident(etat).titre).toBe(titre);
  });

  it.each([
    ["proposee", "Artisan"],
    ["acceptee", "Artisan"],
    ["planifiee", "Artisan"],
    ["en_cours", "Artisan"],
    ["terminee", "Propriétaire"],
    ["refusee", "Propriétaire"],
    ["annulee", "Propriétaire"],
  ])("attribue l’action pour une mission %s", (statut, responsable) => {
    expect(prochaineActionIncident("affecte", { statut }).responsable).toBe(responsable);
  });

  it("attribue le choix au locataire et conserve la date du rendez-vous confirmé", () => {
    expect(prochaineActionIncident("affecte", { statut: "acceptee", attendLocataire: true }).responsable).toBe("Locataire");
    const date = "2026-12-01T10:00:00Z";
    expect(prochaineActionIncident("affecte", { statut: "planifiee", date }).date).toBe(date);
  });
});
