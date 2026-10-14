/**
 * Lot « fiscal-charges », côté NAVIGATEUR : ce que le rendu serveur ne joue jamais (effets, changements d'état, réponses qui arrivent).
 * Le composant tourne dans le banc `fixtures/harnais-hooks` (hooks simulés, aucun navigateur) :
 *  · D37 : le champ « intérêts d'emprunt » se remplit avec le montant du livre, se relit quand le lot ou l'année change, attend la réponse
 *    avant de laisser générer, et ignore une réponse tardive qui ne concerne plus le choix courant ;
 *  · D38 : l'année saisie pilote l'avertissement « exercice non terminé » et la case de confirmation.
 * Le rendu serveur (formes, attributs) est vérifié à côté, dans lot-fiscal-charges-formulaire et lot-fiscal-charges-form-regularisation.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { monter, type Monte } from "./fixtures/harnais-hooks";

const banc = vi.hoisted(() => ({
  demandes: [] as { orgId: string; lot: string; annee: string; repondre: (reponse: unknown) => void; echouer: () => void }[],
}));

vi.mock("react", async (original) => (await import("./fixtures/harnais-hooks")).reactAvecHooksSimules(await original<typeof import("react")>()));
vi.mock("@/app/actions/catalogue-documents", () => ({
  genererDepuisCatalogue: vi.fn(),
  proposerInteretsEmprunt: vi.fn(
    (orgId: string, lot: string, annee: string) =>
      new Promise((resolve, reject) => banc.demandes.push({ orgId, lot, annee, repondre: resolve, echouer: () => reject(new Error("réseau coupé")) })),
  ),
}));
vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: () => ({ etat: {}, enCours: false, soumettre: () => {}, version: 0 }) }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [{}, () => {}, false] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/loyers", () => ({ ajouterEncaissement: vi.fn(), reviserLoyer: vi.fn(), ajouterRelance: vi.fn(), regulariserCharges: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return { InputDateJour: (props: { name: string }) => createElement("input", { name: props.name, type: "date" }) };
});

import { FormulaireCatalogue } from "@/app/agence/[orgId]/documents/catalogue/formulaire-catalogue";
import { FormulaireLoyers } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";

const LOT_A = { id: "lot-a", libelle: "Appartement Jardin" };
const LOT_B = { id: "lot-b", libelle: "Studio Gare" };

beforeEach(() => {
  banc.demandes.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const recapNu = (choix = [LOT_A]) => monter(FormulaireCatalogue, { orgId: "org", modeleId: "recap_fiscal_nu", choix });
/** Le bouton « Générer le PDF » attend : l'attribut `disabled` posé, pas la classe Tailwind `disabled:` que porte tout bouton. */
const boutonAttend = (m: Monte) => /<button\b[^>]*\sdisabled=""/.test(m.html());
const interets = (m: Monte) => m.champ("interets_emprunt")?.props.value;
const reponse = (montant: string, qualifie = true) => ({ montant, qualifie });

