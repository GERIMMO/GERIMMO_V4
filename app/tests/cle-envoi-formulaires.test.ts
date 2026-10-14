/**
 * D05 et D04 (2) côté ÉCRAN : les quatre formulaires d'encaissement portent la clé d'envoi, l'écran dit « déjà
 * enregistré », et la demande de confirmation propose de confirmer ou de corriger.
 *
 * Ce fichier ne voit que le HTML du serveur (`useActionState` y est remplacé par un état constant) : la règle « quand la
 * clé est-elle libérée ? » est une fonction pure (`cleLiberee`) testée ici, et le rendu serveur montre ce que
 * l'utilisateur voit pour chaque retour de l'action. Le comportement dans le navigateur (clé tirée après l'affichage,
 * conservée après une réponse perdue, renouvelée après un succès ; confirmation, « Corriger », retapage) est rejoué dans
 * un vrai Chromium par `cle-envoi-navigateur.test.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatLoyers } from "@/app/actions/loyers";
import { cleLiberee } from "@/lib/cle-envoi";

const etatSimule = vi.hoisted(() => ({ valeur: {} as EtatLoyers }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [etatSimule.valeur, () => {}, false] };
});
vi.mock("@/app/actions/loyers", () => ({
  ajouterEncaissement: vi.fn(),
  supprimerEncaissement: vi.fn(),
  reviserLoyer: vi.fn(),
  ajouterRelance: vi.fn(),
  supprimerRelance: vi.fn(),
  regulariserCharges: vi.fn(),
  genererAppels: vi.fn(),
  emettreQuittances: vi.fn(),
  envoyerQuittance: vi.fn(),
}));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));
vi.mock("@/components/input-date-jour", async () => {
  const { createElement } = await import("react");
  return {
    InputDateJour: ({ valeurSoumise, ...props }: { valeurSoumise?: string; name: string }) =>
      createElement("input", { ...props, type: "date", defaultValue: valeurSoumise ?? "2026-09-13" }),
  };
});

import { FormulaireLoyers } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-loyers";
import { ConfirmationEncaissement } from "@/components/confirmation-encaissement";
import { CleEnvoi } from "@/components/cle-envoi";

const RACINE = resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(resolve(RACINE, chemin), "utf8");

beforeEach(() => {
  etatSimule.valeur = {};
});

function rendre() {
  return renderToStaticMarkup(
    createElement(FormulaireLoyers, {
      orgId: "org-test",
      bailId: "bail-test",
      echeancier: [{ appel_id: "appel-test", periode: "2026-08-01", date_echeance: "2026-08-05", montant_du: 840, montant_couvert: 0, statut: "impaye" }],
      encaissements: [],
      quittances: [],
      revisionIrl: false,
      irlReference: null,
      irlTrimestre: null,
      revisions: [],
      relances: [],
      regularisations: [],
      chargesForfait: false,
    })
  );
}

/** Le formulaire « Saisir un encaissement » : celui qui porte le champ Montant de l'encaissement. */
function formulaireEncaissement(html: string) {
  return html.match(/<form\b[\s\S]*?<\/form>/g)?.find((f) => f.includes('id="enc-montant"')) ?? "";
}

const CONFIRMATION = {
  montant: 84000,
  resteDu: 840,
  terme: 840,
  seuil: 3360,
  message: "Rien n'est encore enregistré. 84 000,00 € dépasse le double de ce qui est attendu.",
};

describe("la clé d'envoi est dans chacun des formulaires d'encaissement", () => {
  it("encaissement de loyer (fiche du bail) : un champ caché cle_envoi dans le formulaire", () => {
    const form = formulaireEncaissement(rendre());
    expect(form).toMatch(/<input[^>]*type="hidden"[^>]*name="cle_envoi"/);
  });

  it.each([
    ["src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", 1],
    ["src/components/fenetre-lot.tsx", 2], // règlement partiel + dépense du lot
    ["src/app/agence/[orgId]/baux/[bailId]/formulaire-depot.tsx", 1],
    ["src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx", 1],
  ])("%s : %i formulaire(s) portent <CleEnvoi>", (fichier, nombre) => {
    const source = lire(fichier);
    expect(source.match(/<CleEnvoi etat=\{/g) ?? []).toHaveLength(nombre);
  });

  it("la clé est tirée dans le navigateur : vide dans le HTML du serveur", () => {
    const html = renderToStaticMarkup(createElement(CleEnvoi, { etat: {} }));
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="cle_envoi"[^>]*value=""/);
  });

  it("chaque action qui reçoit la clé la lit (champ cle_envoi)", () => {
    for (const fichier of ["src/app/actions/loyers.ts", "src/app/actions/depot.ts", "src/app/actions/compta.ts"]) {
      expect(lire(fichier), fichier).toContain('lireCleEnvoi(formData.get("cle_envoi"))');
    }
  });
});

