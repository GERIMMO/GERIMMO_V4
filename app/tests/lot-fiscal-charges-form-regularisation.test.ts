/**
 * D38 (CHF-02, option A) et D40 (CHF-06, option A), côté écran : le formulaire « Régulariser » d'un bail.
 *  · exercice non terminé : avertissement fort et case de confirmation obligatoire ;
 *  · exercice terminé : le formulaire est celui d'avant ;
 *  · la note sous le formulaire dit que le solde n'est pas appelé.
 * Rendu serveur (sans navigateur) : l'année proposée par défaut pilote l'affichage ; le serveur revérifie la confirmation (voir
 * lot-fiscal-charges-regularisation).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatLoyers } from "@/app/actions/loyers";
import fs from "node:fs";
import path from "node:path";
import { etatDecompteSortie, type EtatDecompteSortie } from "@/lib/baux";

const etatSimule = vi.hoisted(() => ({ valeur: {} as EtatLoyers }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [etatSimule.valeur, () => {}, false] };
});
vi.mock("@/app/actions/loyers", () => ({
  ajouterEncaissement: vi.fn(),
  reviserLoyer: vi.fn(),
  ajouterRelance: vi.fn(),
  regulariserCharges: vi.fn(),
}));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return { InputDateJour: (props: { name: string }) => createElement("input", { name: props.name, type: "date" }) };
});

import { FormulaireLoyers } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";

beforeEach(() => { etatSimule.valeur = {}; });

const texteDe = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/\s+/g, " ");

function rendre(extra: { dateDebut?: string | null; chargesForfait?: boolean; decompteSortie?: EtatDecompteSortie } = {}) {
  return renderToStaticMarkup(createElement(FormulaireLoyers, {
    orgId: "org-test",
    bailId: "bail-test",
    echeancier: [],
    encaissements: [],
    quittances: [],
    revisionIrl: false,
    irlReference: null,
    irlTrimestre: null,
    revisions: [],
    relances: [],
    regularisations: [],
    chargesForfait: extra.chargesForfait ?? false,
    dateDebut: extra.dateDebut ?? "2026-09-01",
    aujourdhui: "2026-10-14",
    ...(extra.decompteSortie ? { decompteSortie: extra.decompteSortie } : {}),
  }));
}
const champ = (html: string, nom: string) => html.match(/<input\b[^>]*>/g)?.find((input) => input.includes(`name="${nom}"`)) ?? "";

describe("D38 : le formulaire « Régulariser » d'un exercice non terminé", () => {
  // Bail commencé en septembre 2026 : l'exercice proposé est 2026, encore en cours le 14/10/2026.
  const html = rendre();

  it("propose l'année en cours et l'avertit en toutes lettres", () => {
    expect(champ(html, "annee")).toContain('value="2026"');
    const texte = texteDe(html);
    expect(texte).toContain("Exercice 2026 non terminé : comparaison non homogène.");
    expect(texte).toContain("le solde calculé peut changer de sens");
    expect(texte).toContain("ne se modifie plus");
  });

  it("exige une confirmation explicite, envoyée sous le nom que le serveur vérifie", () => {
    const case_ = champ(html, "confirmer_exercice_en_cours");
    expect(case_).toContain('type="checkbox"');
    expect(case_).toContain('value="oui"');
    expect(case_).toContain('required=""');
    expect(texteDe(html)).toContain("Exercice non terminé : comparaison non homogène. Je confirme l'enregistrement de cette régularisation, qui ne pourra plus être modifiée.");
  });

  it("repose la confirmation cochée après un refus pour une autre raison", () => {
    etatSimule.valeur = { erreur: "Le justificatif est obligatoire", valeurs: { annee: "2026", confirmer_exercice_en_cours: "oui" } };
    expect(champ(rendre(), "confirmer_exercice_en_cours")).toContain('checked=""');
  });

  it("un exercice terminé garde le formulaire d'avant, sans avertissement ni case", () => {
    const termine = rendre({ dateDebut: "2024-03-01" });
    expect(champ(termine, "annee")).toContain('value="2025"');
    expect(texteDe(termine)).not.toContain("non terminé");
    expect(champ(termine, "confirmer_exercice_en_cours")).toBe("");
  });
});

describe("D40 : la note du formulaire dit que le solde n'est pas appelé", () => {
  it("avant l'émission, le formulaire annonce que le solde sera repris au décompte de sortie", () => {
    expect(texteDe(rendre())).toContain("Le solde d'une régularisation n'est pas appelé : il est repris au décompte de sortie.");
  });

  it("décompte de sortie déjà finalisé : la note le dit au lieu de promettre une reprise qui n'aura pas lieu", () => {
    const texte = texteDe(rendre({ decompteSortie: "finalise" }));
    expect(texte).toContain("Le solde d'une régularisation n'est pas appelé. Le décompte de sortie de ce bail est déjà finalisé : le solde d'une nouvelle régularisation n'y sera pas repris, à traiter hors application.");
    expect(texte).not.toContain("il est repris au décompte de sortie");
  });

  it("décompte de sortie illisible : la note n'affirme pas la reprise", () => {
    const texte = texteDe(rendre({ decompteSortie: "inconnu" }));
    expect(texte).toContain("L'état du décompte de sortie n'a pas pu être lu : s'il est déjà finalisé, le solde d'une nouvelle régularisation n'y sera pas repris.");
    expect(texte).not.toContain("il est repris au décompte de sortie");
  });

  it("décompte de sortie déjà finalisé : l'avertissement d'exercice non terminé ne promet pas non plus la reprise", () => {
    const texte = texteDe(rendre({ decompteSortie: "finalise" }));
    expect(texte).toContain("Exercice 2026 non terminé : comparaison non homogène.");
    expect(texte).toContain("Le décompte de sortie de ce bail est déjà finalisé : son solde n'y sera pas repris, à traiter hors application.");
    expect(texte).not.toContain("son solde sera repris au décompte de sortie");
  });

  it("sans indication (décompte non finalisé), l'avertissement garde sa phrase d'avant", () => {
    expect(texteDe(rendre())).toContain("Une régularisation enregistrée ne se modifie plus, et son solde sera repris au décompte de sortie.");
  });

  it("au forfait, aucune régularisation n'est proposée, donc aucune note", () => {
    expect(texteDe(rendre({ chargesForfait: true }))).not.toContain("n'est pas appelé");
  });
});

describe("D40 : l'état du décompte de sortie lu par la page arrive jusqu'au formulaire", () => {
  it("restitution finalisée : « finalise » ; en cours ou absente : « non_finalise » ; lecture en échec : « inconnu » (on n'affirme rien)", () => {
    expect(etatDecompteSortie({ statut: "finalise" }, null)).toBe("finalise");
    expect(etatDecompteSortie({ statut: "en_cours" }, null)).toBe("non_finalise");
    expect(etatDecompteSortie(null, null)).toBe("non_finalise");
    expect(etatDecompteSortie(undefined, undefined)).toBe("non_finalise");
    expect(etatDecompteSortie(null, { message: "indisponible" })).toBe("inconnu");
    expect(etatDecompteSortie({ statut: "finalise" }, { message: "indisponible" })).toBe("inconnu");
  });

  // La page est un composant serveur de plusieurs milliers de lignes, sans banc de rendu : on vérifie le branchement dans sa source,
  // comme les autres tests d'écrans du dépôt (lecture de la source).
  it("la page du bail passe la restitution et l'erreur de sa lecture au formulaire des loyers", () => {
    const page = fs.readFileSync(path.join(__dirname, "../src/app/agence/[orgId]/baux/[bailId]/page.tsx"), "utf8");
    expect(page).toMatch(/<FormulaireLoyers[\s\S]*?decompteSortie=\{etatDecompteSortie\(restitution, erreurRestitution\)\}[\s\S]*?\/>/);
  });
});
