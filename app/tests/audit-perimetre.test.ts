import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ARRIVEE_APRES_CONNEXION,
  COMPTES_LECTURE,
  PERSONAS,
  RACINES,
  RACINE_PROPRE,
  admissible,
  controleCouverture,
  estCheminDeGestion,
  fabriquerPatron,
  permis,
  routesDuCode,
  versRouteAgence,
} from "../e2e/perimetre-audit.mjs";
import {
  estCheminDeGestion as estCheminDeGestionApp,
  versRouteAgence as versRouteAgenceApp,
} from "@/lib/racine-espace";

// Les audits opérationnels du site publié (e2e/audit-production.mjs, e2e/audit-lecture-live.mjs) explorent chaque profil
// à partir de sa page d'arrivée. Depuis la décision D27, le propriétaire direct arrive sous /espace/<id> (et non plus
// /agence/<id>) : si le périmètre de l'exploration l'ignore, le parcours s'arrête à la première page, sans erreur affichée.
// Ces tests tiennent le périmètre partagé (e2e/perimetre-audit.mjs) aligné sur la règle de l'application.

const ORG = "11111111-2222-4333-8444-555555555555";
const persona = (nom: string) => {
  const p = PERSONAS.find((x: { nom: string }) => x.nom === nom);
  if (!p) throw new Error(`profil introuvable : ${nom}`);
  return p;
};
const racineApp = path.resolve(__dirname, "../src/app");

describe("audit de production : le propriétaire direct est exploré sous /espace", () => {
  it("la connexion réussie est reconnue pour /espaces comme pour /espace/<id>", () => {
    expect(ARRIVEE_APRES_CONNEXION.test("/espaces")).toBe(true);
    expect(ARRIVEE_APRES_CONNEXION.test(`/espace/${ORG}`)).toBe(true);
    expect(ARRIVEE_APRES_CONNEXION.test(`/agence/${ORG}`)).toBe(true);
    expect(ARRIVEE_APRES_CONNEXION.test("/connexion")).toBe(false);
  });

  it("les écrans /espace/<id>/… sont admissibles pour le propriétaire direct", () => {
    const proprietaire = persona("proprietaire");
    expect(admissible(proprietaire, "/espaces")).toBe(true);
    expect(admissible(proprietaire, `/espace/${ORG}`)).toBe(true);
    expect(admissible(proprietaire, `/espace/${ORG}/parc`)).toBe(true);
    expect(admissible(proprietaire, `/espace/${ORG}/comptabilite/fiscal`)).toBe(true);
    expect(admissible(proprietaire, "/compte")).toBe(true);
  });

  it("l'alias /espace n'est ouvert qu'au propriétaire direct : ni l'agence, ni le locataire, ni le public ne le suivent", () => {
    for (const nom of ["agent", "admin", "locataire", "artisan", "public"]) {
      expect(admissible(persona(nom), `/espace/${ORG}/parc`), nom).toBe(false);
    }
  });

  it("l'agence reste explorée sous /agence, et rien d'autre n'a changé pour les autres profils", () => {
    expect(admissible(persona("agent"), `/agence/${ORG}/parc`)).toBe(true);
    expect(admissible(persona("admin"), `/agence/${ORG}/loyers`)).toBe(true);
    expect(admissible(persona("locataire"), `/locataire/${ORG}`)).toBe(true);
    expect(admissible(persona("artisan"), "/artisan/agenda")).toBe(true);
    expect(admissible(persona("agent"), `/api/stripe/webhook`)).toBe(false);
    expect(admissible(persona("public"), "/tarifs")).toBe(true);
    expect(admissible(persona("public"), "/espaces")).toBe(false);
  });
});

