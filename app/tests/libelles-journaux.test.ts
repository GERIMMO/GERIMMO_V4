import { describe, expect, it } from "vitest";
import { codesConnusJournaux, detailsExpurges, libelleAccesDocument, libelleActionAudit, libelleEvenement } from "../src/lib/libelles-journaux";

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

  // D08 (audit du 13/10, SA-01) : la ligne de traversée dit la page, l'objet et la décision d'accès, en français,
  // sans identifiant long ni adresse ni empreinte technique à l'écran.
  it("lit la trace d'une traversée de la supervision en français, sans identifiant ni adresse", () => {
    expect(libelleActionAudit("traversee_espace")).toBe("Consultation d’un espace client par la supervision");
    expect(libelleActionAudit("traversee_action")).toBe("Action dans un espace client par la supervision (écriture possible)");
    expect(
      detailsExpurges({
        resultat: "autorise", requete: "action_serveur", rubrique: "baux",
        objet_id: "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11", route: "/agence/f2cb7540-d6f9-471d-bd6e-44b6d9e7ea39/baux/0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11", action_ref: "7f3a9c0d2e4b5a69",
      })
    ).toBe("accès : autorisé · requête : action · rubrique : baux");
    expect(detailsExpurges({ resultat: "refuse", requete: "page", motif: "organisation_introuvable", rubrique: "parc" })).toBe(
      "accès : refusé · requête : page · motif : organisation introuvable · rubrique : parc"
    );
    expect(detailsExpurges({ resultat: "autorise", requete: "formulaire" })).toBe("accès : autorisé · requête : formulaire");
  });

  // Relecture : « résultat : autorisé » à côté d'un geste se lisait comme « le geste a réussi » ; or la trace est
  // posée avant le geste. L'écran dit donc « accès », et nomme le geste en français.
  it("nomme le geste en français et dit « accès » (la décision d'accès), jamais l'identifiant de la cible", () => {
    expect(
      detailsExpurges({
        resultat: "autorise", requete: "action_serveur", geste: "encaissement", rubrique: "parc",
        objet_id: "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11", route: "/agence/f2cb7540-d6f9-471d-bd6e-44b6d9e7ea39/parc", action_ref: "7f3a9c0d2e4b5a69",
      })
    ).toBe("accès : autorisé · requête : action · geste : encaissement d’un loyer · rubrique : parc");
    expect(detailsExpurges({ geste: "cloture_mois" })).toBe("geste : clôture d’un mois comptable");
  });

  it("un geste inconnu s'affiche tel quel (code court), sans casser l'écran", () => {
    expect(detailsExpurges({ geste: "geste_futur" })).toBe("geste : geste_futur");
    expect(detailsExpurges({ geste: "constructor" })).toBe("geste : constructor");
  });

  it("lit une organisation demandée mais absente : l'identifiant reste à la base, un texte invalide se dit", () => {
    expect(detailsExpurges({ resultat: "refuse", org_demandee: "22222222-2222-4222-8222-222222222222" })).toBe("accès : refusé");
    expect(detailsExpurges({ resultat: "refuse", org_demandee: "invalide" })).toBe("accès : refusé · organisation demandée : invalide");
  });

  it("une valeur inconnue d'une clé traduite s'affiche telle quelle, jamais un code interne inventé", () => {
    expect(detailsExpurges({ resultat: "inconnu_x" })).toBe("accès : inconnu_x");
    expect(detailsExpurges({ resultat: "constructor" })).toBe("accès : constructor");
  });

  // D13 (SUP-05) et D48 (IA-11), 14/10/2026 : les traces des faits de direction et du nettoyage des registres se lisent en français.
  it("nomme les traces des faits de direction et le nettoyage des registres d'exécution", () => {
    for (const code of ["preparation_faits_direction", "consultation_faits_direction", "effacement_instantanes_faits_direction"]) {
      expect(libelleActionAudit(code)).not.toMatch(/libellé manquant|protégée/);
    }
    expect(libelleActionAudit("consultation_faits_direction")).toBe("Consultation des faits de direction (une ligne par organisation citée)");
    expect(libelleEvenement("purge_registres_execution")).toBe("Nettoyage des registres d’exécution arrivés à échéance");
    expect(codesConnusJournaux().audit).toContain("consultation_faits_direction");
  });

  it("explique les accès aux documents", () => {
    expect(libelleAccesDocument("download")).toBe("Téléchargement");
  });
});
