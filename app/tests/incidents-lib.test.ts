/**
 * Tests unitaires du référentiel incidents (lib/incidents.ts) — machine à
 * états A5 (module 7), catégories et libellés locataire.
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORIES_INCIDENT,
  COULEURS_ETAT_INCIDENT,
  ETATS_INCIDENT,
  IMPUTATIONS_INCIDENT,
  TRANSITIONS_INCIDENT,
  categorieIncident,
  libelleEtatLocataire,
  titreIncident,
  transitionIncidentPossible,
} from "../src/lib/incidents";

describe("machine à états A5 (module 7)", () => {
  it("suit le cycle nominal : déclaré → qualifié → affecté → en cours → terminé → clos → rouvert → qualifié", () => {
    expect(transitionIncidentPossible("declare", "qualifie")).toBe(true);
    expect(transitionIncidentPossible("qualifie", "affecte")).toBe(true);
    expect(transitionIncidentPossible("affecte", "en_cours")).toBe(true);
    expect(transitionIncidentPossible("en_cours", "termine")).toBe(true);
    expect(transitionIncidentPossible("termine", "clos")).toBe(true);
    expect(transitionIncidentPossible("clos", "rouvert")).toBe(true);
    expect(transitionIncidentPossible("rouvert", "qualifie")).toBe(true);
  });

  it("permet les raccourcis licites : classement (déclaré → clos) et résolution directe (qualifié → clos, RM-7.6.1)", () => {
    expect(transitionIncidentPossible("declare", "clos")).toBe(true);
    expect(transitionIncidentPossible("qualifie", "clos")).toBe(true);
  });

  it("interdit les transitions emblématiques du registre A5", () => {
    // Imputation obligatoire avant affectation (RM-7.2.7)
    expect(transitionIncidentPossible("declare", "affecte")).toBe(false);
    // Compte rendu obligatoire (RM-7.5.1)
    expect(transitionIncidentPossible("en_cours", "clos")).toBe(false);
    // La réouverture repasse par la qualification
    expect(transitionIncidentPossible("clos", "declare")).toBe(false);
    expect(transitionIncidentPossible("rouvert", "clos")).toBe(false);
    // Un refus d'artisan revient à « qualifié », jamais en arrière complet
    expect(transitionIncidentPossible("affecte", "declare")).toBe(false);
  });

  it("chaque état a un libellé et une puce de couleur", () => {
    const etats = Object.keys(TRANSITIONS_INCIDENT);
    expect(Object.keys(ETATS_INCIDENT).sort()).toEqual(etats.sort());
    for (const etat of etats) {
      expect(COULEURS_ETAT_INCIDENT[etat]).toMatch(/^puce puce-/);
    }
  });
});

describe("catégories d'incident", () => {
  it("a des slugs uniques et des libellés remplis", () => {
    const slugs = CATEGORIES_INCIDENT.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CATEGORIES_INCIDENT) {
      expect(c.libelle.length).toBeGreaterThan(0);
      expect(c.court.length).toBeGreaterThan(0);
    }
  });

  it("le repère juridique pointe une imputation connue, avec son fondement", () => {
    for (const c of CATEGORIES_INCIDENT) {
      if (!c.repere) continue;
      expect(Object.keys(IMPUTATIONS_INCIDENT)).toContain(c.repere.charge);
      expect(c.repere.fondement.length).toBeGreaterThan(0);
    }
  });

  it("titreIncident retombe sur la valeur brute pour une catégorie inconnue", () => {
    expect(titreIncident("plomberie_joint")).toBe("Fuite / robinetterie");
    expect(titreIncident("categorie_disparue")).toBe("categorie_disparue");
    expect(categorieIncident("inexistante")).toBeUndefined();
  });
});

describe("libellés locataire (traduction maquette)", () => {
  it("parle au locataire dans ses mots, jamais en vocabulaire interne", () => {
    expect(libelleEtatLocataire("declare", null)).toBe("Reçu — votre gérant l'examine");
    expect(libelleEtatLocataire("rouvert", "locataire")).toBe(
      "Rouvert — votre gérant le réexamine"
    );
    expect(libelleEtatLocataire("clos", null)).toBe("Clos");
  });

  it("distingue l'imputation une fois l'incident qualifié", () => {
    expect(libelleEtatLocataire("qualifie", "proprietaire")).toBe(
      "Pris en charge par le propriétaire"
    );
    expect(libelleEtatLocataire("qualifie", "locataire")).toBe("À votre charge");
    // La dégradation fautive reste à la charge du locataire
    expect(libelleEtatLocataire("qualifie", "degradation_fautive")).toBe("À votre charge");
  });
});
