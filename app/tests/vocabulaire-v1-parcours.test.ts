/**
 * Relevés du designer du 13/10/2026 (DES-A-02, DES-A-07, DES-B-09) : le vocabulaire d'agence (« les agences »,
 * « l'administrateur de l'agence », « toute l'agence », « toutes les agences ») était encore visible dans les
 * parcours du propriétaire, du locataire et de l'artisan de la V1. Les agences ne sont plus présentées au public :
 * seules les phrases visibles de ces parcours changent, jamais l'espace des gérants d'agence ni le code d'agence.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nomAssignation } from "../src/app/agence/[orgId]/alertes/modale-alerte";
import { COLONNES, gabaritCsv, lireCsv } from "../src/lib/reprise-soldes";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

describe("alerte confiée à tous : « toute l’équipe », pas « toute l’agence » (DES-A-07)", () => {
  it("dit « toute l’équipe »", () => {
    expect(nomAssignation({ assigned_all: true, assignee_account_id: null }, [])).toBe("toute l’équipe");
  });
  it("nomme toujours la personne à qui l'alerte est confiée", () => {
    const membres = [{ account_id: "a1", email: "claire@exemple.fr" }] as Parameters<typeof nomAssignation>[1];
    expect(nomAssignation({ assigned_all: false, assignee_account_id: "a1" }, membres)).toBe("claire@exemple.fr");
    expect(nomAssignation({ assigned_all: false, assignee_account_id: "inconnu" }, membres)).toBe("—");
  });
});

describe("reprise comptable : la colonne « détenteur » ne parle plus d'« agence ou proprietaire » (DES-A-07)", () => {
  const colonne = COLONNES.find(([cle]) => cle === "detenteur")!;
  it("le libellé dit ce qu'il faut taper, en mots du propriétaire", () => {
    expect(colonne[1]).toBe("Détenteur du dépôt (agence = votre gestionnaire / proprietaire = vous)");
    expect(colonne[1]).not.toMatch(/agence ou proprietaire/);
  });
  it("les valeurs acceptées par la base ne changent pas : « agence » et « proprietaire »", () => {
    const lecture = lireCsv("type;montant;detenteur\ndepot_garantie;700;proprietaire\ndepot_garantie;800;agence\n");
    if ("erreur" in lecture) throw new Error(lecture.erreur);
    expect(lecture.lignes.map((l) => l.detenteur)).toEqual(["proprietaire", "agence"]);
  });
  it("un gabarit téléchargé avant le changement se relit toujours", () => {
    const ancien = "Type (depot_garantie / solde_locataire / provision_charges / fonds_mandant);Montant (€);Détenteur du dépôt (agence ou proprietaire)\ndepot_garantie;700;agence\n";
    const lecture = lireCsv(ancien);
    if ("erreur" in lecture) throw new Error(lecture.erreur);
    expect(lecture.inconnues).toEqual([]);
    expect(lecture.lignes[0].detenteur).toBe("agence");
  });
  it("le nouveau gabarit se relit lui-même", () => {
    const lecture = lireCsv(gabaritCsv());
    if ("erreur" in lecture) throw new Error(lecture.erreur);
    expect(lecture.inconnues).toEqual([]);
    expect(lecture.manquantes).toEqual([]);
  });
});

describe("phrases visibles des parcours propriétaire, locataire et artisan", () => {
  it("DES-A-02 : la page de confirmation d'adresse ne s'adresse plus « aux agences »", () => {
    const source = lire("src/app/auth/confirmer/page.tsx");
    expect(source).not.toMatch(/pour les agences/);
    expect(source).toContain("pour les propriétaires bailleurs, leurs locataires et les artisans.");
  });

  it("DES-A-02 : même phrase de promesse que sur /connexion", () => {
    const phrase = "Baux, quittances, régularisations, rapports de gestion et interventions — pour les propriétaires bailleurs, leurs locataires et les artisans.";
    expect(lire("src/app/auth/confirmer/page.tsx")).toContain(phrase);
    expect(lire("src/app/connexion/page.tsx")).toContain(phrase);
  });

  it("DES-A-07 : le formulaire d'aide ne cite plus « l'administrateur de l'agence concernée »", () => {
    const source = lire("src/app/assistance/formulaire-retour.tsx");
    expect(source).not.toMatch(/administrateur de l.agence/);
    expect(source).not.toMatch(/jamais par l.agence/);
    expect(source).toContain("de l’équipe Gerimmo et, le cas échéant, du gestionnaire concerné.");
    expect(source).toContain("jamais par le gestionnaire qui a évalué votre travail.");
  });

  it("DES-B-09 : la page Compte de l'artisan parle de « clients », pas de « toutes les agences »", () => {
    const source = lire("src/app/compte/page.tsx");
    expect(source).not.toMatch(/toutes les agences/);
    expect(source).toContain("elle identifie votre compte auprès de tous vos clients. Pour la modifier, écrivez-nous depuis Aide et retours.");
  });
});
