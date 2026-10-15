/**
 * Décision D27 : les deux racines des écrans de gestion. Le module est la seule source des adresses émises.
 */
import { describe, expect, it } from "vitest";
import {
  ENTETE_ALIAS,
  RACINE_AGENCE,
  RACINE_PROPRIETAIRE,
  baseDepuisRacine,
  baseEspace,
  cheminPourProfil,
  decisionAlias,
  estCheminDeGestion,
  estDejaReecrite,
  lireCheminDeGestion,
  racineEspace,
  versEspaceProprietaire,
  versRouteAgence,
} from "@/lib/racine-espace";

const ID = "3c1d7a52-1f0e-4f6b-8d2b-5b9a2f4e6c11";

describe("racines", () => {
  it("le propriétaire direct a /espace, l'agence garde /agence", () => {
    expect(RACINE_PROPRIETAIRE).toBe("/espace");
    expect(RACINE_AGENCE).toBe("/agence");
    expect(racineEspace(true)).toBe("/espace");
    expect(racineEspace(false)).toBe("/agence");
    expect(baseEspace(ID, true)).toBe(`/espace/${ID}`);
    expect(baseEspace(ID, false)).toBe(`/agence/${ID}`);
  });

  it("baseDepuisRacine : /espace reconnu, toute autre valeur (absente, inconnue) donne /agence", () => {
    expect(baseDepuisRacine(ID, "/espace")).toBe(`/espace/${ID}`);
    expect(baseDepuisRacine(ID, "/agence")).toBe(`/agence/${ID}`);
    expect(baseDepuisRacine(ID)).toBe(`/agence/${ID}`);
    expect(baseDepuisRacine(ID, "https://exemple.test")).toBe(`/agence/${ID}`);
  });
});

describe("versEspaceProprietaire / cheminPourProfil", () => {
  it.each([
    ["/agence/org", "/espace/org"],
    ["/agence/org/parc", "/espace/org/parc"],
    ["/agence/org/parc/b/lots/l?parcours=1&etape=lot#baux", "/espace/org/parc/b/lots/l?parcours=1&etape=lot#baux"],
    ["/agence/org?x=1", "/espace/org?x=1"],
    ["/agence/org#loyers", "/espace/org#loyers"],
  ])("%s → %s", (de, vers) => expect(versEspaceProprietaire(de)).toBe(vers));

  it.each(["/locataire/org/documents", "/espaces", "/admin/organisations/org", "https://exemple.test/agence/org", "/veille?retour=/agence/org", "/agenceX/org", "/compte"])(
    "%s est rendu tel quel",
    (chemin) => expect(versEspaceProprietaire(chemin)).toBe(chemin),
  );

  it("cheminPourProfil ne change que le chemin d'un propriétaire direct", () => {
    expect(cheminPourProfil("/agence/org/parc", true)).toBe("/espace/org/parc");
    expect(cheminPourProfil("/agence/org/parc", false)).toBe("/agence/org/parc");
  });

  it("versRouteAgence fait le chemin inverse (route réelle des dossiers)", () => {
    expect(versRouteAgence("/espace/org/parc?x=1")).toBe("/agence/org/parc?x=1");
    expect(versRouteAgence("/agence/org/parc")).toBe("/agence/org/parc");
  });

  it("estCheminDeGestion reconnaît les deux racines, pas les voisines", () => {
    expect(estCheminDeGestion("/agence/org/parc")).toBe(true);
    expect(estCheminDeGestion("/espace/org")).toBe(true);
    expect(estCheminDeGestion("/espaces")).toBe(false);
    expect(estCheminDeGestion("/locataire/org")).toBe(false);
  });
});

