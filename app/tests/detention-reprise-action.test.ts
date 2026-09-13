import { beforeEach, describe, expect, it, vi } from "vitest";

type PersonneEnregistree = { id: string; nom: string; prenom: string | null; email: string };
const banc = vi.hoisted(() => ({
  personnes: [] as PersonneEnregistree[],
  totalDetenu: 80,
  erreurCreation: null as { message: string } | null,
  creerPersonne: vi.fn(),
  creerDetention: vi.fn(),
  revalider: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "gerant-test" },
    supabase: {
      from: (table: string) => {
        let emailRecherche = "";
        const requete = {
          select: () => requete,
          eq: () => requete,
          ilike: (_colonne: string, email: string) => {
            emailRecherche = email;
            return requete;
          },
          is: async () => ({ data: banc.personnes.filter((p) => p.email === emailRecherche), error: null }),
          insert: (valeurs: Record<string, unknown>) => {
            if (table === "persons") {
              return {
                select: () => ({
                  single: async () => {
                    banc.creerPersonne(valeurs);
                    if (banc.erreurCreation) return { data: null, error: banc.erreurCreation };
                    const personne: PersonneEnregistree = {
                      id: `personne-creee-${banc.personnes.length + 1}`,
                      nom: String(valeurs.nom),
                      prenom: valeurs.prenom === null ? null : String(valeurs.prenom),
                      email: String(valeurs.email),
                    };
                    banc.personnes.push(personne);
                    return { data: { id: personne.id, nom: personne.nom, prenom: personne.prenom }, error: null };
                  },
                }),
              };
            }
            banc.creerDetention(valeurs);
            if (banc.totalDetenu + Number(valeurs.quote_part) > 100) {
              return Promise.resolve({ error: { message: "La somme des quote-parts actives dépasserait 100 %" } });
            }
            banc.totalDetenu += Number(valeurs.quote_part);
            return Promise.resolve({ error: null });
          },
        };
        return requete;
      },
    },
  }),
}));

import { ajouterDetention } from "@/app/actions/parc";

beforeEach(() => {
  vi.clearAllMocks();
  banc.personnes = [];
  banc.totalDetenu = 80;
  banc.erreurCreation = null;
});

function nouvellePersonne() {
  const saisie = new FormData();
  saisie.set("person_id", "nouvelle");
  saisie.set("nouveau_nom", "Martin");
  saisie.set("nouveau_prenom", "Camille");
  saisie.set("nouveau_email", "camille@recette.test");
  saisie.set("quote_part", "50");
  saisie.set("date_debut", "2026-07-01");
  return saisie;
}

const enregistrer = (saisie: FormData) => ajouterDetention("org-test", "bien-test", "lot-test", {}, saisie);

describe("Détention refusée : reprendre la fiche effectivement créée", () => {
  it("après 80 % + 50 % refusés, reprend à 20 % avec la même fiche et la même date", async () => {
    const premier = await enregistrer(nouvellePersonne());
    expect(premier.erreur).toContain("La fiche propriétaire a été créée");
    expect(premier.succes).toBeUndefined();
    expect(premier.personneCreee).toEqual({ id: "personne-creee-1", nom: "Martin", prenom: "Camille" });
    expect(premier.valeurs).toMatchObject({
      person_id: "personne-creee-1", quote_part: "50", date_debut: "2026-07-01",
    });
    expect(banc.totalDetenu).toBe(80);

    const reprise = new FormData();
    Object.entries(premier.valeurs!).forEach(([cle, valeur]) => reprise.set(cle, valeur));
    reprise.set("quote_part", "20");
    const second = await enregistrer(reprise);

    expect(second.succes).toBe("Détention enregistrée.");
    expect(banc.creerPersonne).toHaveBeenCalledOnce();
    expect(banc.personnes).toHaveLength(1);
    expect(banc.creerDetention).toHaveBeenLastCalledWith({
      lot_id: "lot-test", organization_id: "org-test", person_id: "personne-creee-1",
      quote_part: 20, date_debut: "2026-07-01",
    });
    expect(banc.totalDetenu).toBe(100);
  });

  it("rafraîchit les fiches et la liste même si la détention est refusée", async () => {
    await enregistrer(nouvellePersonne());
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org-test/personnes");
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org-test/personnes/personne-creee-1");
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org-test/parc/bien-test/lots/lot-test");
  });

  it("ne prétend pas avoir créé une fiche quand sa création échoue", async () => {
    banc.erreurCreation = { message: "Création refusée" };
    const resultat = await enregistrer(nouvellePersonne());
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.personneCreee).toBeUndefined();
    expect(resultat.valeurs?.person_id).toBe("nouvelle");
    expect(banc.personnes).toHaveLength(0);
    expect(banc.creerDetention).not.toHaveBeenCalled();
  });

  it("ne choisit jamais une autre fiche uniquement parce que son email correspond", async () => {
    banc.personnes = [{ id: "autre-fiche", nom: "Autre", prenom: "Identité", email: "camille@recette.test" }];
    const resultat = await enregistrer(nouvellePersonne());
    expect(resultat.erreur).toContain("choisissez la personne existante");
    expect(resultat.personneCreee).toBeUndefined();
    expect(resultat.valeurs?.person_id).toBe("nouvelle");
    expect(banc.creerPersonne).not.toHaveBeenCalled();
    expect(banc.creerDetention).not.toHaveBeenCalled();
  });

  it("une détention refusée pour une fiche existante n'annonce aucune création", async () => {
    const saisie = nouvellePersonne();
    saisie.set("person_id", "personne-existante");
    const resultat = await enregistrer(saisie);
    expect(resultat.erreur).toContain("quote-parts");
    expect(resultat.personneCreee).toBeUndefined();
    expect(resultat.valeurs?.person_id).toBe("personne-existante");
    expect(banc.creerPersonne).not.toHaveBeenCalled();
  });
});
