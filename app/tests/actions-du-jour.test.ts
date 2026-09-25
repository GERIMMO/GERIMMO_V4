/**
 * Le plan du jour — UN calcul pour la tuile « À faire », la pastille « Alertes »
 * et la page /alertes (relevé du 24/09 : « on lit “2 à faire”, on clique, on
 * n'en trouve qu'un »). Ces tests tiennent la partie pure : ce qui entre dans
 * le compte, ce qui en sort, et l'ordre des rangs.
 */
import { describe, expect, it } from "vitest";
import {
  cleDuPortefeuille,
  portefeuilleDepuisCle,
  regrouperActionsDuJour,
  type AlerteDuJour,
  type RapportAValider,
} from "@/lib/actions-du-jour";
import type { ActionAttendue } from "@/lib/actions-attendues";
import { eur } from "@/lib/ged";
import { PortefeuilleIndisponible } from "@/lib/portefeuille";

const ORG = "org-1";
const MOI = "compte-moi";
const AUJOURDHUI = "2026-09-24";

const alerte = (partiel: Partial<AlerteDuJour> & { id: string }): AlerteDuJour => ({
  type: "generique",
  criticite: "normale",
  titre: `Alerte ${partiel.id}`,
  echeance: null,
  details: null,
  created_at: "2026-09-01T08:00:00Z",
  assignee_account_id: null,
  assigned_all: true,
  escalades: null,
  ...partiel,
});

const attendue = (partiel: Partial<ActionAttendue> & { cle: string }): ActionAttendue => ({
  titre: `Action ${partiel.cle}`,
  detail: null,
  href: `/agence/${ORG}/baux/b1`,
  critique: false,
  ...partiel,
});

const rapport = (
  id: string,
  mois: string,
  mandat: { date_rapport?: number | null; agent_account_id?: string | null } = {}
): RapportAValider => ({
  id,
  mois,
  mandat: {
    date_rapport: mandat.date_rapport ?? 10,
    agent_account_id: mandat.agent_account_id ?? null,
    person: { nom: "Durand", prenom: "Paul" },
  },
});

const regrouper = (
  entree: Partial<Parameters<typeof regrouperActionsDuJour>[0]> = {}
) =>
  regrouperActionsDuJour({
    orgId: ORG,
    userId: MOI,
    portefeuille: null,
    attendues: [],
    alertes: [],
    rapports: [],
    aujourdhui: AUJOURDHUI,
    ...entree,
  });

