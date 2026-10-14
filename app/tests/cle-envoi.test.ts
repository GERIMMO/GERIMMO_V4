/**
 * D05 (fiche PR178-B-06) : la clé d'envoi d'un encaissement, lue et reconnue en un seul endroit.
 *
 * - `lireCleEnvoi` : le champ caché `cle_envoi` doit être un UUID ; absent ou illisible, l'action refuse AVANT d'écrire
 *   (comme `creation_id` du parc) au lieu d'encaisser sans protection.
 * - `estRejeuCleEnvoi` : l'erreur de la base qui dit « cette clé a déjà servi » (violation d'unicité 23505 sur
 *   l'index `*_cle_envoi_unique`, ou l'erreur levée par `encaisser_depot`), jamais une autre violation d'unicité.
 * - `nouvelleCleEnvoi` : un UUID v4, même sans `crypto.randomUUID` (page servie en http hors localhost).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MESSAGE_CLE_ENVOI_MANQUANTE,
  estRejeuCleEnvoi,
  lireCleEnvoi,
  messageDejaEnregistre,
  nouvelleCleEnvoi,
} from "@/lib/cle-envoi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("lireCleEnvoi", () => {
  it("accepte un UUID, en majuscules comme en minuscules", () => {
    expect(lireCleEnvoi("3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b")).toEqual({ cle: "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b" });
    expect(lireCleEnvoi("3F2B8C1E-5D4A-4E6F-9A7B-1C2D3E4F5A6B")).toEqual({ cle: "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b" });
    expect(lireCleEnvoi(" 3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b ")).toEqual({ cle: "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b" });
  });

  it.each([[null], [""], ["  "], ["abc"], ["3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6"], ["3f2b8c1e5d4a4e6f9a7b1c2d3e4f5a6b"], ["'; drop table x;--"]])(
    "refuse %j avec le message qui dit de recharger la page",
    (brut) => {
      expect(lireCleEnvoi(brut as string | null)).toEqual({ erreur: MESSAGE_CLE_ENVOI_MANQUANTE });
    }
  );

  it("refuse un fichier envoyé à la place du champ", () => {
    expect(lireCleEnvoi(new File(["x"], "x.txt"))).toEqual({ erreur: MESSAGE_CLE_ENVOI_MANQUANTE });
  });

  it("le message dit quoi faire, sans jargon", () => {
    expect(MESSAGE_CLE_ENVOI_MANQUANTE).toMatch(/Rechargez la page/);
    expect(MESSAGE_CLE_ENVOI_MANQUANTE).not.toMatch(/uuid|cle_envoi|clé d'envoi|index/i);
  });
});

describe("estRejeuCleEnvoi", () => {
  it("reconnaît la violation d'unicité de l'index de clé, quel que soit le champ qui la décrit", () => {
    expect(estRejeuCleEnvoi({ code: "23505", message: 'duplicate key value violates unique constraint "encaissements_cle_envoi_unique"' })).toBe(true);
    expect(estRejeuCleEnvoi({ code: "23505", message: "duplicate key", details: "Key (organization_id, cle_envoi)=(a, b) already exists." })).toBe(true);
    expect(estRejeuCleEnvoi({ code: "23505", message: "Cet encaissement est déjà enregistré.", details: "cle_envoi déjà utilisée" })).toBe(true);
  });

  it("ne confond pas avec une autre violation d'unicité, ni avec une autre erreur", () => {
    expect(estRejeuCleEnvoi({ code: "23505", message: 'duplicate key value violates unique constraint "ecritures_une_contre_ecriture_par_origine"' })).toBe(false);
    expect(estRejeuCleEnvoi({ code: "42501", message: "cle_envoi" })).toBe(false);
    expect(estRejeuCleEnvoi({ message: "cle_envoi" })).toBe(false);
    expect(estRejeuCleEnvoi(null)).toBe(false);
    expect(estRejeuCleEnvoi(undefined)).toBe(false);
  });
});

describe("messageDejaEnregistre", () => {
  it("dit « déjà enregistré », le montant et la date, et que rien n'a été doublé", () => {
    const texte = messageDejaEnregistre({ objet: "Cet encaissement", montant: 2, date: "2026-10-14" });
    expect(texte).toContain("Cet encaissement de 2,00 €");
    expect(texte).toContain("14/10/2026");
    expect(texte).toMatch(/déjà enregistré/);
    expect(texte).toMatch(/pas été enregistré une seconde fois/);
  });

  it("accorde « enregistrée » pour une écriture", () => {
    expect(messageDejaEnregistre({ objet: "Cette écriture", feminin: true, montant: 12.5 })).toMatch(/déjà enregistrée/);
  });

  it("dit ce qui diffère quand le montant saisi n'est pas celui qui est enregistré", () => {
    const texte = messageDejaEnregistre({ objet: "Cet encaissement", montant: 2, date: "2026-10-14", montantSaisi: 3 });
    expect(texte).toContain("2,00 €");
    expect(texte).toContain("3,00 €");
    expect(texte).toMatch(/n'a pas été pris en compte/);
  });

  it("sans montant connu, reste clair", () => {
    expect(messageDejaEnregistre({ objet: "Cet encaissement" })).toMatch(/Cet encaissement est déjà enregistré/);
  });
});

describe("nouvelleCleEnvoi", () => {
  it("rend un UUID v4", () => {
    expect(nouvelleCleEnvoi()).toMatch(UUID);
  });

  it("deux appels rendent deux clés différentes", () => {
    expect(nouvelleCleEnvoi()).not.toBe(nouvelleCleEnvoi());
  });

  it("fonctionne sans crypto.randomUUID (page servie hors contexte sécurisé)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => globalThis.crypto && a.fill(7) });
    expect(nouvelleCleEnvoi()).toMatch(UUID);
  });
});