describe("D37 : le champ des intérêts d'emprunt se remplit avec le montant du livre", () => {
  it("un seul dossier : la lecture part tout de suite (organisation, lot, année), le bouton attend, puis le champ reçoit le montant", async () => {
    const m = recapNu();
    await m.stabiliser();
    expect(banc.demandes.map(({ orgId, lot, annee }) => ({ orgId, lot, annee }))).toEqual([{ orgId: "org", lot: "lot-a", annee: "2026" }]);
    expect(boutonAttend(m)).toBe(true);
    expect(m.texte()).toContain("Lecture du montant du livre…");
    expect(interets(m)).toBe("0");

    banc.demandes[0].repondre(reponse("2345,67"));
    await m.stabiliser();
    expect(interets(m)).toBe("2345,67");
    expect(m.texte()).toContain("Montant qualifié dans le livre pour 2026 : 2345,67 €.");
    expect(m.texte()).not.toContain("Lecture du montant du livre…");
    expect(boutonAttend(m)).toBe(false);
    expect(m.html()).toMatch(/<span role="status"[^>]*>Montant qualifié dans le livre pour 2026/);
  });

  it("plusieurs dossiers : rien n'est lu tant qu'aucun n'est choisi ; le choix lance la lecture de CE lot", async () => {
    const m = recapNu([LOT_A, LOT_B]);
    await m.stabiliser();
    expect(banc.demandes).toHaveLength(0);
    expect(boutonAttend(m)).toBe(true);

    await m.saisir("cible", "lot-b");
    expect(banc.demandes.map(({ lot, annee }) => `${lot}|${annee}`)).toEqual(["lot-b|2026"]);
    banc.demandes[0].repondre(reponse("812,40"));
    await m.stabiliser();
    expect(interets(m)).toBe("812,40");
    expect(boutonAttend(m)).toBe(false);
  });

  it("changer l'année relit le livre : le bouton attend de nouveau, puis le champ prend le montant de l'année choisie", async () => {
    const m = recapNu();
    await m.stabiliser();
    banc.demandes[0].repondre(reponse("2345,67"));
    await m.stabiliser();

    await m.saisir("annee", "2025");
    expect(banc.demandes.map(({ lot, annee }) => `${lot}|${annee}`)).toEqual(["lot-a|2026", "lot-a|2025"]);
    expect(boutonAttend(m)).toBe(true);
    expect(m.texte()).toContain("Lecture du montant du livre…");

    banc.demandes[1].repondre(reponse("100,00"));
    await m.stabiliser();
    expect(interets(m)).toBe("100,00");
    expect(m.texte()).toContain("Montant qualifié dans le livre pour 2025 : 100,00 €.");
    expect(boutonAttend(m)).toBe(false);
  });

  it("changer de lot, même année : la lecture est relancée et l'ancien montant ne vaut pas pour le nouveau lot (le bouton attend)", async () => {
    const m = recapNu([LOT_A, LOT_B]);
    await m.saisir("cible", "lot-a");
    banc.demandes[0].repondre(reponse("1000,00"));
    await m.stabiliser();
    expect(boutonAttend(m)).toBe(false);

    await m.saisir("cible", "lot-b");
    expect(banc.demandes.map(({ lot }) => lot)).toEqual(["lot-a", "lot-b"]);
    expect(boutonAttend(m)).toBe(true);
    expect(m.texte()).toContain("Lecture du montant du livre…");

    banc.demandes[1].repondre(reponse("20,00"));
    await m.stabiliser();
    expect(interets(m)).toBe("20,00");
    expect(boutonAttend(m)).toBe(false);
  });

  it("deux réponses qui se croisent : celle d'un lot qu'on a quitté est ignorée, même si elle arrive en dernier", async () => {
    const m = recapNu([LOT_A, LOT_B]);
    await m.saisir("cible", "lot-a");
    await m.saisir("cible", "lot-b");
    expect(banc.demandes.map(({ lot }) => lot)).toEqual(["lot-a", "lot-b"]);

    banc.demandes[1].repondre(reponse("20,00"));
    await m.stabiliser();
    banc.demandes[0].repondre(reponse("1000,00")); // réponse tardive du lot A
    await m.stabiliser();
    expect(interets(m)).toBe("20,00");
    expect(boutonAttend(m)).toBe(false);
  });

  it("deux réponses qui se croisent (année) : la réponse tardive de l'année quittée ne remplace pas celle de l'année courante", async () => {
    const m = recapNu();
    await m.stabiliser();
    await m.saisir("annee", "2025");
    banc.demandes[1].repondre(reponse("250,00"));
    await m.stabiliser();
    banc.demandes[0].repondre(reponse("999,99"));
    await m.stabiliser();
    expect(interets(m)).toBe("250,00");
    expect(m.texte()).toContain("pour 2025");
  });

  it("aucune dépense qualifiée en 250 : le champ reste à 0 et le dit", async () => {
    const m = recapNu();
    await m.stabiliser();
    banc.demandes[0].repondre(reponse("0", false));
    await m.stabiliser();
    expect(interets(m)).toBe("0");
    expect(m.texte()).toContain("Aucune dépense n'est qualifiée en ligne 250 dans le livre pour 2026 : indiquez le montant des intérêts, ou 0.");
    expect(boutonAttend(m)).toBe(false);
  });

  it("lecture refusée par le serveur : le champ n'est pas touché, le motif est dit, la saisie à la main reste possible", async () => {
    const m = recapNu();
    await m.stabiliser();
    banc.demandes[0].repondre({ erreur: "Accès refusé." });
    await m.stabiliser();
    expect(interets(m)).toBe("0");
    expect(m.texte()).toContain("Le montant du livre n'a pas pu être lu (Accès refusé.) Saisissez-le à la main : le PDF signalera l'écart éventuel.");
    expect(boutonAttend(m)).toBe(false);
  });

  it("service injoignable : même issue, sans bloquer le document", async () => {
    const m = recapNu();
    await m.stabiliser();
    banc.demandes[0].echouer();
    await m.stabiliser();
    expect(interets(m)).toBe("0");
    expect(m.texte()).toContain("(le service ne répond pas.)");
    expect(boutonAttend(m)).toBe(false);
  });

  it("le montant proposé reste modifiable à la main", async () => {
    const m = recapNu();
    await m.stabiliser();
    banc.demandes[0].repondre(reponse("2345,67"));
    await m.stabiliser();
    await m.saisir("interets_emprunt", "1500,50");
    expect(interets(m)).toBe("1500,50");
    expect(banc.demandes).toHaveLength(1);
  });

  it("une année illisible ne lance aucune lecture", async () => {
    const m = recapNu();
    await m.stabiliser();
    banc.demandes[0].repondre(reponse("2345,67"));
    await m.stabiliser();
    await m.saisir("annee", "20");
    await m.saisir("annee", "");
    expect(banc.demandes).toHaveLength(1);
  });

  it("un autre document du catalogue ne lit rien et ne bloque pas son bouton", async () => {
    const m = monter(FormulaireCatalogue, { orgId: "org", modeleId: "decompte_charges", choix: [{ id: "reg", libelle: "Appartement Jardin · 2025" }] });
    await m.stabiliser();
    expect(banc.demandes).toHaveLength(0);
    expect(boutonAttend(m)).toBe(false);
    expect(m.html()).not.toContain('role="status"');
  });
});