describe("regrouperActionsDuJour — le compte", () => {
  it("additionne les trois sources : baux, alertes, rapports dus sous quinze jours", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "impaye-b1", critique: true })],
      alertes: [alerte({ id: "a1", echeance: "2026-09-30" })],
      // Août, rendu le 10 septembre : en retard — reste dans le plan.
      rapports: [rapport("r1", "2026-08-01")],
    });
    expect(plan.surLesBaux).toHaveLength(1);
    expect(plan.enRetard).toHaveLength(1);
    expect(plan.aVenir).toHaveLength(1);
    expect(plan.total).toBe(3);
    expect(plan.total).toBe(plan.surLesBaux.length + plan.enRetard.length + plan.aVenir.length);
    // Le blocage sur le bail et le rapport échu sont tous deux en retard ;
    // l'alerte du 30/09 ne l'est pas.
    expect(plan.retards).toBe(2);
  });

  it("compte un impayé sur un bail comme un retard, même sans échéance", () => {
    const plan = regrouper({ attendues: [attendue({ cle: "impaye-b1", critique: true })] });
    expect(plan.enRetard).toHaveLength(0);
    expect(plan.retards).toBe(1);
  });

  it("dit zéro quand rien n'attend", () => {
    const plan = regrouper();
    expect(plan.total).toBe(0);
    expect(plan.critiques).toBe(0);
  });

  it("compte les critiques toutes sources confondues : un impayé sur un bail rougit la pastille", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "impaye-b1", critique: true }), attendue({ cle: "edl-b2" })],
      alertes: [alerte({ id: "a1", criticite: "critique" }), alerte({ id: "a2" })],
    });
    expect(plan.critiques).toBe(2);
    expect(plan.surLesBaux.map((a) => a.nature)).toEqual(["Bail bloqué", "Sur un bail"]);
  });

  it("ne montre pas deux fois l'EDL d'entrée : l'alerte posée à l'activation cède la place à l'item calculé", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "edl-b1" })],
      alertes: [
        alerte({ id: "a1", type: "edl_entree", details: { bail_id: "b1" } }),
        alerte({ id: "a2", type: "edl_entree", details: { bail_id: "b9" } }),
      ],
    });
    expect(plan.total).toBe(2);
    expect(plan.aVenir.map((a) => a.cle)).toEqual(["a-a2"]);
  });

  // 25/09 : la tâche de nuit pose une alerte `loyer_impaye` par bail impayé ;
  // l'item calculé « Loyer impayé » disait déjà la même chose — on lisait
  // « 2 à faire », deux critiques, pour un seul loyer.
  it("compte UNE fois l'impayé : l'alerte loyer_impaye du même bail cède la place à l'item calculé", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "impaye-b1", critique: true })],
      alertes: [
        alerte({ id: "a1", type: "loyer_impaye", criticite: "critique", details: { bail_id: "b1", montant_du: 650 } }),
      ],
    });
    expect(plan.total).toBe(1);
    expect(plan.critiques).toBe(1);
    expect(plan.surLesBaux.map((a) => a.cle)).toEqual(["impaye-b1"]);
    expect(plan.aVenir).toHaveLength(0);
  });

  it("garde l'alerte loyer_impaye d'un AUTRE bail, et celle dont le bail n'est pas dans les items", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "impaye-b1", critique: true })],
      alertes: [alerte({ id: "a2", type: "loyer_impaye", criticite: "critique", details: { bail_id: "b2" } })],
    });
    expect(plan.total).toBe(2);
    expect(plan.critiques).toBe(2);
  });

  it("compte UNE fois le diagnostic expiré : l'alerte diagnostic_expiration reconnue par son diagnostic_id", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "dpe-lot1", diagnosticIds: ["diag-1"] }), attendue({ cle: "erp-bien1", diagnosticIds: [] })],
      alertes: [
        alerte({ id: "a1", type: "diagnostic_expiration", criticite: "critique", details: { diagnostic_id: "diag-1", seuil: "J+0" } }),
        // Un autre diagnostic, pas encore expiré (J-30) : rien ne le remplace.
        alerte({ id: "a2", type: "diagnostic_expiration", details: { diagnostic_id: "diag-9", seuil: "J-30" } }),
      ],
    });
    expect(plan.total).toBe(3);
    expect(plan.aVenir.map((a) => a.cle)).toEqual(["a-a2"]);
  });

  it("compte UNE fois la pièce expirée : l'alerte assurance_expiration du même document s'efface", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "piece-doc1" })],
      alertes: [
        alerte({ id: "a1", type: "assurance_expiration", criticite: "critique", details: { document_id: "doc1", seuil: "J+0" } }),
        alerte({ id: "a2", type: "assurance_expiration", details: { document_id: "doc2", seuil: "J-15" } }),
      ],
    });
    expect(plan.total).toBe(2);
    expect(plan.critiques).toBe(0);
    expect(plan.aVenir.map((a) => a.cle)).toEqual(["a-a2"]);
  });
});

describe("regrouperActionsDuJour — les rapports de gestion", () => {
  it("garde le rapport dû sous quinze jours, écarte celui qui est plus loin", () => {
    const plan = regrouper({
      rapports: [
        // Septembre, rendu le 8 octobre (jour du mandat) : dans 14 jours → à venir.
        rapport("proche", "2026-09-01", { date_rapport: 8 }),
        // Septembre, rendu le 10 octobre : dans 16 jours → pas encore.
        rapport("loin", "2026-09-01"),
      ],
    });
    expect(plan.aVenir.map((a) => a.cle)).toEqual(["r-proche"]);
    expect(plan.aVenir[0]).toMatchObject({
      source: "rapport",
      nature: "Rapport de gestion",
      echeance: "2026-10-08",
      href: `/agence/${ORG}/comptabilite`,
    });
    expect(plan.aVenir[0].detail).toContain("Durand Paul");
  });

  it("garde un rapport en retard : le masquer ferait disparaître du travail", () => {
    const plan = regrouper({ rapports: [rapport("vieux", "2026-05-01")] });
    expect(plan.enRetard.map((a) => a.cle)).toEqual(["r-vieux"]);
    expect(plan.enRetard[0].echeance).toBe("2026-06-10");
    expect(plan.enRetard[0].criticite).toBe("normale");
  });

  it("sur un portefeuille, écarte les mandats confiés à un autre agent et garde ceux sans titulaire", () => {
    const plan = regrouper({
      portefeuille: new Set(["lot-1"]),
      rapports: [
        rapport("mien", "2026-08-01", { agent_account_id: MOI }),
        rapport("collegue", "2026-08-01", { agent_account_id: "compte-autre" }),
        rapport("sans-titulaire", "2026-08-01", { agent_account_id: null }),
      ],
    });
    expect(plan.enRetard.map((a) => a.cle).sort()).toEqual(["r-mien", "r-sans-titulaire"]);
  });

  it("sans portefeuille (admin), garde aussi les mandats des autres agents", () => {
    const plan = regrouper({
      rapports: [rapport("collegue", "2026-08-01", { agent_account_id: "compte-autre" })],
    });
    expect(plan.total).toBe(1);
  });
});

