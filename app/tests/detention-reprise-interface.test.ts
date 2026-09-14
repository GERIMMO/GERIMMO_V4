import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtatParc } from "@/app/actions/parc";

const banc = vi.hoisted(() => ({
  etat: {} as EtatParc,
  etats: [] as unknown[],
  curseur: 0,
  modifie: false,
}));

// Petit banc de transitions du formulaire : conserver les états entre les
// rendus permet de jouer un changement manuel après le retour de l'action.
// Les éléments et leurs handlers sont ceux du composant ; aucun DOM externe
// ni donnée réelle n'est utilisé.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useActionState: () => [banc.etat, () => {}, false],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useState: (initial: unknown) => {
      const index = banc.curseur++;
      if (!(index in banc.etats)) banc.etats[index] = typeof initial === "function" ? initial() : initial;
      return [banc.etats[index], (suivant: unknown) => {
        const valeur = typeof suivant === "function" ? suivant(banc.etats[index]) : suivant;
        if (!Object.is(valeur, banc.etats[index])) {
          banc.etats[index] = valeur;
          banc.modifie = true;
        }
      }];
    },
  };
});
vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: () => ({ etat: banc.etat, soumettre: () => {}, enCours: false, version: 0 }) }));
vi.mock("@/app/actions/parc", () => ({ ajouterDetention: vi.fn() }));

import { FormulaireDetention } from "@/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-detention";

type Personne = { id: string; nom: string; prenom: string | null };
const creee: Personne = { id: "fiche-creee", nom: "Martin", prenom: "Camille" };
const existante: Personne = { id: "fiche-existante", nom: "Durand", prenom: "Lou" };
type Element = ReactElement<Record<string, unknown>>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children as ReactNode)];
}

function rendre(personnes = [existante]) {
  for (let i = 0; i < 8; i++) {
    banc.curseur = 0;
    banc.modifie = false;
    const arbre = FormulaireDetention({
      orgId: "org-test", bienId: "bien-test", lotId: "lot-test",
      personnes, proprietairesIds: [], premierProprietaire: false,
    });
    if (!banc.modifie) return elements(arbre);
  }
  throw new Error("Le formulaire ne stabilise pas son rendu.");
}

function retourCreation() {
  banc.etat = {
    erreur: "Fiche créée, détention refusée",
    personneCreee: creee,
    valeurs: { person_id: creee.id, quote_part: "50", date_debut: "2026-07-01" },
  };
}

beforeEach(() => {
  banc.etat = {};
  banc.etats = [];
  banc.curseur = 0;
  banc.modifie = false;
});

describe("Reprise de détention : l'option créée reste utilisable sans bloquer les autres choix", () => {
  it("sélectionne la fiche créée avant même le rafraîchissement de la liste", () => {
    rendre();
    retourCreation();
    const arbre = rendre();
    expect(arbre.find((e) => e.type === "select")?.props.value).toBe(creee.id);
    expect(arbre.filter((e) => e.type === "option" && e.props.value === creee.id)).toHaveLength(1);
    expect(arbre.find((e) => e.props.name === "quote_part")?.props.defaultValue).toBe("50");
    expect(arbre.find((e) => e.props.name === "date_debut")?.props.valeurSoumise).toBe("2026-07-01");
  });

  it("permet ensuite de choisir manuellement une autre fiche", () => {
    rendre();
    retourCreation();
    const select = rendre().find((e) => e.type === "select")!;
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: existante.id } });
    expect(rendre().find((e) => e.type === "select")?.props.value).toBe(existante.id);
  });

  it("ne double pas l'option quand la liste serveur finit par contenir la nouvelle fiche", () => {
    rendre();
    retourCreation();
    rendre();
    const arbre = rendre([existante, creee]);
    expect(arbre.filter((e) => e.type === "option" && e.props.value === creee.id)).toHaveLength(1);
    expect(arbre.find((e) => e.type === "select")?.props.value).toBe(creee.id);
  });

  it("conserve l'option transitoire si une seconde tentative est encore refusée", () => {
    rendre();
    retourCreation();
    rendre();
    banc.etat = { erreur: "Détention encore refusée", valeurs: { person_id: creee.id, quote_part: "30", date_debut: "2026-07-01" } };
    const arbre = rendre();
    expect(arbre.find((e) => e.type === "select")?.props.value).toBe(creee.id);
    expect(arbre.filter((e) => e.type === "option" && e.props.value === creee.id)).toHaveLength(1);
  });
});