describe("quand la clé est libérée : seul un succès confirmé par le serveur la renouvelle", () => {
  it("un enregistrement réussi, ou « déjà enregistré », libère la clé", () => {
    expect(cleLiberee({ succes: "1 quittance émise" })).toBe(true);
    expect(cleLiberee({ succes: "Cet encaissement est déjà enregistré" })).toBe(true);
  });

  it("une erreur, un refus de validation, une demande de confirmation, une réponse perdue ou l'état initial la gardent", () => {
    expect(cleLiberee({})).toBe(false);
    expect(cleLiberee(null)).toBe(false);
    expect(cleLiberee({ erreur: "Montant invalide" })).toBe(false);
    expect(cleLiberee({ succes: undefined, erreur: "La confirmation n’a pas pu être reçue." })).toBe(false);
    expect(cleLiberee({ succes: "ancien succès", erreur: "La confirmation n’a pas pu être reçue." })).toBe(false);
    // Une demande de confirmation n'a ni succès ni erreur.
    expect(cleLiberee({ ...( { confirmation: CONFIRMATION } as object) })).toBe(false);
  });
});

describe("l'écran dit « déjà enregistré »", () => {
  it("fiche du bail : le message du serveur s'affiche tel quel, sans erreur", () => {
    etatSimule.valeur = {
      succes: "Cet encaissement de 2,00 € du 14/10/2026 est déjà enregistré : il n'a pas été enregistré une seconde fois.",
      dejaEnregistre: true,
    };
    const form = formulaireEncaissement(rendre());
    expect(form).toContain("est déjà enregistré");
    expect(form).toContain("pas été enregistré une seconde fois");
    expect(form).not.toContain("text-destructive");
  });

  it("dépôt de garantie et écriture libre affichent le succès (ils se taisaient)", () => {
    expect(lire("src/app/agence/[orgId]/baux/[bailId]/formulaire-depot.tsx")).toMatch(/!etat\.erreur && etat\.succes/);
    expect(lire("src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx")).toMatch(/!etat\.erreur && etat\.succes/);
  });
});

describe("la demande de confirmation d'un montant très supérieur au dû", () => {
  it("n'apparaît pas pour un encaissement normal", () => {
    expect(renderToStaticMarkup(createElement(ConfirmationEncaissement, { idChampMontant: "enc-montant" }))).toBe("");
    expect(formulaireEncaissement(rendre())).not.toContain("Vérifiez ce montant");
  });

  it("dit le montant, ne promet pas d'enregistrement, et propose de confirmer ou de corriger", () => {
    etatSimule.valeur = { confirmation: CONFIRMATION, valeurs: { montant: "84000" } };
    const form = formulaireEncaissement(rendre());
    expect(form).toContain('role="alert"');
    expect(form).toContain("Vérifiez ce montant avant de l&#x27;enregistrer");
    expect(form).toContain("Rien n&#x27;est encore enregistré");
    expect(form).toContain("Oui, encaisser 84 000,00 €");
    expect(form).toContain("Corriger le montant");
    // Le bouton de confirmation porte le montant confirmé, rien d'autre ; le bouton « Encaisser » n'en porte pas.
    const boutons = form.match(/<button\b[^>]*>/g) ?? [];
    const confirmant = boutons.filter((b) => b.includes('name="confirmation_montant"'));
    expect(confirmant).toHaveLength(1);
    expect(confirmant[0]).toContain('value="84000.00"');
    expect(confirmant[0]).toContain('type="submit"');
    expect(form.match(/name="confirmation_montant"/g)).toHaveLength(1);
    // La saisie reste dans le champ : le serveur la rend dans `valeurs`.
    expect(form).toMatch(/<input[^>]*id="enc-montant"[^>]*value="84000"/);
  });

  it("n'est pas une erreur : pas de texte rouge, et le formulaire n'est pas présenté comme enregistré", () => {
    etatSimule.valeur = { confirmation: CONFIRMATION, valeurs: { montant: "84000" } };
    const form = formulaireEncaissement(rendre());
    expect(form).not.toContain("text-destructive");
    expect(form).not.toContain("text-success-soft-foreground");
  });

  it("le fenêtre du lot (règlement partiel) la porte aussi", () => {
    const source = lire("src/components/fenetre-lot.tsx");
    expect(source).toMatch(/<ConfirmationEncaissement confirmation=\{etat\.confirmation\} idChampMontant=\{`part-\$\{bailId\}`\} \/>/);
  });
});