describe("regrouperActionsDuJour — les rangs et leur ordre", () => {
  it("sépare le retard de l'à-venir sur la date de Paris, et trie par urgence", () => {
    const plan = regrouper({
      alertes: [
        alerte({ id: "demain", echeance: "2026-09-25" }),
        alerte({ id: "hier", echeance: "2026-09-23" }),
        alerte({ id: "avant-hier-critique", echeance: "2026-09-22", criticite: "critique" }),
        alerte({ id: "aujourdhui", echeance: "2026-09-24" }),
        alerte({ id: "sans-date", echeance: null }),
      ],
    });
    expect(plan.enRetard.map((a) => a.cle)).toEqual(["a-avant-hier-critique", "a-hier"]);
    expect(plan.aVenir.map((a) => a.cle)).toEqual(["a-aujourdhui", "a-demain", "a-sans-date"]);
  });

  it("à date égale, met le critique avant le normal, puis l'ordre alphabétique", () => {
    const plan = regrouper({
      alertes: [
        alerte({ id: "b", echeance: "2026-09-30", titre: "Zèbre" }),
        alerte({ id: "c", echeance: "2026-09-30", titre: "Abricot" }),
        alerte({ id: "a", echeance: "2026-09-30", criticite: "critique", titre: "Zut" }),
      ],
    });
    expect(plan.aVenir.map((a) => a.cle)).toEqual(["a-a", "a-c", "a-b"]);
  });

  it("emmène une alerte incident au dossier, et laisse les autres à la pop-up", () => {
    const plan = regrouper({
      alertes: [
        alerte({ id: "inc", type: "incident_a_qualifier", details: { incident_id: "i-7" } }),
        alerte({ id: "gen" }),
      ],
    });
    const [gen, inc] = plan.aVenir;
    expect(inc).toMatchObject({ source: "alerte", type: "incident_a_qualifier", href: `/agence/${ORG}/incidents?sel=i-7` });
    expect(gen).toMatchObject({ source: "alerte", href: null });
    expect(gen.source === "alerte" && gen.alerte.id).toBe("gen");
  });

  it("écrit le contexte de l'alerte : libellé et montant en jeu", () => {
    const plan = regrouper({
      alertes: [alerte({ id: "imp", details: { libelle: "Lot A · Martin", solde: 1234.5 } })],
    });
    expect(plan.aVenir[0].detail).toBe(`Lot A · Martin · ${eur(1234.5)}`);
    expect(plan.aVenir[0].nature).toBe("Alerte normale");
  });

  it("porte sur chaque rang de bail le lien qui résout", () => {
    const plan = regrouper({
      attendues: [attendue({ cle: "impaye-b1", critique: true, href: `/agence/${ORG}/baux/b1#loyers`, detail: "120,00 € échus non couverts" })],
    });
    expect(plan.surLesBaux[0]).toMatchObject({
      source: "bail",
      criticite: "critique",
      echeance: null,
      href: `/agence/${ORG}/baux/b1#loyers`,
      detail: "120,00 € échus non couverts",
    });
  });
});

describe("la clé de mémo du portefeuille", () => {
  it("fait l'aller-retour : tout voir, indisponible, une liste de lots", () => {
    expect(portefeuilleDepuisCle(cleDuPortefeuille(null))).toBeNull();
    const indisponible = portefeuilleDepuisCle(cleDuPortefeuille(new PortefeuilleIndisponible()));
    expect(indisponible).toBeInstanceOf(PortefeuilleIndisponible);
    expect(indisponible?.size).toBe(0);
    const lots = portefeuilleDepuisCle(cleDuPortefeuille(new Set(["b", "a"])));
    expect(lots).not.toBeInstanceOf(PortefeuilleIndisponible);
    expect([...(lots ?? [])].sort()).toEqual(["a", "b"]);
  });

  it("donne la même clé à deux Sets de même contenu — c'est ce qui partage la lecture entre layout et page", () => {
    expect(cleDuPortefeuille(new Set(["x", "y"]))).toBe(cleDuPortefeuille(new Set(["y", "x"])));
    expect(cleDuPortefeuille(new Set())).not.toBe(cleDuPortefeuille(null));
    expect(portefeuilleDepuisCle(cleDuPortefeuille(new Set()))?.size).toBe(0);
  });
});
