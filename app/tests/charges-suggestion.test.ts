/**
 * CHARGES DE COPROPRIÉTÉ : LA GRILLE SUGGÈRE, ELLE NE DÉCIDE PLUS — audit palier 1 du 22/11/2026, P0-03 (relevés C1,
 * C2, C4). Sans base.
 *
 * Le défaut : un poste dont l'intitulé contenait un mot de la liste naissait « récupérable » et entrait dans la
 * régularisation sans confirmation ; le mot « eau » était trouvé dans « nouveau », « panneau », « bureau ».
 *
 * Ces tests tiennent :
 *  1. les intitulés relevés par l'audit : plus aucun ne reçoit la suggestion « récupérable » à tort par un morceau de
 *     mot, ni quand il parle de travaux, de création, d'un gardien ou de désinsectisation ;
 *  2. ce que la grille sait encore suggérer (mots entiers, pluriel admis) ;
 *  3. QUELLE QUE SOIT la suggestion, un poste naît « à qualifier » — sauf le fonds travaux ALUR, jamais récupérable ;
 *  4. l'action écrit cette nature de naissance, jamais la suggestion.
 *
 * La liste des charges récupérables est celle d'un décret que je n'ai pas pu ouvrir : ces tests ne disent pas ce qui
 * EST récupérable. Ils disent que le logiciel ne l'affirme plus à la place du gestionnaire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ ecritures: [] as { table: string; ligne: Record<string, unknown> }[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "gerant-test" },
    supabase: { from: (table: string) => ({ insert: async (ligne: Record<string, unknown>) => { banc.ecritures.push({ table, ligne }); return { error: null }; } }) },
  }),
}));

import { ajouterPosteCharge } from "@/app/actions/appels-charges";
import { natureDeNaissance, phraseSuggestion, proposerNature } from "@/lib/charges";

const SANS_SUGGESTION = { nature: "a_qualifier", fonds_alur: false };

describe("grille de suggestion des charges", () => {
  it.each([
    // C2 : « eau » était trouvé à l'intérieur des mots.
    "Nouveau tableau électrique", "Panneau d'affichage hall", "Bureau d'études structure", "Rideau métallique du parking", "Bateau de trottoir", "Réseau câblé",
    // C1 : travaux, création, modernisation… ne sont plus suggérés « récupérable » parce qu'ils nomment un équipement.
    "Travaux ascenseur", "Modernisation ascenseur", "Installation interphone", "Réfection parties communes", "Rénovation parties communes",
    "Peinture parties communes", "Création jardin", "Abattage arbres jardin", "Réparation chaudière chauffage collectif",
    // C3 : la part d'un gardien n'est pas tout ou rien.
    "Gardien", "Gardienne", "Concierge", "Salaire gardien nettoyage", "Employé d'immeuble — ménage",
    // C4 : en attente du texte officiel.
    "Désinsectisation (prestation)", "Désinsectisation des parties communes",
    // Un mot proche d'un mot de la liste n'est pas ce mot.
    "Syndicat des copropriétaires", "Divers",
  ])("« %s » : aucune suggestion", (libelle) => {
    expect(proposerNature(libelle)).toEqual(SANS_SUGGESTION);
    expect(phraseSuggestion(libelle)).toBeNull();
  });

  it.each([
    "Ascenseur — entretien", "Ascenseurs", "Eau froide", "Eau chaude sanitaire", "Consommation d'eau", "Eaux usées", "Compteurs divisionnaires",
    "Chauffage collectif", "Ménage des parties communes", "Nettoyage", "Entretien des espaces verts", "Jardin", "Ordures ménagères",
    "Minuterie", "Électricité des communs", "Interphone", "VMC", "Taxe de balayage",
  ])("« %s » : suggestion « récupérable », à confirmer", (libelle) => {
    expect(proposerNature(libelle)).toEqual({ nature: "recuperable", fonds_alur: false });
    expect(phraseSuggestion(libelle)).toBe("Suggestion : récupérable — à confirmer");
  });

  it.each([
    "Honoraires du syndic", "Syndic", "Assurance immeuble", "Assurances", "Ravalement façade", "Toiture", "Gros travaux toiture",
    "Remplacement de la chaudière", "Procédure contentieuse", "Frais de gestion", "Diagnostic amiante", "Mise aux normes ascenseur",
  ])("« %s » : suggestion « non récupérable », à confirmer", (libelle) => {
    expect(proposerNature(libelle)).toEqual({ nature: "non_recuperable", fonds_alur: false });
    expect(phraseSuggestion(libelle)).toBe("Suggestion : non récupérable — à confirmer");
  });

  it.each(["Fonds travaux ALUR", "Fonds de travaux", "Provision pour travaux", "Cotisation ALUR", "Provision travaux ascenseur"])("« %s » : fonds travaux, jamais récupérable", (libelle) => {
    expect(proposerNature(libelle)).toEqual({ nature: "non_recuperable", fonds_alur: true });
  });

  it("la casse, les accents et la ponctuation ne changent rien", () => {
    for (const libelle of ["EAU FROIDE", "eau-froide", "Eau, froide", "  eau   froide  "]) expect(proposerNature(libelle).nature, libelle).toBe("recuperable");
    expect(proposerNature("ÉLECTRICITÉ DES COMMUNS").nature).toBe("recuperable");
    expect(proposerNature("")).toEqual(SANS_SUGGESTION);
  });
});

describe("un poste naît « à qualifier », quelle que soit la suggestion", () => {
  it.each(["Ascenseur — entretien", "Eau froide", "Honoraires du syndic", "Travaux ascenseur", "Gardien", "Divers", "Contrat ascenseur complet"])("« %s »", (libelle) => {
    expect(natureDeNaissance(libelle)).toEqual({ nature: "a_qualifier", fonds_alur: false });
  });

  it("seul le fonds travaux ALUR garde sa nature dès la saisie : non récupérable", () => {
    expect(natureDeNaissance("Fonds travaux ALUR")).toEqual({ nature: "non_recuperable", fonds_alur: true });
    expect(natureDeNaissance("Provision pour travaux")).toEqual({ nature: "non_recuperable", fonds_alur: true });
  });
});

describe("l'action d'ajout d'un poste écrit la nature de naissance, jamais la suggestion", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const saisie = (libelle: string, montant = "120,50") => { const f = new FormData(); f.set("libelle", libelle); f.set("montant", montant); return f; };
  beforeEach(() => { banc.ecritures = []; });

  it.each(["Ascenseur — entretien", "Eau froide", "Honoraires du syndic", "Travaux ascenseur", "Poste sans mot connu"])("« %s » : écrit « à qualifier », marqué proposé", async (libelle) => {
    expect(await ajouterPosteCharge(ORG, "bien", "lot", "appel", {}, saisie(libelle))).toEqual({ succes: "Poste ajouté." });
    expect(banc.ecritures).toEqual([{ table: "appel_charges_postes", ligne: { organization_id: ORG, appel_id: "appel", libelle, montant: 120.5, nature: "a_qualifier", fonds_alur: false, propose: true } }]);
  });

  it("le fonds travaux ALUR est écrit non récupérable", async () => {
    await ajouterPosteCharge(ORG, "bien", "lot", "appel", {}, saisie("Fonds travaux ALUR", "300"));
    expect(banc.ecritures[0].ligne).toMatchObject({ nature: "non_recuperable", fonds_alur: true, propose: true });
  });

  it("aucun poste n'est écrit « récupérable » par l'ajout, quel que soit l'intitulé", async () => {
    for (const libelle of ["Ascenseur", "Eau", "Chauffage", "Ménage", "Jardin", "Interphone", "VMC", "Nettoyage des parties communes"]) await ajouterPosteCharge(ORG, "bien", "lot", "appel", {}, saisie(libelle));
    expect(banc.ecritures).toHaveLength(8);
    expect(banc.ecritures.filter((e) => e.ligne.nature === "recuperable")).toEqual([]);
  });
});
