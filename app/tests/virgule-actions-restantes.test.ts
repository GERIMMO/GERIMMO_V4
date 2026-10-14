/**
 * D04 (1), fiche VER-TS-02, décision du dirigeant du 14/10/2026 : TOUTES les actions serveur qui lisaient encore un
 * montant ou un nombre décimal par `Number()` lisent maintenant le texte tel que tapé (`lireMontant`,
 * `lireMontantFacultatif`, `lireMontantSigne`, `lireDecimal`, `lireDecimalFacultatif`) — et leurs champs sont du texte à
 * clavier décimal, pas un champ numérique du navigateur, qui lit « 840,00 » comme 84000 quand sa langue n'est pas le
 * français.
 *
 * Ce fichier complète `montants-actions-lecture.test.ts` (VFL-07) pour les champs qui restaient : surfaces, quotes-parts,
 * taux, relevés de compteur, durées de vie, prix de vente, seuils, budgets, trésorerie, plafonds de catalogue… Un cas
 * par action et par forme de saisie : « 7,5 », « 7.5 » et « 7.50 » valent la même chose ; « abc », un négatif et le format
 * à milliers sont refusés AVANT toute écriture, en disant quoi écrire ; le vide et le zéro suivent la règle de chaque
 * champ. Le test de garde `lecture-saisies-sans-number.test.ts` interdit d'en ajouter de nouveaux.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => {
  type Ecriture = { table: string; op: "insert" | "update"; valeur: Record<string, unknown> | Record<string, unknown>[] };
  type Rpc = { nom: string; args: Record<string, unknown> };
  const etat = {
    ecritures: [] as Ecriture[],
    rpcs: [] as Rpc[],
    lectures: {} as Record<string, unknown>,
    listes: {} as Record<string, unknown[]>,
    reponsesRpc: {} as Record<string, unknown>,
  };

  function requete(table: string) {
    let ecriture = false;
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "eq", "is", "in", "order", "limit", "ilike", "neq", "gte", "lt"]) q[methode] = () => q;
    const ecrire = (op: Ecriture["op"]) => (valeur: Ecriture["valeur"]) => {
      ecriture = true;
      etat.ecritures.push({ table, op, valeur });
      return q;
    };
    q.insert = ecrire("insert");
    q.update = ecrire("update");
    q.single = async () => ({ data: { id: "nouveau" }, error: null });
    q.maybeSingle = async () => ({ data: ecriture ? { id: "ligne" } : (etat.lectures[table] ?? null), error: null });
    q.then = (suite: (v: unknown) => unknown) =>
      suite({ data: ecriture ? [{ id: "ligne" }] : (etat.listes[table] ?? []), error: null });
    return q;
  }
  const supabase = {
    from: requete,
    rpc: async (nom: string, args: Record<string, unknown>) => {
      etat.rpcs.push({ nom, args });
      return { data: etat.reponsesRpc[nom] ?? 0, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: "gerant-test" } } }) },
  };
  return { etat, supabase };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://recette.test" }) }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/ged-depot", () => ({
  deposerFichierGed: vi.fn(),
  abandonnerPieceGed: vi.fn(),
  preparerFichierGed: async () => ({
    fichier: { chemin: "org-test/justificatif.pdf", mime: "application/pdf", taille: 3, empreinte: "empreinte" },
  }),
}));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant-test" }, role: "proprietaire_direct", supabase: banc.supabase }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => banc.supabase }));

import { ajouterLigneMandat } from "@/app/actions/mandats";
import { ajouterBailPersonne, enregistrerConge } from "@/app/actions/baux";
import { modifierProfilOrganisation } from "@/app/actions/organisation";
import { ajouterEcriture } from "@/app/actions/compta";
import { enregistrerEtude } from "@/app/actions/etudes-territoriales";
import { enregistrerReglagesMarketing } from "@/app/admin/marketing/actions";
import { reprendreSoldes } from "@/app/actions/reprise-comptable";
import { enregistrerExerciceFiscal } from "@/app/actions/fiscalite";
import { enregistrerChambre } from "@/app/actions/chambres";
import { creerBien, decouperBien, modifierLot, ajouterDetention, validerCle } from "@/app/actions/parc";
import { ajouterCompteur, enregistrerAnnexesEdl } from "@/app/actions/edl";
import { ajouterRetenue } from "@/app/actions/restitution";
import { lireEtapeBail } from "@/lib/champs-etape-bail";
import { lireMentionsContrat } from "@/lib/mentions-contrat";

const ORG = "org-test";

beforeEach(() => {
  banc.etat.ecritures.length = 0;
  banc.etat.rpcs.length = 0;
  banc.etat.lectures = {};
  banc.etat.listes = {};
  // La base répond « bien créé » : l'action va jusqu'à sa confirmation (drapeau `confirmation_creation`).
  banc.etat.reponsesRpc = { creer_bien_complet: { bien_id: "bien-1", lot_unique_id: null, saisie_differente: false } };
});

const FORMAT_MONTANT = /montant invalide : écrivez 1234,50, sans espace ni point de milliers/i;
const FORMAT_DECIMAL = /valeur invalide : écrivez 145,17, sans espace/i;

function formulaire(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  return f;
}

type Resultat = { erreur?: string; succes?: string };
type Observation = { resultat: Resultat; lu: unknown; ecrit: boolean };

type Cas = {
  action: string;
  champ: string;
  jouer: (saisie: string) => Promise<Observation>;
  /** Ce que valent les trois formes (virgule, point, point avec zéro final). */
  attendu: number;
  formes: [string, string, string];
  /** Le vide : refusé (avec ce message) ou accepté comme « non renseigné ». */
  vide: { erreur: RegExp } | { lu: unknown };
  /** Le zéro : refusé, ou accepté tel quel. */
  zero: "refuse" | "accepte";
  format?: RegExp;
  /** Saisies en plus à refuser (hors format) : bornes propres au champ. */
  bornes?: string[];
  /** Les saisies illisibles à refuser, quand la liste habituelle ne convient pas (un champ qui admet un négatif). */
  refus?: string[];
};