describe("lireCheminDeGestion", () => {
  it("découpe racine, organisation et suite", () => {
    expect(lireCheminDeGestion(`/agence/${ID}`)).toEqual({ racine: "agence", orgId: ID, suite: "" });
    expect(lireCheminDeGestion(`/espace/${ID}/parc/b1`)).toEqual({ racine: "espace", orgId: ID, suite: "/parc/b1" });
    expect(lireCheminDeGestion(`/ESPACE/${ID.toUpperCase()}/x`)).toEqual({ racine: "espace", orgId: ID, suite: "/x" });
    expect(lireCheminDeGestion(`/agence/${ID}/`)).toEqual({ racine: "agence", orgId: ID, suite: "/" });
  });

  it.each(["/agence/alpha", "/espace/123/parc", `/agence/${ID}x`, `/agenceX/${ID}`, `/espaces/${ID}`, `/locataire/${ID}`, "/", "", `//espace/${ID}`])(
    "%s n'est pas une adresse de gestion (le proxy n'y touche pas)",
    (chemin) => expect(lireCheminDeGestion(chemin)).toBeNull(),
  );
});

describe("decisionAlias", () => {
  const agence = lireCheminDeGestion(`/agence/${ID}/parc`)!;
  const espace = lireCheminDeGestion(`/espace/${ID}/parc`)!;

  it("/espace : réécrit pour une organisation de propriétaire direct, introuvable pour tout le reste", () => {
    expect(decisionAlias(espace, "proprietaire_direct", "GET")).toBe("reecrire");
    expect(decisionAlias(espace, "proprietaire_direct", "POST")).toBe("reecrire");
    for (const type of ["agence", "autre", null]) expect(decisionAlias(espace, type, "GET")).toBe("introuvable");
  });

  it("/agence d'un propriétaire direct : 308 en lecture, servi tel quel pour un envoi", () => {
    expect(decisionAlias(agence, "proprietaire_direct", "GET")).toBe("rediriger");
    expect(decisionAlias(agence, "proprietaire_direct", "HEAD")).toBe("rediriger");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(decisionAlias(agence, "proprietaire_direct", m)).toBe("passer");
  });

  it("/agence d'une agence ou d'une organisation inconnue : inchangé", () => {
    for (const type of ["agence", null]) for (const m of ["GET", "POST"]) expect(decisionAlias(agence, type, m)).toBe("passer");
  });

  it("une adresse que le proxy vient de réécrire n'est pas redirigée une seconde fois (Next.js rappelle le proxy)", () => {
    expect(decisionAlias(agence, "proprietaire_direct", "GET", true)).toBe("passer");
    expect(decisionAlias(agence, "proprietaire_direct", "HEAD", true)).toBe("passer");
    // … et la marque n'ajoute aucun droit : elle ne change ni l'alias ni les autres organisations.
    expect(decisionAlias(espace, "proprietaire_direct", "GET", true)).toBe("reecrire");
    expect(decisionAlias(espace, "agence", "GET", true)).toBe("introuvable");
    expect(decisionAlias(espace, null, "GET", true)).toBe("introuvable");
    expect(decisionAlias(agence, "agence", "GET", true)).toBe("passer");
  });
});

describe("estDejaReecrite", () => {
  const agence = lireCheminDeGestion(`/agence/${ID}/parc`)!;
  const espace = lireCheminDeGestion(`/espace/${ID}/parc`)!;
  const AUTRE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

  it("n'est vraie que sur /agence, pour l'organisation que la marque nomme", () => {
    expect(ENTETE_ALIAS).toBe("x-gerimmo-alias-espace");
    expect(estDejaReecrite(agence, ID)).toBe(true);
    expect(estDejaReecrite(agence, ` ${ID.toUpperCase()} `)).toBe(true);
    expect(estDejaReecrite(agence, AUTRE)).toBe(false);
    expect(estDejaReecrite(agence, null)).toBe(false);
    expect(estDejaReecrite(agence, "")).toBe(false);
    expect(estDejaReecrite(agence, "1")).toBe(false);
    expect(estDejaReecrite(espace, ID)).toBe(false);
  });
});
