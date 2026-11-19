/**
 * SCI-4 (audit après publication de la PR #347, 19/11/2026) : le formulaire public /inscription ne demandait pas le
 * prénom. Pour une SCI, une SCI familiale ou une autre société, seul l'écran de confirmation l'exigeait (PR #347) : la
 * personne le découvrait par surprise. Le prénom de la personne qui gère la société se demande désormais à côté du nom
 * de la société, et l'action refuse une société sans prénom en gardant la saisie. Un particulier n'a rien de plus à
 * saisir. Les trois portes (formulaire public, confirmation, ouverture depuis un compte connecté) suivent la même règle.
 *
 * Sans base ni navigateur : le formulaire est rendu par le serveur, l'action appelée avec une fabrique de liens simulée.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ etat: {} as Record<string, unknown>, inscrire: vi.fn() }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ inscrireEtEnvoyerConfirmation: mocks.inscrire, envoyerLienMotDePasse: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// Le rendu du serveur avec l'état d'action voulu (aucun, ou celui d'un refus).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [mocks.etat, () => {}, false] };
});

import { inscrireProprietaire } from "@/app/actions/auth";
import { FormulaireInscription } from "@/app/inscription/formulaire-inscription";
import { MESSAGE_BOITE_MAIL } from "@/lib/inscription";
import {
  MESSAGE_PRENOM_REPRESENTANT_REQUIS,
  MESSAGE_RAISON_SOCIALE_REQUISE,
  refusIdentiteSociete,
} from "@/lib/qualite-bailleur";

function rendre(etat: Record<string, unknown> = {}): string {
  mocks.etat = etat;
  return renderToStaticMarkup(createElement(FormulaireInscription, { dureeEssai: "2 mois" }));
}
const balise = (html: string, nom: string) => html.match(/<input\b[^>]*>/g)?.find((tag) => tag.includes(`name="${nom}"`));

function envoi(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries({ nom: "Martin", email: "camille.martin@example.invalid", ...champs })) f.set(cle, valeur);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inscrire.mockResolvedValue({ etat: "confirmation_envoyee" });
});

describe("la règle commune : nom de la société, puis prénom de la personne qui la gère", () => {
  it.each(["SCI", "SCI familiale", "Personne morale"])("%s : refuse sans nom de société, puis sans prénom", (qualite) => {
    expect(refusIdentiteSociete(qualite, "", "Camille")).toEqual({ erreur: MESSAGE_RAISON_SOCIALE_REQUISE, champ: "raison_sociale" });
    expect(refusIdentiteSociete(qualite, "SCI du Tilleul", "   ")).toEqual({ erreur: MESSAGE_PRENOM_REPRESENTANT_REQUIS, champ: "prenom" });
    expect(refusIdentiteSociete(qualite, "SCI du Tilleul", null)).toEqual({ erreur: MESSAGE_PRENOM_REPRESENTANT_REQUIS, champ: "prenom" });
    expect(refusIdentiteSociete(qualite, "SCI du Tilleul", "Camille")).toBeNull();
  });

  it.each(["Personne physique", "Indivision (personnes physiques)", "", null])("« %s » : aucun champ de plus", (qualite) => {
    expect(refusIdentiteSociete(qualite, "", "")).toBeNull();
  });
});

describe("/inscription : le champ « Votre prénom »", () => {
  it("un particulier ne voit ni prénom ni nom de société : rien de plus à saisir", () => {
    const html = rendre();
    expect(balise(html, "prenom")).toBeUndefined();
    expect(balise(html, "raison_sociale")).toBeUndefined();
    expect(balise(html, "nom")).toContain('required=""');
  });

  it.each(["SCI", "SCI familiale", "Personne morale"])("%s : « Votre prénom » obligatoire à côté du nom de la société", (qualite) => {
    const html = rendre({ valeurs: { qualite } });
    const prenom = balise(html, "prenom");
    expect(prenom).toContain('required=""');
    expect(prenom).toMatch(/autocomplete="given-name"/i);
    expect(html).toMatch(/<label[^>]*for="prenom"[^>]*>Votre prénom<\/label>/);
    // Le texte d'aide dit à qui est ce prénom : la personne qui gère la société.
    expect(html).toContain("identifient la personne qui gère la société");
    expect(prenom).toContain('aria-describedby="aide-societe"');
    // Placé dans le bloc de la société, juste après son nom.
    expect(html.indexOf('name="raison_sociale"')).toBeLessThan(html.indexOf('name="prenom"'));
  });

  it("après un refus, le prénom saisi revient avec le nom de la société", () => {
    const html = rendre({ erreur: "Le code de parrainage n'a pas la bonne forme.", valeurs: { qualite: "SCI", raison_sociale: "SCI du Tilleul", prenom: "Camille" } });
    expect(balise(html, "prenom")).toContain('value="Camille"');
    expect(balise(html, "raison_sociale")).toContain('value="SCI du Tilleul"');
  });
});

describe("inscrireProprietaire : une société sans prénom est refusée, la saisie gardée", () => {
  it.each(["SCI", "SCI familiale", "Personne morale"])("%s sans prénom : message clair, aucun compte créé", async (qualite) => {
    const r = await inscrireProprietaire({}, envoi({ qualite, raison_sociale: "SCI du Tilleul", prenom: "  " }));
    expect(r.erreur).toBe(MESSAGE_PRENOM_REPRESENTANT_REQUIS);
    expect(r.valeurs).toMatchObject({ nom: "Martin", qualite, raison_sociale: "SCI du Tilleul", email: "camille.martin@example.invalid" });
    expect(mocks.inscrire).not.toHaveBeenCalled();
  });

  it("le nom de la société reste demandé en premier", async () => {
    const r = await inscrireProprietaire({}, envoi({ qualite: "SCI" }));
    expect(r.erreur).toBe(MESSAGE_RAISON_SOCIALE_REQUISE);
    expect(mocks.inscrire).not.toHaveBeenCalled();
  });

  it("avec le prénom : le compte part avec prénom, nom et société dans ses métadonnées", async () => {
    const r = await inscrireProprietaire({}, envoi({ qualite: "SCI familiale", raison_sociale: "SCI du Tilleul", prenom: " Camille " }));
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(mocks.inscrire.mock.calls[0][0].metadonnees).toMatchObject({ nom: "Martin", prenom: "Camille", raison_sociale: "SCI du Tilleul", qualite: "SCI familiale" });
  });

  it("un particulier s'inscrit toujours sans prénom", async () => {
    const r = await inscrireProprietaire({}, envoi({ qualite: "Personne physique" }));
    expect(r).toEqual({ message: MESSAGE_BOITE_MAIL });
    expect(mocks.inscrire.mock.calls[0][0].metadonnees).toMatchObject({ nom: "Martin", prenom: "", qualite: "Personne physique" });
  });

  it("un prénom démesuré reste refusé par la borne commune", async () => {
    const r = await inscrireProprietaire({}, envoi({ qualite: "SCI", raison_sociale: "SCI du Tilleul", prenom: "C".repeat(101) }));
    expect(r.erreur).toMatch(/prénom est trop long/);
    expect(mocks.inscrire).not.toHaveBeenCalled();
  });
});
