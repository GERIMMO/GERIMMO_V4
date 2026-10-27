import { describe, expect, it } from "vitest";
import type { ActionDuJour, AlerteDuJour } from "@/lib/actions-du-jour";
import type { RappelLoyer } from "@/lib/rappels-loyers";
import { preparerVerificationsProprietaire } from "@/lib/verifications-proprietaire";

const ligne = (patch: Partial<RappelLoyer> = {}): RappelLoyer => ({
  appel_id: "octobre", bail_id: "bail", lot_nom: "Appartement", locataire: "Camille",
  periode: "2026-10-01", date_echeance: "2026-10-05", montant_du: 800, montant_couvert: 0,
  non_recu_signale_le: null, ...patch,
});
const action = (patch: Partial<Extract<ActionDuJour, { source: "bail" }>> = {}): ActionDuJour => ({
  cle: "edl-bail", source: "bail", nature: "Sur un bail", criticite: "normale",
  titre: "État des lieux à vérifier", detail: null, echeance: null,
  href: "/espace/org/baux/bail", ...patch,
});
const alerte = (id: string, bailId?: string): ActionDuJour => {
  const detail: AlerteDuJour = {
    id, type: "loyer_impaye", criticite: "critique", titre: "Loyer impayé", echeance: null,
    details: bailId ? { bail_id: bailId } : null, created_at: "2026-10-06T10:00:00Z",
    assignee_account_id: null, assigned_all: true, escalades: null,
  };
  return {
    cle: `a-${id}`, source: "alerte", type: detail.type, nature: "Alerte critique",
    criticite: "critique", titre: detail.titre, detail: null, echeance: null, alerte: detail, href: null,
  };
};
const preparer = (patch: Partial<Parameters<typeof preparerVerificationsProprietaire>[0]> = {}) =>
  preparerVerificationsProprietaire({
    actions: [], lignesLoyers: [], aujourdHui: "2026-10-26", loyersIndisponibles: false, ...patch,
  });