describe("audit de lecture : le propriétaire direct est exploré sous /espace", () => {
  const prefixe = (nom: string) => COMPTES_LECTURE.find(([n]: string[]) => n === nom)?.[2] as string;

  it("permis() accepte /espace/<id>/… pour le compte propriétaire, et seulement pour lui", () => {
    expect(permis(`/espace/${ORG}/parc`, prefixe("proprietaire"))).toBe(true);
    expect(permis("/compte", prefixe("proprietaire"))).toBe(true);
    expect(permis(`/espace/${ORG}/parc`, prefixe("agent"))).toBe(false);
    expect(permis(`/agence/${ORG}/parc`, prefixe("agent"))).toBe(true);
  });

  it("le patron d'une adresse /espace/<id>/… est la page du dossier agence correspondante", () => {
    const patron = fabriquerPatron(routesDuCode(racineApp));
    expect(patron(`/espace/${ORG}/parc`)).toBe("/agence/[orgId]/parc");
    expect(patron(`/espace/${ORG}`)).toBe("/agence/[orgId]");
    expect(patron(`/agence/${ORG}/parc`)).toBe("/agence/[orgId]/parc");
    expect(patron("/espaces")).toBe("/espaces");
    expect(patron(`/espace/${ORG}/page-qui-n-existe-pas`)).toBeNull();
  });

  it("chaque écran du propriétaire direct de l'inventaire a un patron dans le code", () => {
    const inventaire: { path: string; persona: string }[] = JSON.parse(
      readFileSync(path.resolve(__dirname, "../e2e/routes-inventaire.json"), "utf8"),
    );
    const patron = fabriquerPatron(routesDuCode(racineApp));
    const sansPatron = inventaire
      .filter((r) => r.persona === "proprietaire" && estCheminDeGestion(r.path))
      .map((r) => r.path.split("?")[0].replace(/\bORG\b/, ORG).replace(/\b[A-Z][A-Z_]+\b/g, "x"))
      .filter((chemin) => patron(chemin) === null);
    expect(sansPatron).toEqual([]);
  });
});

describe("les deux scripts et l'application lisent la même règle de racine", () => {
  const echantillons = [
    `/espace/${ORG}`,
    `/espace/${ORG}/parc?x=1#y`,
    `/agence/${ORG}/parc`,
    "/espaces",
    "/espace",
    "/locataire/x",
    "https://exemple.fr/espace/abc",
    "/",
  ];

  it("versRouteAgence et estCheminDeGestion rendent la même chose que src/lib/racine-espace.ts", () => {
    for (const chemin of echantillons) {
      expect(versRouteAgence(chemin), chemin).toBe(versRouteAgenceApp(chemin));
      expect(estCheminDeGestion(chemin), chemin).toBe(estCheminDeGestionApp(chemin));
    }
  });

  it("chaque profil connecté déclare sa racine propre parmi les racines qu'il explore", () => {
    for (const p of PERSONAS.filter((x: { nom: string }) => x.nom !== "public")) {
      expect(RACINE_PROPRE[p.nom as keyof typeof RACINE_PROPRE], p.nom).toBeTruthy();
      expect(p.racines, p.nom).toContain(RACINE_PROPRE[p.nom as keyof typeof RACINE_PROPRE]);
    }
    expect(RACINES.proprietaire).toContain("/espace/");
    for (const [nom, , racine] of COMPTES_LECTURE as string[][]) {
      expect(racine, nom).toBe(RACINE_PROPRE[(nom === "admin-agence" ? "admin" : nom) as keyof typeof RACINE_PROPRE]);
    }
  });

  it("les deux scripts s'appuient sur le module partagé au lieu de recopier le périmètre", () => {
    const production = readFileSync(path.resolve(__dirname, "../e2e/audit-production.mjs"), "utf8");
    const lecture = readFileSync(path.resolve(__dirname, "../e2e/audit-lecture-live.mjs"), "utf8");
    for (const [nom, source] of [["audit-production.mjs", production], ["audit-lecture-live.mjs", lecture]]) {
      expect(source.includes('from "./perimetre-audit.mjs"'), `${nom} importe le périmètre partagé`).toBe(true);
      expect(/racines:\s*\[/.test(source), `${nom} ne recopie pas les racines`).toBe(false);
      expect(/\["proprietaire",/.test(source), `${nom} ne recopie pas les comptes`).toBe(false);
      expect(source.includes("controleCouverture"), `${nom} applique le contrôle de couverture`).toBe(true);
    }
  });
});

describe("contrôle de couverture : un profil qui n'ouvre aucun de ses écrans fait échouer l'audit", () => {
  it("le propriétaire direct arrêté à l'accueil (/espaces) est signalé", () => {
    const message = controleCouverture("proprietaire", ["/espaces"], [RACINE_PROPRE.proprietaire]);
    expect(message).toContain("proprietaire");
    expect(message).toContain("/espace/");
  });

  it("aucun message dès qu'un écran de sa racine a été visité", () => {
    expect(controleCouverture("proprietaire", ["/espaces", `/espace/${ORG}/parc`], [RACINE_PROPRE.proprietaire])).toBeNull();
    expect(controleCouverture("agent", ["/espaces", `/agence/${ORG}`], [RACINE_PROPRE.agent])).toBeNull();
    expect(controleCouverture("artisan", ["/espaces", "/artisan"], [RACINE_PROPRE.artisan])).toBeNull();
  });

  it("une exploration vide est signalée aussi", () => {
    expect(controleCouverture("locataire", [], [RACINE_PROPRE.locataire])).not.toBeNull();
  });
});