describe("D38 : l'année saisie pilote l'avertissement « exercice non terminé » et sa case", () => {
  const formulaire = () =>
    monter(FormulaireLoyers, {
      orgId: "org", bailId: "bail", echeancier: [], encaissements: [], quittances: [], revisionIrl: false, irlReference: null, irlTrimestre: null,
      revisions: [], relances: [], regularisations: [], chargesForfait: false, dateDebut: "2026-09-01", aujourdhui: "2026-10-14",
    });
  const avertissement = (m: Monte) => /Exercice (\d{4}) non terminé/.exec(m.texte())?.[1] ?? null;

  it("l'année proposée (en cours) montre l'avertissement et une case obligatoire", () => {
    const m = formulaire();
    expect(avertissement(m)).toBe("2026");
    expect(m.champ("confirmer_exercice_en_cours")?.props).toMatchObject({ type: "checkbox", value: "oui", required: true });
  });

  it("passer à un exercice terminé retire l'avertissement et la case ; revenir à l'exercice en cours les remet", async () => {
    const m = formulaire();
    await m.saisir("annee", "2025");
    expect(avertissement(m)).toBeNull();
    expect(m.champ("confirmer_exercice_en_cours")).toBeUndefined();
    await m.saisir("annee", "2026");
    expect(avertissement(m)).toBe("2026");
    expect(m.champ("confirmer_exercice_en_cours")).toBeDefined();
  });

  it("l'avertissement nomme l'année saisie, et un exercice à venir est aussi non terminé", async () => {
    const m = formulaire();
    await m.saisir("annee", "2027");
    expect(avertissement(m)).toBe("2027");
  });

  it("une année illisible ou incomplète ne montre aucun avertissement", async () => {
    const m = formulaire();
    await m.saisir("annee", "20");
    expect(avertissement(m)).toBeNull();
    await m.saisir("annee", "");
    expect(avertissement(m)).toBeNull();
    expect(m.champ("confirmer_exercice_en_cours")).toBeUndefined();
  });
});

// Garde du banc lui-même : un champ qui ne réagit pas ne doit pas passer pour un champ testé.
describe("banc", () => {
  it("refuse de « saisir » dans un champ que le composant ne pilote pas", async () => {
    const Fixe = () => createElement("input", { name: "libre", defaultValue: "x" });
    const m = monter(Fixe, {});
    await expect(m.saisir("libre", "y")).rejects.toThrow(/pas piloté/);
  });
});
