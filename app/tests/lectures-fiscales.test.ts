/**
 * Décisions X12 et X21 du 14/10/2026 : les outils communs à l'écran « Récapitulatif fiscal » et au document « Récapitulatif
 * annuel · location nue » pour ne jamais afficher un montant calculé sur une lecture peut-être tronquée (plafond de 1 000 lignes).
 */
import { describe, expect, it, vi } from "vitest";
import {
  LIMITE_LIGNES_API,
  TAILLE_PAQUET_IDENTIFIANTS,
  identifiantsDesEcritures,
  lectureTronquee,
  lireParIdentifiants,
  messageDocumentLectureTronquee,
  messageEcranLectureTronquee,
  phraseLimiteAtteinte,
} from "../src/lib/lectures-fiscales";

const lignes = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

describe("lectureTronquee : une lecture qui rend autant de lignes que le plafond est peut-être coupée", () => {
  it("999 lignes : complète ; 1 000 et plus : peut-être coupée", () => {
    expect(LIMITE_LIGNES_API).toBe(1000);
    expect(lectureTronquee(lignes(999))).toBe(false);
    expect(lectureTronquee(lignes(1000))).toBe(true);
    expect(lectureTronquee(lignes(1500))).toBe(true);
  });
  it("une lecture sans ligne ou absente n'est pas tronquée", () => {
    expect(lectureTronquee([])).toBe(false);
    expect(lectureTronquee(null)).toBe(false);
    expect(lectureTronquee(undefined)).toBe(false);
  });
});

describe("identifiantsDesEcritures : les pièces dont on lit la qualification et la capture", () => {
  it("les écritures et les pièces d'origine de leurs contre-écritures, sans doublon ni vide", () => {
    expect(identifiantsDesEcritures([
      { id: "a" }, { id: "b", contre_ecriture_de: "origine" }, { id: "c", contre_ecriture_de: "origine" },
      { id: "a" }, { id: null, contre_ecriture_de: null }, {},
    ])).toEqual(["a", "b", "origine", "c"]);
  });
  it("rien à lire sans écriture", () => {
    expect(identifiantsDesEcritures([])).toEqual([]);
  });
});

describe("lireParIdentifiants : des lectures par paquets, jamais d'identifiants en trop dans une adresse", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

  it("aucun identifiant : aucune requête, aucune ligne", async () => {
    const lire = vi.fn();
    expect(await lireParIdentifiants([], lire)).toEqual({ data: [], error: null, tronquee: false });
    expect(lire).not.toHaveBeenCalled();
  });

  it("250 identifiants : trois requêtes de 100, 100 et 50 identifiants, lignes réunies dans l'ordre", async () => {
    expect(TAILLE_PAQUET_IDENTIFIANTS).toBe(100);
    const lire = vi.fn(async (paquet: string[]) => ({ data: paquet.map((id) => ({ id })), error: null }));
    const r = await lireParIdentifiants(ids(250), lire);
    expect(lire.mock.calls.map(([p]) => p.length)).toEqual([100, 100, 50]);
    expect(r.error).toBeNull();
    expect(r.tronquee).toBe(false);
    expect(r.data!.map((x) => x.id)).toEqual(ids(250));
  });

  it("un paquet qui atteint le plafond rend la lecture « tronquée », même si les autres sont complets", async () => {
    const lire = async (paquet: string[]) => ({ data: paquet[0] === "id100" ? lignes(1000) : [{ i: 0 }], error: null });
    const r = await lireParIdentifiants(ids(250), lire);
    expect(r.tronquee).toBe(true);
    expect(r.error).toBeNull();
  });

  it("la première erreur est rendue, sans ligne : une panne n'est pas prise pour un plafond", async () => {
    const lire = async (paquet: string[]) =>
      paquet[0] === "id100" ? { data: null, error: { message: "panne" } } : { data: lignes(1000), error: null };
    const r = await lireParIdentifiants(ids(250), lire);
    expect(r).toEqual({ data: null, error: { message: "panne" }, tronquee: false });
  });
});

describe("les phrases : exactes, au singulier comme au pluriel, sans renvoyer à une période", () => {
  it("une lecture", () => {
    expect(phraseLimiteAtteinte(["des qualifications fiscales"])).toBe(
      "la lecture des qualifications fiscales a atteint la limite de 1 000 lignes et peut être incomplète",
    );
  });
  it("deux, puis trois lectures", () => {
    expect(phraseLimiteAtteinte(["des écritures de 2026", "des lots"])).toBe(
      "les lectures des écritures de 2026 et des lots ont atteint la limite de 1 000 lignes et peuvent être incomplètes",
    );
    expect(phraseLimiteAtteinte(["des écritures de 2026", "des lots", "des exercices confirmés"])).toBe(
      "les lectures des écritures de 2026, des lots et des exercices confirmés ont atteint la limite de 1 000 lignes et peuvent être incomplètes",
    );
  });
  it("une lecture nommée deux fois ne l'est qu'une fois", () => {
    expect(phraseLimiteAtteinte(["des lots", "des lots"])).toBe(phraseLimiteAtteinte(["des lots"]));
  });
  it("l'écran dit qu'aucun montant n'est affiché, que ce n'est pas une année vide, et où le signaler", () => {
    expect(messageEcranLectureTronquee(["des écritures de 2026"])).toEqual({
      titre: "Aucun montant n’est affiché : la lecture des écritures de 2026 a atteint la limite de 1 000 lignes et peut être incomplète.",
      explication:
        "Ce n’est pas une année sans recettes ni charges : un récapitulatif calculé sur une lecture incomplète donnerait des montants faux, " +
        "à recopier sur une déclaration. Cette limite ne se règle pas depuis cet écran : signalez-le depuis Aide et retours.",
    });
  });
  it("le document dit pourquoi il ne s'imprime pas, sans parler de période à réduire", () => {
    const message = messageDocumentLectureTronquee(2026, ["des qualifications fiscales"]);
    expect(message).toBe(
      "Le récapitulatif 2026 de ce lot ne peut pas être produit : la lecture des qualifications fiscales a atteint la limite de 1 000 lignes et peut être incomplète. " +
        "Aucun montant n’est imprimé, pour ne pas faire recopier un chiffre faux sur une déclaration. " +
        "Cette limite ne se règle pas dans ce document : signalez-le depuis Aide et retours.",
    );
    expect(message).not.toMatch(/période|Réduisez/i);
  });
});