describe("vérifications du propriétaire", () => {
  it("ne sollicite pas le propriétaire pour un loyer payé ou futur", () => {
    const resultat = preparer({ lignesLoyers: [ligne({ montant_couvert: 800 }), ligne({
      appel_id: "novembre", periode: "2026-11-01", date_echeance: "2026-11-05",
    })] });
    expect(resultat.total).toBe(0);
    expect(resultat.premiere).toBeNull();
    expect(resultat.rappels.dus).toEqual([]);
    expect(resultat.rappels.prochaine?.appel_id).toBe("novembre");
  });

  it.each([
    { date_echeance: "2026-10-26" },
    { montant_couvert: 200 },
    { non_recu_signale_le: "2026-10-25T10:00:00Z" },
  ])("garde une échéance atteinte, partiellement payée ou signalée non reçue : %o", patch => {
    const resultat = preparer({ lignesLoyers: [ligne(patch)] });
    expect(resultat.total).toBe(1);
    expect(resultat.rappels.dus).toHaveLength(1);
    expect(resultat.premiere).toEqual({ titre: "Réception du loyer à confirmer", source: "loyer" });
  });

  it("présente les termes successifs d'un bail, puis disparaît après le dernier règlement", () => {
    const septembre = ligne({ appel_id: "septembre", periode: "2026-09-01", date_echeance: "2026-09-05" });
    const octobre = ligne();
    const premier = preparer({ lignesLoyers: [octobre, septembre] });
    // Le bail présente un mois à la fois, mais « À faire » compte ses deux échéances, comme la section des loyers et la
    // carte de l'accueil (audit du 27/10, LAT-03 : les unités ne se mélangent plus sur un même écran).
    expect(premier.total).toBe(2);
    expect(premier.rappels.totalEcheancesDues).toBe(2);
    expect(premier.rappels.dus).toHaveLength(1);
    expect(premier.rappels.dus.map(l => l.appel_id)).toEqual(["septembre"]);
    const suivant = preparer({ lignesLoyers: [octobre, { ...septembre, montant_couvert: 800 }] });
    expect(suivant.rappels.dus.map(l => l.appel_id)).toEqual(["octobre"]);
    expect(preparer({ lignesLoyers: [octobre, septembre].map(l => ({ ...l, montant_couvert: 800 })) }).total).toBe(0);
  });

  it("compte séparément deux baux dus et annonce plusieurs loyers", () => {
    const resultat = preparer({ lignesLoyers: [ligne(), ligne({ bail_id: "autre", appel_id: "autre" })] });
    expect(resultat.total).toBe(2);
    expect(resultat.premiere).toEqual({ titre: "Réception des loyers à confirmer", source: "loyer" });
  });

  it("retire les deux sources doublonnant un loyer affiché, sans masquer les autres baux", () => {
    // L'autre bail reste présent par son propre rappel, qui porte sa dette (audit du 27/10, LAT-01).
    const resultat = preparer({ lignesLoyers: [ligne(), ligne({ bail_id: "autre", appel_id: "autre" })], actions: [
      action({ cle: "impaye-bail", criticite: "critique" }), alerte("meme-bail", "bail"),
      alerte("autre-bail", "autre"), alerte("sans-bail"), action(),
    ] });
    expect(resultat.actions.map(a => a.cle)).toEqual(["a-sans-bail", "edl-bail"]);
    expect(resultat.rappels.dus.map(l => l.bail_id).sort()).toEqual(["autre", "bail"]);
    expect(resultat.total).toBe(4);
    expect(resultat.critiques).toBe(1);
  });

  it("une alerte d'impayé d'un bail soldé n'est ni prioritaire ni comptée (audit du 27/10, LAT-01)", () => {
    const resultat = preparer({ lignesLoyers: [ligne({ bail_id: "solde", montant_couvert: 800 })], actions: [alerte("solde", "solde"), action()] });
    expect(resultat.actions.map(a => a.cle)).toEqual(["edl-bail"]);
    expect(resultat.critiques).toBe(0);
    expect(resultat.premiere).toEqual({ titre: "État des lieux à vérifier", source: "action" });
    expect(resultat.alerteImpayeVisible("solde")).toBe(false);
    // Lecture des loyers indisponible : rien ne permet de dire que l'alerte est périmée.
    expect(preparer({ actions: [alerte("solde", "solde")], loyersIndisponibles: true }).critiques).toBe(1);
  });

  it("garde une urgence en premier même si un loyer doit être confirmé", () => {
    const resultat = preparer({ lignesLoyers: [ligne({ date_echeance: "2026-10-26" })], actions: [
      action(), action({ cle: "danger", criticite: "critique", titre: "Intervention urgente à valider" }),
    ] });
    expect(resultat.premiere).toEqual({ titre: "Intervention urgente à valider", source: "action" });
    expect(resultat.total).toBe(3);
  });

  it("présente le loyer avant une demande normale, y compris une demande ouverte à échéance future", () => {
    const demande = action({ cle: "verification", echeance: "2026-11-02" });
    const resultat = preparer({ lignesLoyers: [ligne()], actions: [demande] });
    expect(resultat.actions).toEqual([demande]);
    expect(resultat.premiere?.source).toBe("loyer");
    expect(preparer({ actions: [demande] }).premiere).toEqual({ titre: demande.titre, source: "action" });
  });

  it("ne dédoublonne aucun impayé avec des données de loyers indisponibles", () => {
    const actions = [action({ cle: "impaye-bail", criticite: "critique" }), alerte("impaye", "bail"), action()];
    const resultat = preparer({ actions, lignesLoyers: [ligne()], loyersIndisponibles: true });
    expect(resultat.actions).toHaveLength(3);
    expect(resultat.rappels.dus).toEqual([]);
    expect(resultat.total).toBe(3);
    expect(resultat.critiques).toBe(2);
  });

  it("trie les urgences puis les échéances et déduplique les clés sans modifier la source", () => {
    const actions = [
      action({ cle: "sans-date" }),
      action({ cle: "doublon", echeance: "2026-10-28" }),
      action({ cle: "date-b", echeance: "2026-10-10" }),
      action({ cle: "date-a", echeance: "2026-10-10", criticite: "informative" }),
      action({ cle: "doublon", criticite: "critique", echeance: "2026-11-01" }),
      action({ cle: "critique-ancien", criticite: "critique", echeance: "2026-10-01" }),
    ];
    const copie = [...actions];
    const resultat = preparer({ actions });
    expect(resultat.actions.map(a => a.cle)).toEqual(["critique-ancien", "doublon", "date-a", "date-b", "sans-date"]);
    expect(resultat.total).toBe(5);
    expect(resultat.critiques).toBe(2);
    expect(actions).toEqual(copie);
  });
});
