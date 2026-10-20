/**
 * Liste d'attente des agences (20/10/2026), lot SITE : la FORME de l'état rendu par l'action `inscrireAgence`, chemin par
 * chemin, le client de service simulé (ni base ni émulateur : le vrai chemin est liste-attente-agences-action-api.test.ts).
 *
 * Pourquoi ce test (relecture adverse du 20/10) : le test d'API attendait `{ erreur }` strict là où l'action rend
 * `{ erreur, valeurs }` ; l'écart n'avait pas été vu, l'émulateur étant interdit au lot. Ce fichier fixe le contrat :
 *  - un SUCCÈS (inscription, pot de miel, doublon 23505) est EXACTEMENT `{ succes: MESSAGE_SUCCES_LISTE_ATTENTE }` ;
 *  - un REFUS (validation, clé absente, erreur de la base) est `{ erreur, valeurs }`, `valeurs` étant la saisie soumise
 *    telle quelle (non normalisée), que le formulaire repose en defaultValue : React 19 vide un <form action> après chaque
 *    action, erreur comprise (convention valeursDuFormulaire, recette du 22/08).
 * Superset compatible du contrat commun des quatre lots (le succès y est inchangé ; aucun autre lot ne lit cet état).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_SUCCES_LISTE_ATTENTE } from "../src/lib/liste-attente-agences";

type Erreur = { code: string; message: string } | null;
type Insertion = (ligne: Record<string, unknown>) => Promise<{ error: Erreur }>;
type Table = { insert: Insertion };
const m = vi.hoisted(() => ({
  insert: vi.fn<Insertion>(),
  from: vi.fn<(table: string) => Table>(),
  // null = clé de service absente (clientDeService rend null quand l'environnement ne la porte pas).
  service: null as null | { from: (table: string) => Table },
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.service }));

import { inscrireAgence } from "../src/app/actions/liste-attente-agences";

const DOMAINE = "@agences-forme.test";
const SUCCES = { succes: MESSAGE_SUCCES_LISTE_ATTENTE };
const REFUS_PLAFOND = "Le formulaire reçoit beaucoup d'inscriptions en ce moment : réessayez dans une heure.";
const INDISPONIBLE = "Le formulaire est momentanément indisponible. Réessayez dans quelques minutes.";
const SAISIE = {
  agence: "Agence du Parc",
  contact: "Marie Durand",
  email: `marie${DOMAINE}`,
  telephone: "01 02 03 04 05",
  code_postal: "75 011",
  nb_lots: "50_a_199",
  message: "Nous gérons 120 lots.\r\nÀ bientôt.",
};

function formulaire(valeurs: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...SAISIE, ...valeurs })) f.set(k, v);
  return f;
}
/** La base répond ainsi à l'insertion (null = succès). */
function baseQuiRepond(error: Erreur) {
  m.insert.mockResolvedValue({ error });
  m.from.mockReturnValue({ insert: m.insert });
  m.service = { from: m.from };
}

beforeEach(() => {
  m.insert.mockReset();
  m.from.mockReset();
  m.service = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("un succès est exactement { succes }", () => {
  it("l'inscription : UNE ligne insérée dans liste_attente_agences, normalisée, source /agences ; rien d'autre dans l'état", async () => {
    baseQuiRepond(null);
    expect(await inscrireAgence({}, formulaire())).toEqual(SUCCES);
    expect(m.from).toHaveBeenCalledTimes(1);
    expect(m.from).toHaveBeenCalledWith("liste_attente_agences");
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insert).toHaveBeenCalledWith({
      agence: "Agence du Parc",
      contact: "Marie Durand",
      email: `marie${DOMAINE}`,
      telephone: "01 02 03 04 05",
      code_postal: "75011",
      nb_lots: "50_a_199",
      message: "Nous gérons 120 lots.\nÀ bientôt.",
      source: "/agences",
    });
  });

  it("le pot de miel rempli : le même succès, sans toucher la base (le client de service n'est même pas appelé)", async () => {
    baseQuiRepond(null);
    expect(await inscrireAgence({}, formulaire({ site: "http://spam.example" }))).toEqual(SUCCES);
    expect(m.from).not.toHaveBeenCalled();
  });

  it("le doublon (23505) : le même succès, sans `erreur` ni `valeurs` (la page ne révèle pas qu'une adresse est connue)", async () => {
    baseQuiRepond({ code: "23505", message: 'duplicate key value violates unique constraint "liste_attente_agences_email_lower_idx"' });
    const r = await inscrireAgence({}, formulaire());
    expect(r).toEqual(SUCCES);
    expect(r.erreur).toBeUndefined();
    expect(r.valeurs).toBeUndefined();
  });
});

describe("un refus est { erreur, valeurs } : la saisie soumise revient telle quelle, pour être reposée dans les champs", () => {
  it("la validation : le premier défaut en français, la saisie entière (non normalisée), aucune écriture", async () => {
    baseQuiRepond(null);
    const r = await inscrireAgence({}, formulaire({ code_postal: "7501" }));
    expect(r).toEqual({ erreur: "Indiquez le code postal de l'agence : cinq chiffres.", valeurs: { ...SAISIE, code_postal: "7501" } });
    expect(r.succes).toBeUndefined();
    expect(m.from).not.toHaveBeenCalled();
  });

  it("la clé de service absente : le message d'indisponibilité, la saisie reposée, l'absence journalisée", async () => {
    m.service = null;
    const r = await inscrireAgence({}, formulaire());
    expect(r).toEqual({ erreur: INDISPONIBLE, valeurs: SAISIE });
    expect(r.succes).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(["erreur", "valeurs"]);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("le plafond horaire (P0001, message de la base) : rendu en français tel quel, la saisie reposée", async () => {
    baseQuiRepond({ code: "P0001", message: REFUS_PLAFOND });
    const r = await inscrireAgence({}, formulaire({ email: `trente-et-unieme${DOMAINE}` }));
    expect(r).toEqual({ erreur: REFUS_PLAFOND, valeurs: { ...SAISIE, email: `trente-et-unieme${DOMAINE}` } });
    expect(r.succes).toBeUndefined();
  });

  it("une erreur technique de la base : passée par sansJargon (aucun nom de table à l'écran), la saisie reposée", async () => {
    baseQuiRepond({ code: "42P01", message: 'relation "public.liste_attente_agences" does not exist' });
    const r = await inscrireAgence({}, formulaire());
    expect(r.erreur).toMatch(/^Gerimmo n’a pas pu terminer cette action\./);
    expect(r.erreur).not.toMatch(/relation|liste_attente_agences/);
    expect(r.valeurs).toEqual(SAISIE);
    expect(r.succes).toBeUndefined();
  });
});