function ecritureDe(table: string): Record<string, unknown> | undefined {
  const e = banc.etat.ecritures.find((x) => x.table === table)?.valeur;
  return Array.isArray(e) ? e[0] : e;
}
function rpcDe(nom: string): Record<string, unknown> | undefined {
  return banc.etat.rpcs.find((r) => r.nom === nom)?.args;
}
const observer = (resultat: Resultat, lu: unknown, ecrit: boolean): Observation => ({ resultat, lu, ecrit });

// ───────────────────────── Immobilier : surfaces, quotes-parts, taux ─────────────────────────

const BIEN = {
  nom: "Résidence test", type: "immeuble", address_line1: "1 rue de Test", postal_code: "75001", city: "Paris",
  annee_construction: "1990", parties_communes: "Néant", acces_tic: "Néant", pieces: "3",
  creation_id: "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b",
};

const LOT_MODIFIE = {
  nom: "Lot 1", identifiant_fiscal: "1234567890123", description: "Appartement", chauffage: "Collectif", eau_chaude: "Collective",
  locaux_privatifs: "Cave", surface_m2: "40", pieces: "2",
};

const PERIODES_FISCALES = JSON.stringify([{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }]);

const CAS: Cas[] = [
  {
    action: "ajouterLigneMandat",
    champ: "taux_honoraires",
    jouer: async (saisie) => {
      banc.etat.lectures.mandats = { etat: "brouillon" };
      const resultat = await ajouterLigneMandat(ORG, "personne-test", "mandat-test", {}, formulaire({ lot_id: "lot-test", taux_honoraires: saisie }));
      const ecrit = ecritureDe("mandat_lignes");
      return observer(resultat, ecrit?.taux_honoraires, Boolean(ecrit));
    },
    attendu: 7.5,
    formes: ["7,5", "7.5", "7.50"],
    vide: { erreur: /indiquez le taux d'honoraires/i },
    zero: "accepte",
    format: FORMAT_DECIMAL,
    bornes: ["100,5", "101", "750"],
  },
  {
    action: "ajouterBailPersonne",
    champ: "quote_part",
    jouer: async (saisie) => {
      banc.etat.lectures.baux = { etat: "brouillon" };
      const resultat = await ajouterBailPersonne(ORG, "bail-test", {}, formulaire({ person_id: "p1", role: "colocataire", quote_part: saisie }));
      const ecrit = ecritureDe("bail_personnes");
      return observer(resultat, ecrit?.quote_part, Boolean(ecrit));
    },
    attendu: 33.5,
    formes: ["33,5", "33.5", "33.50"],
    vide: { lu: null },
    zero: "refuse",
    format: FORMAT_DECIMAL,
    bornes: ["100,5", "101", "3350"],
  },
  {
    action: "ajouterBailPersonne",
    champ: "surface_privative",
    jouer: async (saisie) => {
      banc.etat.lectures.baux = { etat: "brouillon" };
      const resultat = await ajouterBailPersonne(ORG, "bail-test", {}, formulaire({ person_id: "p1", role: "colocataire", surface_privative: saisie }));
      const ecrit = ecritureDe("bail_personnes");
      return observer(resultat, ecrit?.surface_privative, Boolean(ecrit));
    },
    attendu: 12.5,
    formes: ["12,5", "12.5", "12.50"],
    vide: { lu: null },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "enregistrerChambre",
    champ: "surface_m2",
    jouer: async (saisie) => {
      const resultat = await enregistrerChambre(ORG, "lot-test", "bien-test", {}, formulaire({
        nom: "Chambre 1", description: "Chambre", espaces_partages: "Cuisine", surface_m2: saisie, volume_m3: "30",
      }));
      const ecrit = ecritureDe("lot_chambres");
      return observer(resultat, ecrit?.surface_m2, Boolean(ecrit));
    },
    attendu: 12.5,
    formes: ["12,5", "12.5", "12.50"],
    vide: { erreur: /au moins 9 m² ET 20 m³/ },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "enregistrerChambre",
    champ: "volume_m3",
    jouer: async (saisie) => {
      const resultat = await enregistrerChambre(ORG, "lot-test", "bien-test", {}, formulaire({
        nom: "Chambre 1", description: "Chambre", espaces_partages: "Cuisine", surface_m2: "12", volume_m3: saisie,
      }));
      const ecrit = ecritureDe("lot_chambres");
      return observer(resultat, ecrit?.volume_m3, Boolean(ecrit));
    },
    attendu: 30.5,
    formes: ["30,5", "30.5", "30.50"],
    vide: { erreur: /au moins 9 m² ET 20 m³/ },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "creerBien",
    champ: "surface_m2 (lot unique)",
    jouer: async (saisie) => {
      const resultat = await creerBien(ORG, {}, formulaire({ ...BIEN, type: "appartement", surface_m2: saisie, confirmation_creation: "1" }));
      const args = rpcDe("creer_bien_complet");
      const lots = (args?.p_saisie as { lots?: { surface_m2: number }[] } | undefined)?.lots;
      return observer(resultat, lots?.[0]?.surface_m2, Boolean(args));
    },
    attendu: 45.5,
    formes: ["45,5", "45.5", "45.50"],
    vide: { erreur: /surface habitable et le nombre de pièces sont obligatoires/ },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "creerBien",
    champ: "lots[].surface (bien divisé)",
    jouer: async (saisie) => {
      const lots = JSON.stringify([{ nom: "Lot A", surface: saisie, pieces: "2" }, { nom: "Lot B", surface: "30", pieces: "1" }]);
      const resultat = await creerBien(ORG, {}, formulaire({ ...BIEN, lots, confirmation_creation: "1" }));
      const args = rpcDe("creer_bien_complet");
      const lus = (args?.p_saisie as { lots?: { surface_m2: number }[] } | undefined)?.lots;
      return observer(resultat, lus?.[0]?.surface_m2, Boolean(args));
    },
    attendu: 45.5,
    formes: ["45,5", "45.5", "45.50"],
    vide: { erreur: /surface habitable et le nombre de pièces sont obligatoires pour chaque lot/ },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "modifierLot",
    champ: "surface_m2",
    jouer: async (saisie) => {
      const resultat = await modifierLot(ORG, "bien-test", "lot-test", {}, formulaire({ ...LOT_MODIFIE, surface_m2: saisie }));
      const ecrit = ecritureDe("lots");
      return observer(resultat, ecrit?.surface_m2, Boolean(ecrit));
    },
    attendu: 45.5,
    formes: ["45,5", "45.5", "45.50"],
    vide: { erreur: /surface habitable et le nombre de pièces sont obligatoires/ },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "modifierLot",
    champ: "surface_carrez",
    jouer: async (saisie) => {
      const resultat = await modifierLot(ORG, "bien-test", "lot-test", {}, formulaire({ ...LOT_MODIFIE, surface_carrez: saisie }));
      const ecrit = ecritureDe("lots");
      return observer(resultat, ecrit?.surface_carrez, Boolean(ecrit));
    },
    attendu: 44.5,
    formes: ["44,5", "44.5", "44.50"],
    vide: { lu: null },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "modifierLot",
    champ: "tantieme",
    jouer: async (saisie) => {
      const resultat = await modifierLot(ORG, "bien-test", "lot-test", {}, formulaire({ ...LOT_MODIFIE, tantieme: saisie }));
      const ecrit = ecritureDe("lots");
      return observer(resultat, ecrit?.tantieme, Boolean(ecrit));
    },
    attendu: 125.5,
    formes: ["125,5", "125.5", "125.50"],
    vide: { lu: null },
    zero: "accepte",
    format: FORMAT_DECIMAL,
  },
  {
    action: "ajouterDetention",
    champ: "quote_part",
    jouer: async (saisie) => {
      const resultat = await ajouterDetention(ORG, "bien-test", "lot-test", {}, formulaire({ person_id: "p1", quote_part: saisie }));
      const ecrit = ecritureDe("detentions");
      return observer(resultat, ecrit?.quote_part, Boolean(ecrit));
    },
    attendu: 33.5,
    formes: ["33,5", "33.5", "33.50"],
    vide: { erreur: /quote-part doit être comprise entre 0 et 100/ },
    zero: "refuse",
    format: FORMAT_DECIMAL,
    bornes: ["100,5", "101", "3350"],
  },
  {
    action: "validerCle",
    champ: "ligne_pourcentage",
    jouer: async (saisie) => {
      const f = new FormData();
      f.set("mode", "surface");
      f.append("ligne_lot_id", "lot-a");
      f.append("ligne_pourcentage", saisie);
      f.append("ligne_lot_id", "lot-b");
      f.append("ligne_pourcentage", "50");
      const resultat = await validerCle(ORG, "bien-test", {}, f);
      const args = rpcDe("valider_cle_repartition");
      return observer(resultat, (args?.p_lignes as { pourcentage: number }[] | undefined)?.[0]?.pourcentage, Boolean(args));
    },
    attendu: 33.5,
    formes: ["33,5", "33.5", "33.50"],
    vide: { erreur: FORMAT_DECIMAL },
    zero: "accepte",
    format: FORMAT_DECIMAL,
  },
  {
    action: "decouperBien",
    champ: "lot_surface",
    jouer: async (saisie) => {
      banc.etat.lectures.biens = { type: "immeuble" };
      const f = new FormData();
      f.append("lot_nom", "Lot A");
      f.append("lot_surface", saisie);
      const resultat = await decouperBien(ORG, "bien-test", {}, f);
      const args = rpcDe("decouper_bien");
      return observer(resultat, (args?.p_lots as { surface_m2: unknown }[] | undefined)?.[0]?.surface_m2, Boolean(args));
    },
    attendu: 45.5,
    formes: ["45,5", "45.5", "45.50"],
    // Facultative : un lot sans surface part avec une surface vide, que la base lit « non renseignée ».
    vide: { lu: "" },
    zero: "refuse",
    format: FORMAT_DECIMAL,
  },
  {
    action: "enregistrerAnnexesEdl",
    champ: "releve (compteur)",
    jouer: async (saisie) => {
      banc.etat.listes.edl_compteurs = [{ id: "c1" }];
      const resultat = await enregistrerAnnexesEdl(ORG, "bail-test", "edl-test", {}, formulaire({ releve_c1: saisie }));
      const args = rpcDe("enregistrer_annexes_edl");
      return observer(resultat, (args?.p_compteurs as { releve: unknown }[] | undefined)?.[0]?.releve, Boolean(args));
    },
    attendu: 1234.5,
    formes: ["1234,5", "1234.5", "1234.50"],
    vide: { lu: null },
    zero: "accepte",
    // Le message existant de l'écran est gardé : « Relevé de compteur invalide. »
    format: /relevé de compteur invalide/i,
  },
  {
    action: "ajouterCompteur",
    champ: "releve",
    jouer: async (saisie) => {
      const resultat = await ajouterCompteur(ORG, "bail-test", "edl-test", {}, formulaire({ type: "eau", releve: saisie }));
      const ecrit = ecritureDe("edl_compteurs");
      return observer(resultat, ecrit?.releve, Boolean(ecrit));
    },
    attendu: 1234.5,
    formes: ["1234,5", "1234.5", "1234.50"],
    vide: { lu: null },
    zero: "accepte",
    format: /relevé de compteur invalide/i,
  },
  {
    action: "ajouterRetenue",
    champ: "duree_vie",
    jouer: async (saisie) => {
      const resultat = await ajouterRetenue(ORG, "bail-test", "restitution-test", {}, formulaire({ libelle: "Peinture", cout: "100", duree_vie: saisie }));
      const args = rpcDe("ajouter_retenue");
      return observer(resultat, args?.p_duree_vie, Boolean(args));
    },
    attendu: 7.5,
    formes: ["7,5", "7.5", "7.50"],
    vide: { lu: null },
    zero: "accepte",
    format: FORMAT_DECIMAL,
  },
  {
    action: "ajouterRetenue",
    champ: "age",
    jouer: async (saisie) => {
      const resultat = await ajouterRetenue(ORG, "bail-test", "restitution-test", {}, formulaire({ libelle: "Peinture", cout: "100", age: saisie }));
      const args = rpcDe("ajouter_retenue");
      return observer(resultat, args?.p_age, Boolean(args));
    },
    attendu: 7.5,
    formes: ["7,5", "7.5", "7.50"],
    vide: { lu: null },
    zero: "accepte",
    format: FORMAT_DECIMAL,
  },

  // ───────── Montants restés en Number() : prix de vente, seuils, TEOM, dépenses, budgets, trésorerie ─────────
  {
    action: "enregistrerConge",
    champ: "prix_vente",
    jouer: async (saisie) => {
      const resultat = await enregistrerConge(ORG, "bail-test", {}, formulaire({ par: "bailleur", date_presentation: "2026-10-01", prix_vente: saisie }));
      const args = rpcDe("enregistrer_conge");
      return observer(resultat, args?.p_prix_vente, Boolean(args));
    },
    attendu: 840,
    formes: ["840,00", "840.00", "840"],
    vide: { lu: null },
    zero: "refuse",
    format: FORMAT_MONTANT,
  },
  {
    action: "modifierProfilOrganisation",
    champ: "relance_seuil_montant",
    jouer: async (saisie) => {
      const resultat = await modifierProfilOrganisation(ORG, {}, formulaire({
        name: "Mon parc", address_line1: "1 rue de Test", postal_code: "75001", city: "Paris", email_contact: "contact@exemple.fr",
        relance_seuil_montant: saisie,
      }));
      const ecrit = ecritureDe("organizations");
      return observer(resultat, ecrit?.relance_seuil_montant, Boolean(ecrit));
    },
    attendu: 840,
    formes: ["840,00", "840.00", "840"],
    // Vide : le seuil par défaut, 5 € (comme avant).
    vide: { lu: 5 },
    zero: "accepte",
    format: FORMAT_MONTANT,
    bornes: ["1000,01", "84000"],
  },
  {
    action: "ajouterEcriture",
    champ: "teom",
    jouer: async (saisie) => {
      const resultat = await ajouterEcriture(ORG, {}, formulaire({
        categorie: "Taxe foncière", sens: "depense", montant: "1124", teom: saisie, cle_envoi: "6f1f0c1e-6c1a-4f3e-9d57-2b1d3c4e5f60",
      }));
      const lignes = banc.etat.ecritures.find((e) => e.table === "ecritures")?.valeur;
      const teom = Array.isArray(lignes) ? lignes.find((l) => l.categorie === "TEOM") : undefined;
      return observer(resultat, teom?.montant ?? 0, Boolean(lignes));
    },
    attendu: 168,
    formes: ["168,00", "168.00", "168"],
    // Vide : pas de part de TEOM, une seule ligne (comme avant).
    vide: { lu: 0 },
    zero: "accepte",
    format: FORMAT_MONTANT,
  },
  {
    action: "enregistrerEtude",
    champ: "depense (en centimes)",
    jouer: async (saisie) => {
      banc.etat.reponsesRpc.is_permanent_super_admin = true;
      const resultat = await enregistrerEtude({}, formulaire({
        departement: "75", indicateur: "acquisition", nombre: "3", depense: saisie, debut: "2026-01-01", fin: "2026-06-30", source: "Étude", methode: "Relevé",
      }));
      const args = rpcDe("enregistrer_etude_territoriale");
      return observer(resultat, args?.p_depense_cents, Boolean(args));
    },
    attendu: 84000,
    formes: ["840,00", "840.00", "840"],
    // Vide : une étude de concurrence n'a pas de dépense, elle vaut zéro (comme avant).
    vide: { lu: 0 },
    zero: "accepte",
    format: FORMAT_MONTANT,
  },
  {
    action: "enregistrerReglagesMarketing",
    champ: "budget (en centimes)",
    jouer: async (saisie) => {
      banc.etat.reponsesRpc.is_permanent_super_admin = true;
      const resultat = await enregistrerReglagesMarketing({}, formulaire({
        jour_1: "1", jour_2: "4", heure_paris: "7", budget: saisie, veille_mots_inclus: "loyer",
      }));
      const ecrit = ecritureDe("marketing_reglages");
      return observer(resultat, ecrit?.budget_mensuel_cents, Boolean(ecrit));
    },
    attendu: 84000,
    formes: ["840,00", "840.00", "840"],
    // Un champ vidé vaut zéro (pas de seuil d'alerte), comme avant ; un champ absent vaut 10 €.
    vide: { lu: 0 },
    zero: "accepte",
    format: FORMAT_MONTANT,
    bornes: ["1000,01", "84000"],
  },
  {
    action: "reprendreSoldes",
    champ: "tresorerie",
    jouer: async (saisie) => {
      banc.etat.reponsesRpc.reprendre_soldes = [];
      const resultat = await reprendreSoldes(ORG, {}, formulaire({
        contenu: "type,montant\ndepot_garantie,100", date_bascule: "2026-10-01", tresorerie: saisie,
      }));
      const args = rpcDe("ouvrir_reprise");
      return observer(resultat, args?.p_tresorerie, Boolean(args));
    },
    attendu: 840,
    formes: ["840,00", "840.00", "840"],
    // Vide : refusé (il était lu « 0 » et passait).
    vide: { erreur: /indiquez la trésorerie que vous reprenez/i },
    // La trésorerie d'une agence peut être à découvert : le négatif est admis, lu tel que tapé.
    zero: "accepte",
    format: FORMAT_MONTANT,
    refus: ["abc", "1 234,50", "1.234,50", "1e2"],
  },
  {
    action: "enregistrerExerciceFiscal",
    champ: "quote_part230",
    jouer: async (saisie) => {
      const resultat = await enregistrerExerciceFiscal(ORG, "lot-test", 2026, {}, formulaire({
        confirme: "oui", periodes: PERIODES_FISCALES, justification: "Droits confirmés", regularisation230: "0", quote_part230: saisie,
      }));
      const args = rpcDe("enregistrer_exercice_fiscal_lot");
      return observer(resultat, args?.p_quote_part230, Boolean(args));
    },
    attendu: 33.5,
    formes: ["33,5", "33.5", "33.50"],
    vide: { lu: null },
    zero: "accepte",
    format: FORMAT_DECIMAL,
  },
];

const NOM = (c: Cas) => `${c.action} : ${c.champ}`;

describe.each(CAS.map((c) => [NOM(c), c] as const))("%s", (_nom, cas) => {
  const [virgule, point, zeroFinal] = cas.formes;

  it.each([virgule, point, zeroFinal])("« %s » est lu tel que tapé, jamais dix ou mille fois plus", async (saisie) => {
    const { resultat, lu, ecrit } = await cas.jouer(saisie);
    expect(resultat.erreur, `${saisie} refusé : ${resultat.erreur}`).toBeUndefined();
    expect(ecrit).toBe(true);
    expect(lu).toBe(cas.attendu);
  });

  it.each(cas.refus ?? ["abc", "-5", "1 234,50", "1.234,50", "1e2"])("refuse « %s » avant toute écriture, en disant le format attendu", async (saisie) => {
    const { resultat, ecrit } = await cas.jouer(saisie);
    expect(resultat.erreur).toBeDefined();
    expect(resultat.succes).toBeUndefined();
    expect(resultat.erreur).toMatch(cas.format ?? FORMAT_MONTANT);
    expect(ecrit).toBe(false);
  });

  if (cas.bornes) {
    it.each(cas.bornes)("refuse « %s » (hors de la plage du champ) avant toute écriture", async (saisie) => {
      const { resultat, ecrit } = await cas.jouer(saisie);
      expect(resultat.erreur).toBeDefined();
      expect(ecrit).toBe(false);
    });
  }

  it("le champ vide suit la règle du champ", async () => {
    const { resultat, lu, ecrit } = await cas.jouer("");
    if ("erreur" in cas.vide) {
      expect(resultat.erreur).toMatch(cas.vide.erreur);
      expect(ecrit).toBe(false);
    } else {
      expect(resultat.erreur).toBeUndefined();
      expect(ecrit).toBe(true);
      expect(lu).toBe(cas.vide.lu);
    }
  });

  it(`« 0 » est ${cas.zero === "accepte" ? "accepté (zéro explicite)" : "refusé"}`, async () => {
    const { resultat, lu, ecrit } = await cas.jouer("0");
    if (cas.zero === "accepte") {
      expect(resultat.erreur).toBeUndefined();
      expect(ecrit).toBe(true);
      expect(lu).toBe(0);
    } else {
      expect(resultat.erreur).toBeDefined();
      expect(ecrit).toBe(false);
    }
  });
});

describe("le champ fautif est nommé", () => {
  it("taux d'honoraires, quote-part et surface disent de quel champ il s'agit", async () => {
    banc.etat.lectures.mandats = { etat: "brouillon" };
    const taux = await ajouterLigneMandat(ORG, "personne-test", "mandat-test", {}, formulaire({ lot_id: "lot-test", taux_honoraires: "7,5 %" }));
    expect(taux.erreur).toMatch(/^Taux d'honoraires : valeur invalide/);
    const qp = await ajouterDetention(ORG, "bien-test", "lot-test", {}, formulaire({ person_id: "p1", quote_part: "un tiers" }));
    expect(qp.erreur).toMatch(/^Quote-part : valeur invalide/);
  });

  it("une saisie refusée est rendue au formulaire pour qu'il la repose", async () => {
    banc.etat.lectures.mandats = { etat: "brouillon" };
    const r = await ajouterLigneMandat(ORG, "personne-test", "mandat-test", {}, formulaire({ lot_id: "lot-test", taux_honoraires: "7,5 %" }));
    expect((r as { valeurs?: Record<string, string> }).valeurs?.taux_honoraires).toBe("7,5 %");
  });
});

describe("règles inchangées : « 7,5 » n'est ni 75 ni 7 500", () => {
  it("un taux de 7,5 % passe la borne 0-100 et s'écrit 7,5 (jamais 75, qui passerait aussi la borne)", async () => {
    banc.etat.lectures.mandats = { etat: "brouillon" };
    const r = await ajouterLigneMandat(ORG, "personne-test", "mandat-test", {}, formulaire({ lot_id: "lot-test", taux_honoraires: "7,5" }));
    expect(r.erreur).toBeUndefined();
    expect(ecritureDe("mandat_lignes")?.taux_honoraires).toBe(7.5);
  });

  it("un lot loué dont la surface est verrouillée : seuls les champs soumis sont écrits", async () => {
    const f = formulaire({ nom: "Lot 1", identifiant_fiscal: "1234567890123", description: "A", chauffage: "C", eau_chaude: "C", locaux_privatifs: "Cave" });
    const r = await modifierLot(ORG, "bien-test", "lot-test", {}, f);
    expect(r.erreur).toBeUndefined();
    const ecrit = ecritureDe("lots");
    expect(ecrit).toBeDefined();
    expect("surface_m2" in (ecrit ?? {})).toBe(false);
    expect("pieces" in (ecrit ?? {})).toBe(false);
  });

  it("une surface au-delà du plafond reste refusée sur la valeur lue", async () => {
    const r = await modifierLot(ORG, "bien-test", "lot-test", {}, formulaire({ ...LOT_MODIFIE, surface_m2: "10000,5" }));
    expect(r.erreur).toMatch(/dépasse/);
    expect(ecritureDe("lots")).toBeUndefined();
  });
});

// ───────────────────────── Parcours de bail et mentions du contrat : lecture stricte ─────────────────────────
// `Number(brut.replace(",", "."))` acceptait l'exposant (« 1e3 » valait 1000), l'hexadécimal (« 0x10 » valait 16),
// « Infinity » et les espaces. Les montants du parcours de bail se lisent comme tous les autres.
describe("lireEtapeBail et lireMentionsContrat : les montants du contrat se lisent strictement", () => {
  const actuel = { type: "nu", loyer_hc: 500, charges: 40, depot_garantie: 400, charges_mode: "provision", locataire_principal: "locataire", jour_echeance: 1 };
  const loyer = { loyer_hc: "500", charges: "40", depot_garantie: "400", jour_echeance: "1", charges_mode: "provision", revision_irl: "true", paiement_echeance: "echoir" };
  const lireLoyer = (champs: Record<string, string>) => lireEtapeBail("loyer", formulaire({ ...loyer, ...champs }), actuel, { meuble: false, surface: 46 });

  it.each([["840,00", 840], ["840.00", 840], ["840", 840], ["0", 0]])("loyer « %s » vaut %s", (saisie, attendu) => {
    const r = lireLoyer({ loyer_hc: saisie, depot_garantie: "0" });
    expect(r.erreur).toBeUndefined();
    expect(r.patch?.loyer_hc).toBe(attendu);
  });

  it.each(["1e3", "0x10", "Infinity", "1 000", "-5", "abc", "12,345", "1.234,50"])("refuse « %s » avec le message qui dit quoi écrire", (saisie) => {
    const r = lireLoyer({ loyer_hc: saisie });
    expect(r.erreur).toMatch(/montant invalide|centime près/i);
    expect(r.patch).toBeNull();
  });

  it("le jour d'échéance reste un entier de 1 à 28", () => {
    expect(lireLoyer({ jour_echeance: "15" }).erreur).toBeUndefined();
    expect(lireLoyer({ jour_echeance: "5,5" }).erreur).toMatch(/entre 1 et 28/);
    expect(lireLoyer({ jour_echeance: "29" }).erreur).toMatch(/entre 1 et 28/);
  });

  it.each(["honoraires_edl_bailleur", "honoraires_edl_locataire", "dpe_depenses_min", "dpe_depenses_max"])("mentions : %s lit « 840,00 » comme 840 et refuse « 1e3 »", (champ) => {
    const ok = lireMentionsContrat(formulaire({ [champ]: "840,00" }));
    expect(ok.erreur).toBeUndefined();
    expect((ok.mentions as Record<string, unknown>)[champ]).toBe(840);
    const refus = lireMentionsContrat(formulaire({ [champ]: "1e3" }));
    expect(refus.erreur).toMatch(/montant invalide/i);
    expect(lireMentionsContrat(formulaire({ [champ]: "" })).mentions).toMatchObject({ [champ]: null });
  });
});

describe("exercice fiscal : les parts de chaque période se lisent comme le texte tapé", () => {
  const jouer = (periodes: unknown) =>
    enregistrerExerciceFiscal(ORG, "lot-test", 2026, {}, formulaire({
      confirme: "oui", periodes: JSON.stringify(periodes), justification: "Droits confirmés", regularisation230: "0", quote_part230: "100",
    }));
  const periode = (quote_part: unknown) => [{ debut: "2026-01-01", fin: "2026-12-31", quote_part, regime: "nu" }];

  it.each([["33,5", 33.5], ["33.5", 33.5], ["100", 100], [100, 100], [33.5, 33.5], ["0", 0]])("« %s » vaut %s, jamais 335", async (saisie, attendu) => {
    const r = await jouer(periode(saisie));
    expect(r.erreur).toBeUndefined();
    const lues = rpcDe("enregistrer_exercice_fiscal_lot")?.p_periodes as { quote_part: number }[];
    expect(lues[0].quote_part).toBe(attendu);
  });

  it.each(["abc", "-5", "1e2", "33,5 %", "", "1 000"])("refuse « %s » avant toute écriture", async (saisie) => {
    const r = await jouer(periode(saisie));
    expect(r.erreur).toMatch(/valeur invalide : écrivez 145,17/i);
    expect(rpcDe("enregistrer_exercice_fiscal_lot")).toBeUndefined();
  });

  it("chaque période est lue ; les autres champs de la période ne sont pas touchés", async () => {
    const r = await jouer([
      { debut: "2026-01-01", fin: "2026-06-30", quote_part: "50,5", regime: "nu" },
      { debut: "2026-07-01", fin: "2026-12-31", quote_part: "49,5", regime: "meuble" },
    ]);
    expect(r.erreur).toBeUndefined();
    expect(rpcDe("enregistrer_exercice_fiscal_lot")?.p_periodes).toEqual([
      { debut: "2026-01-01", fin: "2026-06-30", quote_part: 50.5, regime: "nu" },
      { debut: "2026-07-01", fin: "2026-12-31", quote_part: 49.5, regime: "meuble" },
    ]);
  });

  it("un JSON qui n'est pas une liste de périodes est transmis tel quel : la base le refuse avec sa règle", async () => {
    const r = await jouer({ pas: "une liste" });
    expect(r.erreur).toBeUndefined();
    expect(rpcDe("enregistrer_exercice_fiscal_lot")?.p_periodes).toEqual({ pas: "une liste" });
  });
});

describe("montants dont la règle propre reste inchangée", () => {
  it("la trésorerie reprise peut être à découvert : « -1500,50 » vaut -1500,5", async () => {
    banc.etat.reponsesRpc.reprendre_soldes = [];
    const r = await reprendreSoldes(ORG, {}, formulaire({ contenu: "type,montant\ndepot_garantie,100", date_bascule: "2026-10-01", tresorerie: "-1500,50" }));
    expect(r.erreur).toBeUndefined();
    expect(rpcDe("ouvrir_reprise")?.p_tresorerie).toBe(-1500.5);
  });

  it("la trésorerie vide n'est plus lue « 0 » : la reprise ne s'ouvre pas", async () => {
    const r = await reprendreSoldes(ORG, {}, formulaire({ contenu: "type,montant\ndepot_garantie,100", date_bascule: "2026-10-01", tresorerie: "" }));
    expect(r.erreur).toMatch(/trésorerie/);
    expect(rpcDe("ouvrir_reprise")).toBeUndefined();
  });

  it("le seuil d'alerte marketing absent du formulaire vaut 10 €, vidé vaut 0", async () => {
    banc.etat.reponsesRpc.is_permanent_super_admin = true;
    const sans = formulaire({ jour_1: "1", jour_2: "4", heure_paris: "7", veille_mots_inclus: "loyer" });
    expect((await enregistrerReglagesMarketing({}, sans)).erreur).toBeUndefined();
    expect(ecritureDe("marketing_reglages")?.budget_mensuel_cents).toBe(1000);
  });

  it("le prix de vente du congé est facultatif pour un congé du locataire", async () => {
    const r = await enregistrerConge(ORG, "bail-test", {}, formulaire({ par: "locataire", date_presentation: "2026-10-01", prix_vente: "abc" }));
    expect(r.erreur).toBeUndefined();
    expect(rpcDe("enregistrer_conge")).not.toHaveProperty("p_prix_vente");
  });

  it("la TEOM supérieure au total reste refusée sur la valeur lue", async () => {
    const r = await ajouterEcriture(ORG, {}, formulaire({ categorie: "Taxe foncière", sens: "depense", montant: "100", teom: "168,00", cle_envoi: "6f1f0c1e-6c1a-4f3e-9d57-2b1d3c4e5f60" }));
    expect(r.erreur).toMatch(/part de TEOM/);
    expect(ecritureDe("ecritures")).toBeUndefined();
  });
});
