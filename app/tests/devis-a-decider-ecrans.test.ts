/**
 * Audit du 13/10/2026, PRO2-13, décision D19 (option A) : ce que l'application affiche d'un devis reçu qui attend sa
 * décision. La base crée et ferme l'alerte (devis-a-decider-alerte.test.ts) ; ici, la partie pure : le geste de
 * l'alerte, son entrée dans le plan du jour, et le compte « À traiter » de la liste des incidents.
 */
import { describe, expect, it } from "vitest";
import { regrouperActionsDuJour, type AlerteDuJour } from "@/lib/actions-du-jour";
import { cheminFicheAlerte, gesteAlerte } from "@/lib/chemin-alerte";
import { ETATS_A_TRAITER, incidentsATraiter } from "@/lib/incidents";

const ORG = "org-1";

describe("l'alerte « devis reçu, à décider »", () => {
  const alerte = { type: "devis_a_decider", details: { incident_id: "inc-7", devis_id: "dev-1" } };

  it("ouvre le dossier de l'incident", () => {
    expect(cheminFicheAlerte(alerte, ORG)).toBe(`/agence/${ORG}/incidents?sel=inc-7`);
  });

  it("nomme le geste, et dit qu'elle se referme d'elle-même quand le devis est retenu", () => {
    expect(gesteAlerte(alerte, ORG)).toEqual({
      href: `/agence/${ORG}/incidents?sel=inc-7`,
      libelle: "Examiner le devis reçu",
      seFermeSeule: true,
    });
  });

  it("ne fabrique pas d'adresse sans l'incident", () => {
    expect(cheminFicheAlerte({ type: "devis_a_decider", details: { devis_id: "dev-1" } }, ORG)).toBeNull();
  });

  it("entre dans le plan du jour et emmène au dossier", () => {
    const a: AlerteDuJour = {
      id: "al-1",
      type: "devis_a_decider",
      criticite: "normale",
      titre: "Devis reçu, à décider — INC-0002",
      echeance: null,
      details: { incident_id: "inc-7", libelle: "Un devis est arrivé : consultez-le et décidez de le retenir." },
      created_at: "2026-10-14T08:00:00Z",
      assignee_account_id: null,
      assigned_all: true,
      escalades: null,
    };
    const plan = regrouperActionsDuJour({
      orgId: ORG,
      userId: "moi",
      portefeuille: null,
      attendues: [],
      alertes: [a],
      rapports: [],
      aujourdhui: "2026-10-14",
    });
    expect(plan.total).toBe(1);
    expect(plan.aVenir[0]).toMatchObject({
      source: "alerte",
      type: "devis_a_decider",
      href: `/agence/${ORG}/incidents?sel=inc-7`,
      detail: "Un devis est arrivé : consultez-le et décidez de le retenir.",
    });
  });
});

describe("la file « À traiter » de la liste des incidents", () => {
  const incident = (id: string, etat: string) => ({ id, etat });
  const aucun = new Set<string>();

  it("garde les états qui attendaient déjà l'agence", () => {
    const liste = ETATS_A_TRAITER.map((etat) => incident(`i-${etat}`, etat));
    expect(incidentsATraiter(liste, aucun).map((i) => i.etat)).toEqual(["declare", "rouvert", "termine"]);
  });

  it("n'y met pas un incident qualifié, affecté ou en cours dont aucun devis n'attend", () => {
    const liste = [incident("q", "qualifie"), incident("a", "affecte"), incident("e", "en_cours")];
    expect(incidentsATraiter(liste, aucun)).toEqual([]);
  });

  it("y met un incident qualifié dont un devis attend la décision (constat : « À traiter » restait à 2)", () => {
    const liste = [incident("INC-1", "declare"), incident("INC-2", "qualifie"), incident("INC-3", "declare")];
    const aTraiter = incidentsATraiter(liste, new Set(["INC-2"]));
    expect(aTraiter.map((i) => i.id)).toEqual(["INC-1", "INC-2", "INC-3"]);
  });

  it("ne compte qu'une fois un incident à traiter qui a aussi un devis en attente", () => {
    const liste = [incident("INC-1", "declare")];
    expect(incidentsATraiter(liste, new Set(["INC-1"]))).toHaveLength(1);
  });

  it("ne met jamais un incident clos dans la file, même si un devis traîne", () => {
    expect(incidentsATraiter([incident("INC-9", "clos")], new Set(["INC-9"]))).toEqual([]);
  });

  it("ignore un devis en attente dont l'incident n'est pas dans la liste lue (portefeuille)", () => {
    expect(incidentsATraiter([incident("INC-1", "qualifie")], new Set(["INC-autre"]))).toEqual([]);
  });
});
