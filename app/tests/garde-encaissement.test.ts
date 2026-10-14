/**
 * D04 (2), fiche VER-TS-02 : un encaissement de loyer très supérieur à ce qui est dû demande une CONFIRMATION
 * (jamais un refus). Option A du dirigeant : au-delà de 2 × (reste dû + un terme).
 *
 * Ce fichier teste la règle seule (src/lib/garde-encaissement.ts), au centime : juste en dessous du seuil, au
 * seuil, juste au-dessus ; puis la lecture du drapeau de confirmation, qui doit porter le MÊME montant que celui
 * saisi (sinon une confirmation donnée pour 84 000 € vaudrait pour toute autre somme tapée ensuite).
 * Les actions qui l'appliquent sont testées dans `encaissement-cle-envoi-action.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  confirmationDonnee,
  evaluerEncaissement,
  seuilDeConfirmation,
  type LigneTerme,
} from "@/lib/garde-encaissement";

// Deux termes de 840 € appelés, rien d'encaissé : reste dû 1 680 €, un terme 840 €, seuil 2 × 2 520 = 5 040 €.
const DEUX_TERMES_IMPAYES: LigneTerme[] = [
  { montant_du: 840, montant_couvert: 0 },
  { montant_du: 840, montant_couvert: 0 },
];
// Tout est payé : reste dû 0 €, un terme 840 €, seuil 2 × 840 = 1 680 €.
const A_JOUR: LigneTerme[] = [
  { montant_du: 840, montant_couvert: 840 },
  { montant_du: 840, montant_couvert: 840 },
];

describe("seuil de confirmation : 2 × (reste dû + un terme)", () => {
  it("se calcule au centime, sans erreur d'arrondi des nombres à virgule", () => {
    expect(seuilDeConfirmation(1680, 840)).toBe(5040);
    expect(seuilDeConfirmation(0, 840)).toBe(1680);
    expect(seuilDeConfirmation(0.1, 0.2)).toBe(0.6);
    expect(seuilDeConfirmation(1234.56, 789.01)).toBe(4047.14);
  });
});

describe("évaluation d'un encaissement", () => {
  it("un encaissement normal ne demande rien : le terme, le reste dû, un paiement partiel", () => {
    expect(evaluerEncaissement(840, DEUX_TERMES_IMPAYES).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(1680, DEUX_TERMES_IMPAYES).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(2.5, DEUX_TERMES_IMPAYES).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(840, A_JOUR).confirmationRequise).toBe(false);
  });

  it("juste en dessous du seuil : aucune confirmation", () => {
    expect(evaluerEncaissement(5039.99, DEUX_TERMES_IMPAYES).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(1679.99, A_JOUR).confirmationRequise).toBe(false);
  });

  it("AU seuil : aucune confirmation (la confirmation commence au-delà)", () => {
    expect(evaluerEncaissement(5040, DEUX_TERMES_IMPAYES).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(1680, A_JOUR).confirmationRequise).toBe(false);
  });

  it("juste au-dessus du seuil : confirmation, avec le montant, le seuil et les éléments du calcul", () => {
    const verdict = evaluerEncaissement(5040.01, DEUX_TERMES_IMPAYES);
    expect(verdict.confirmationRequise).toBe(true);
    if (!verdict.confirmationRequise) return;
    expect(verdict.confirmation).toMatchObject({ montant: 5040.01, resteDu: 1680, terme: 840, seuil: 5040 });
    const v2 = evaluerEncaissement(1680.01, A_JOUR);
    expect(v2.confirmationRequise).toBe(true);
    if (!v2.confirmationRequise) return;
    expect(v2.confirmation).toMatchObject({ resteDu: 0, terme: 840, seuil: 1680 });
  });

  it("le cas constaté sur le banc : 840,00 lu 84000 est signalé, avec un message qui dit ce qui est attendu", () => {
    const verdict = evaluerEncaissement(84000, DEUX_TERMES_IMPAYES);
    expect(verdict.confirmationRequise).toBe(true);
    if (!verdict.confirmationRequise) return;
    const { message } = verdict.confirmation;
    expect(message).toContain("84 000,00 €");
    expect(message).toContain("1 680,00 €");
    expect(message).toContain("840,00 €");
    expect(message).toContain("5 040,00 €");
    expect(message).toMatch(/Rien n'est encore enregistré/);
    expect(message).toMatch(/confirmez/i);
  });

  it("un terme partiellement payé compte pour son reste, jamais pour un négatif", () => {
    const lignes: LigneTerme[] = [
      { montant_du: 840, montant_couvert: 840 },
      { montant_du: 840, montant_couvert: 300 },
    ];
    const verdict = evaluerEncaissement(2 * (540 + 840) + 0.01, lignes);
    expect(verdict.confirmationRequise).toBe(true);
    if (!verdict.confirmationRequise) return;
    expect(verdict.confirmation.resteDu).toBe(540);
    // Un terme sur-couvert (valeur anormale) ne retire rien au reste dû des autres.
    const surCouvert: LigneTerme[] = [
      { montant_du: 100, montant_couvert: 150 },
      { montant_du: 840, montant_couvert: 0 },
    ];
    const v = evaluerEncaissement(2 * (840 + 840) + 0.01, surCouvert);
    expect(v.confirmationRequise).toBe(true);
    if (!v.confirmationRequise) return;
    expect(v.confirmation.resteDu).toBe(840);
  });

  it("lit les montants que la base rend en texte (numeric)", () => {
    const lignes = [{ montant_du: "840.00", montant_couvert: "0.00" }] as unknown as LigneTerme[];
    // reste dû 840 + un terme 840 = 1 680, seuil 3 360
    expect(evaluerEncaissement(3360, lignes).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(3360.01, lignes).confirmationRequise).toBe(true);
  });

  it("sans appel de loyer, le terme est celui du bail ; sans rien à comparer, toute somme se confirme", () => {
    expect(evaluerEncaissement(1680, [], 840).confirmationRequise).toBe(false);
    expect(evaluerEncaissement(1680.01, [], 840).confirmationRequise).toBe(true);
    const sansRepere = evaluerEncaissement(10, [], 0);
    expect(sansRepere.confirmationRequise).toBe(true);
    if (!sansRepere.confirmationRequise) return;
    expect(sansRepere.confirmation.message).toMatch(/aucun loyer/i);
  });

  it("le terme de référence est le plus élevé des termes appelés (un prorata ne l'abaisse pas)", () => {
    const lignes: LigneTerme[] = [
      { montant_du: 400, montant_couvert: 0 },
      { montant_du: 840, montant_couvert: 840 },
      { montant_du: 300, montant_couvert: 300 },
    ];
    const verdict = evaluerEncaissement(2 * (400 + 840) + 0.01, lignes);
    expect(verdict.confirmationRequise).toBe(true);
    if (!verdict.confirmationRequise) return;
    expect(verdict.confirmation.terme).toBe(840);
  });
});

describe("drapeau de confirmation : il vaut pour le montant confirmé, pas pour un autre", () => {
  it("absent, vide ou illisible : pas de confirmation", () => {
    expect(confirmationDonnee(null, 84000)).toBe(false);
    expect(confirmationDonnee("", 84000)).toBe(false);
    expect(confirmationDonnee("oui", 84000)).toBe(false);
    expect(confirmationDonnee("1", 84000)).toBe(false);
    expect(confirmationDonnee("on", 84000)).toBe(false);
  });

  it("porte le montant lu, au centime : seul un montant identique confirme", () => {
    expect(confirmationDonnee("84000.00", 84000)).toBe(true);
    expect(confirmationDonnee("84000", 84000)).toBe(true);
    expect(confirmationDonnee("84000,00", 84000)).toBe(true);
    expect(confirmationDonnee("84000.00", 84000.01)).toBe(false);
    expect(confirmationDonnee("84000.00", 840)).toBe(false);
    expect(confirmationDonnee("840.00", 84000)).toBe(false);
  });
});
