/**
 * Décision du 27/10 (audit #264, CB-14) : le formulaire d'inventaire du bail meublé rendu sans navigateur.
 *
 * Les hooks d'action renvoient l'état simulé pour l'action nommée (`bound ajouterMobilierDecret`…) ; `useState(null)`
 * (ligne ouverte en modification) renvoie `sim.ouvert`. Le bouton d'envoi est réputé hydraté. On lit le HTML produit.
 *
 * Ce qui est gardé : le geste « Ajouter les 11 éléments obligatoires » et son explication ; une ligne sans état se dit
 * « à préciser » et se complète sur place (quantité, état) ; une ligne renseignée se modifie ; le message du geste groupé
 * s'affiche une seule fois ; la liste du décret vient de lib/inventaire-meuble.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatBail } from "@/app/actions/baux";
import { MOBILIER_DECRET_2015_981 } from "@/lib/inventaire-meuble";

const sim = vi.hoisted(() => ({ ouvert: null as null | object, etats: {} as Record<string, object> }));

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  return {
    ...reel,
    useState: (initial: unknown) => (initial === null ? [sim.ouvert, () => {}] : [initial, () => {}]),
  };
});
vi.mock("@/lib/use-hydrate", () => ({ useHydrate: () => true, AIDE_BOUTON_EN_ATTENTE: "" }));
vi.mock("@/lib/use-action-state-protegee", () => ({
  useActionStateProtegee: (action: { name: string }, initial: unknown) => [sim.etats[action.name] ?? initial, () => {}],
}));
vi.mock("@/app/actions/baux", () => ({
  ajouterInventaireLigne: async function ajouterInventaireLigne() {},
  ajouterMobilierDecret: async function ajouterMobilierDecret() {},
  modifierInventaireLigne: async function modifierInventaireLigne() {},
  supprimerInventaireLigne: async function supprimerInventaireLigne() {},
}));

import { FormulaireInventaire, type LigneInventaire } from "@/app/agence/[orgId]/baux/[bailId]/formulaire-inventaire";

const PLAQUES: LigneInventaire = { id: "l1", piece: null, designation: "Plaques de cuisson", quantite: 1, etat: null, observation: null };
const TABLE: LigneInventaire = { id: "l2", piece: "Séjour", designation: "Table et sièges", quantite: 4, etat: "bon", observation: null };

function rendu(lignes: LigneInventaire[]) {
  return renderToStaticMarkup(createElement(FormulaireInventaire, { orgId: "org", bailId: "bail", lignes }));
}
const forms = (html: string) => Array.from(html.matchAll(/<form[^>]*>/g)).map((m) => m[0]);

beforeEach(() => { sim.ouvert = null; sim.etats = {}; });

describe("ajout groupé du mobilier du décret", () => {
  it("propose le geste au-dessus d'un inventaire vide, avec son explication et la liste partagée", () => {
    const html = rendu([]);
    expect(html).toContain("Ajouter les 11 éléments obligatoires");
    expect(html).toContain("Une ligne par élément, quantité et état à préciser ensuite.");
    expect(html.replace(/&#x27;/g, "'")).toContain(MOBILIER_DECRET_2015_981.join(" · ")); // apostrophe échappée par React
    expect(forms(html).find((f) => f.includes("data-saisie-libre"))).toBeTruthy();
    expect(html).toContain("Aucun meuble inventorié");
  });
  it("affiche le compte rendu du geste une seule fois", () => {
    sim.etats["bound ajouterMobilierDecret"] = { succes: "9 éléments ajoutés à l'inventaire : précisez l'état et la quantité de chacun. 2 éléments déjà présents." } satisfies EtatBail;
    const html = rendu([PLAQUES]);
    expect(html.match(/2 éléments déjà présents/g)).toHaveLength(1);
    expect(html).toMatch(/<p role="status"[^>]*>9 éléments ajoutés/);
  });
});

describe("lignes à compléter", () => {
  it("dit l'état manquant et propose de le compléter ; une ligne renseignée se modifie", () => {
    const html = rendu([PLAQUES, TABLE]);
    expect(html).toContain("État à préciser");
    expect(html).toContain('aria-label="Compléter Plaques de cuisson"');
    expect(html).toContain('aria-label="Modifier Table et sièges"');
    expect(html).toContain("4× ");
    expect(html).toContain(">Bon<");
    expect(html).not.toContain('id="inv-l1-etat"'); // fermée : aucun champ de modification de la ligne
  });
  it("ouvre sur place la quantité et l'état, « À préciser » par défaut, avec Enregistrer et Annuler", () => {
    const ouvert = {};
    sim.ouvert = ouvert; sim.etats["bound modifierInventaireLigne"] = ouvert;
    const html = rendu([PLAQUES]);
    expect(html).toContain('aria-label="Compléter Plaques de cuisson"');
    expect(html).toMatch(/<form data-saisie-confirmee[^>]*aria-label="Compléter Plaques de cuisson"/);
    expect(html).toMatch(/<input[^>]*id="inv-l1-quantite"[^>]*value="1"/);
    expect(html).toMatch(/<select[^>]*id="inv-l1-etat"/);
    expect(html).toMatch(/<option value="" selected="">À préciser<\/option>/);
    expect(html).toContain(">Enregistrer<");
    expect(html).toContain(">Annuler<");
  });
  it("garde la ligne ouverte sur une erreur et la referme après un enregistrement réussi", () => {
    const ouvert = { erreur: "La quantité doit être au moins 1.", valeurs: { quantite: "0", etat: "bon" } } satisfies EtatBail;
    sim.ouvert = {}; sim.etats["bound modifierInventaireLigne"] = ouvert;
    const enErreur = rendu([PLAQUES]);
    expect(enErreur).toContain("La quantité doit être au moins 1.");
    expect(enErreur).toMatch(/<input[^>]*id="inv-l1-quantite"[^>]*value="0"/);
    sim.etats["bound modifierInventaireLigne"] = { succes: "Meuble mis à jour." };
    expect(rendu([PLAQUES])).not.toContain('id="inv-l1-etat"');
  });
});
