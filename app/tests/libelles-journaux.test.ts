import { describe, expect, it } from "vitest";
import { libelleAccesDocument, libelleActionAudit, libelleEvenement } from "../src/lib/libelles-journaux";

describe("libellés des journaux", () => {
  it("traduit les tâches automatiques", () => {
    expect(libelleEvenement("tache_quittances_succes")).toBe("Envoi des quittances");
  });

  it("ne montre jamais un code inconnu", () => {
    expect(libelleEvenement("internal_worker_x17")).toBe("Événement du service enregistré");
    expect(libelleActionAudit("rpc_private_x17")).toBe("Action enregistrée (libellé manquant)");
  });

  it("nomme les actions sensibles écrites par l'application", () => {
    expect(libelleActionAudit("detention_rouverte")).toBe("Détention d’un lot rouverte");
    expect(libelleActionAudit("mois_reouvert")).toBe("Mois comptable rouvert");
    expect(libelleActionAudit("inscription_proprietaire")).toBe("Inscription d’un propriétaire bailleur");
  });

  it("explique les accès aux documents", () => {
    expect(libelleAccesDocument("download")).toBe("Téléchargement");
  });
});
