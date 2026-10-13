import { describe, expect, it } from "vitest";
import { detailsExpurges, libelleAccesDocument, libelleActionAudit, libelleEvenement } from "../src/lib/libelles-journaux";

describe("libellés des journaux", () => {
  it("traduit les tâches automatiques", () => {
    expect(libelleEvenement("tache_quittances_succes")).toBe("Quittances");
    expect(libelleEvenement("tache_veille")).toBe("Veille réglementaire");
    expect(libelleEvenement("tache_orchestrateur")).toBe("Suivi des dossiers");
  });

  it("ne montre jamais un code inconnu", () => {
    expect(libelleEvenement("internal_worker_x17")).toBe("Événement du service enregistré");
    expect(libelleActionAudit("rpc_private_x17")).toBe("Action enregistrée (libellé manquant)");
    expect(libelleActionAudit("constructor")).toBe("Action enregistrée (libellé manquant)");
    expect(libelleEvenement("tache_constructor")).toBe("Travail automatique de Gerimmo");
  });

  it("nomme les actions sensibles écrites par l'application", () => {
    expect(libelleActionAudit("detention_rouverte")).toBe("Détention d’un lot rouverte");
    expect(libelleActionAudit("mois_reouvert")).toBe("Mois comptable rouvert");
    expect(libelleActionAudit("inscription_proprietaire")).toBe("Inscription d’un propriétaire bailleur");
  });

  it("nomme les gestes de la console et les événements de l'application (audit console 27/09)", () => {
    for (const code of ["mission_en_pause", "mission_reprise", "mission_lancee", "veille_ecartee", "publication_parue", "publication_facebook", "reglages_marketing_modifies", "demande_commerciale_traitee", "plan_continuite_enregistre", "marque_verifiee", "etude_territoriale_enregistree", "idees_regroupees", "revue_idees_close", "point_du_matin_prepare", "organisation_suspendue", "compte_bloque", "second_facteur_reinitialise", "invitation_renvoyee"]) {
      expect(libelleActionAudit(code)).not.toMatch(/libellé manquant|protégée/);
    }
    expect(libelleEvenement("changement_mot_de_passe")).toBe("Changement de mot de passe");
    expect(libelleEvenement("erreur_ecran")).toBe("Problème d’affichage");
    expect(detailsExpurges({ digest: "101828213", espace: "agence" })).toBe("espace : agence");
    expect(detailsExpurges({ depuis: "compte" })).toBeNull();
  });

  // Audit du 13/10/2026 (SA-08) : neuf codes écrits au journal sans libellé ; deux suppressions d'encaissement
  // présentées comme un nettoyage automatique.
  it("nomme les neuf codes qui n'avaient pas de libellé et ne prend plus une suppression pour un nettoyage", () => {
    for (const code of ["adhesion_creee", "adhesion_retiree", "decision_retour", "bien_retabli", "bien_retire", "invitation_locataire", "invitation_locataire_acceptee", "invitation_locataire_envoi_echec", "point_du_matin_prepare", "contre_ecriture", "detention_supprimee"]) {
      expect(libelleActionAudit(code)).not.toMatch(/libellé manquant|protégée|Nettoyage/);
    }
    expect(libelleActionAudit("suppression_encaissement")).toBe("Encaissement supprimé, contre-écritures passées");
    expect(libelleActionAudit("suppression_encaissement_depot")).not.toMatch(/Nettoyage/);
    expect(libelleActionAudit("suppression_inconnue_x")).toBe("Action enregistrée (libellé manquant)");
    expect(libelleActionAudit("purge_retention")).toBe("Nettoyage des données arrivées à échéance");
  });

  it("explique les accès aux documents", () => {
    expect(libelleAccesDocument("download")).toBe("Téléchargement");
  });
});
