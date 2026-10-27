import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { IncidentVerification } from "@/lib/incidents-verifications";

const gestes = vi.hoisted(() => ({
  attribuerIncident: vi.fn(),
  cloturerIncident: vi.fn(),
  joindrePhotoIncident: vi.fn(),
  qualifierIncident: vi.fn(),
  rouvrirIncident: vi.fn(),
}));
vi.mock("@/app/actions/incidents", () => gestes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ActionsRapidesIncident, retablirFocusApresIncident } from "@/components/actions-rapides-incident";

const fiche = "/espace/org/incidents/incident-1";
const incident: IncidentVerification = {
  id: "incident-1",
  etat: "declare",
  categorie: "plomberie_canalisation",
  description: "Une fuite est visible sous l’évier.",
  imputation: null,
  imputation_justification: null,
  imputation_contestation: null,
  declarant_person_id: "locataire-1",
  bail_id: "bail-1",
};
const rendre = (modifications: Partial<IncidentVerification> = {}, lectureSeule = false) =>
  renderToStaticMarkup(createElement(ActionsRapidesIncident, {
    orgId: "org", href: fiche, incident: { ...incident, ...modifications }, lectureSeule,
  }));
const libellesBoutons = (html: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
  .map(([, contenu]) => contenu.replace(/<[^>]*>/g, ""));

afterEach(() => vi.clearAllMocks());

describe("Actions rapides d’un incident dans les vérifications", () => {
  it.each(["declare", "rouvert"])("%s : propose de décider et joindre une photo, sans clôture prématurée", etat => {
    expect(libellesBoutons(rendre({ etat }))).toEqual(["Décider qui paie", "Ajouter une photo"]);
  });

  it("une qualification déjà décidée propose la clôture et la photo, sans demander une nouvelle décision", () => {
    expect(libellesBoutons(rendre({ etat: "qualifie", imputation: "proprietaire" })))
      .toEqual(["Clôturer l’incident", "Ajouter une photo"]);
  });

  it("une qualification incomplète permet encore de décider la prise en charge", () => {
    expect(libellesBoutons(rendre({ etat: "qualifie" })))
      .toEqual(["Décider qui paie", "Clôturer l’incident", "Ajouter une photo"]);
  });

  it.each(["qualifie", "affecte"])("%s contesté : permet la révision de la décision", etat => {
    const boutons = libellesBoutons(rendre({
      etat, imputation: "locataire", imputation_contestation: "La canalisation était déjà vétuste.",
    }));
    expect(boutons).toContain("Décider qui paie");
    expect(boutons).toContain("Ajouter une photo");
    expect(boutons.includes("Clôturer l’incident")).toBe(etat === "qualifie");
  });

  it.each(["affecte", "en_cours"])("%s sans contestation : laisse la photo disponible, sans sauter les étapes", etat => {
    expect(libellesBoutons(rendre({ etat, imputation: "proprietaire" }))).toEqual(["Ajouter une photo"]);
  });

  it("une intervention terminée permet la clôture et une dernière photo", () => {
    expect(libellesBoutons(rendre({ etat: "termine", imputation: "proprietaire" })))
      .toEqual(["Clôturer l’incident", "Ajouter une photo"]);
  });

  it("un incident clos garde seulement l’accès à sa fiche et son historique", () => {
    const html = rendre({ etat: "clos", imputation: "proprietaire" });
    expect(libellesBoutons(html)).toEqual([]);
    expect(html).toContain(`href="${fiche}"`);
    expect(html).toContain("Voir la fiche incident");
  });

  it("un état inconnu garde la consultation sans inventer une action autorisée", () => {
    const html = rendre({ etat: "etat_inconnu", imputation_contestation: "Décision contestée" });
    expect(libellesBoutons(html)).toEqual([]);
    expect(html).not.toContain("<form");
    expect(html).toContain(`href="${fiche}"`);
  });

  it.each(["declare", "rouvert", "qualifie", "affecte", "en_cours", "termine", "clos"])(
    "lecture seule, %s : aucune mutation proposée, mais la fiche reste consultable", etat => {
      const html = rendre({ etat, imputation_contestation: "Décision contestée" }, true);
      expect(libellesBoutons(html)).toEqual([]);
      expect(html).not.toContain("<form");
      expect(html).toContain(`href="${fiche}"`);
    },
  );

  it("l’ouverture des vérifications n’exécute aucun geste et laisse les formulaires fermés", () => {
    const html = rendre({ etat: "qualifie", imputation_contestation: "Décision contestée" });
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("type=\"submit\"");
    for (const geste of Object.values(gestes)) expect(geste).not.toHaveBeenCalled();
  });

  it("la consultation ouvre la fiche exacte dans le même onglet, sans acquittement de l’alerte", () => {
    const html = rendre();
    const liens = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    expect(liens).toHaveLength(1);
    expect(liens[0][1]).toContain(`href="${fiche}"`);
    expect(liens[0][1]).not.toContain("target=");
    expect(liens[0][2]).toContain("Voir la fiche incident");
    expect(html).not.toContain("Confirmer la prise en charge");
    expect(html).toContain("Une fuite est visible sous l’évier.");
  });

  it("plusieurs incidents ont leurs propres panneaux de saisie", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(ActionsRapidesIncident, { orgId: "org", href: fiche, incident }),
      createElement(ActionsRapidesIncident, { orgId: "org", href: "/espace/org/incidents/incident-2", incident: { ...incident, id: "incident-2" } }),
    ));
    const cibles = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(([, id]) => id);
    expect(cibles).toHaveLength(4);
    expect(new Set(cibles).size).toBe(4);
  });
});

describe("Retour du clavier après le traitement d’un incident", () => {
  function environnement({ dansFenetre = true, cachee = false, focus = "incident" }: {
    dansFenetre?: boolean;
    cachee?: boolean;
    focus?: "incident" | "body" | "ailleurs";
  } = {}) {
    const body = {};
    const champ = {};
    const ailleurs = {};
    const cible = {
      closest: vi.fn(() => cachee ? {} : null),
      hasAttribute: vi.fn(() => false),
      matches: vi.fn(() => dansFenetre),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      focus: vi.fn(),
    };
    const fenetre = { querySelector: vi.fn(() => cible) };
    const racine = {
      ownerDocument: { body, activeElement: focus === "incident" ? champ : focus === "body" ? body : ailleurs },
      contains: vi.fn((element: unknown) => element === champ),
      closest: vi.fn((selecteur: string) => selecteur === "main" ? cible : dansFenetre ? fenetre : null),
    };
    return { racine: racine as unknown as HTMLElement, cible };
  }

  it.each(["incident", "body"] as const)("focus sur %s : le replace sur la fermeture stable de la fenêtre", focus => {
    const { racine, cible } = environnement({ focus });
    retablirFocusApresIncident(racine);
    expect(cible.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(cible.setAttribute).not.toHaveBeenCalled();
  });

  it("ne vole pas le focus déplacé sur une autre demande pendant l’enregistrement", () => {
    const { racine, cible } = environnement({ focus: "ailleurs" });
    retablirFocusApresIncident(racine);
    expect(cible.focus).not.toHaveBeenCalled();
  });

  it("ne rouvre pas une fenêtre déjà refermée pendant l’enregistrement", () => {
    const { racine, cible } = environnement({ cachee: true, focus: "body" });
    retablirFocusApresIncident(racine);
    expect(cible.focus).not.toHaveBeenCalled();
  });

  it("hors fenêtre, utilise la page sans ajouter un arrêt permanent à la tabulation", () => {
    const { racine, cible } = environnement({ dansFenetre: false });
    retablirFocusApresIncident(racine);
    expect(cible.setAttribute).toHaveBeenCalledWith("tabindex", "-1");
    expect(cible.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(cible.removeAttribute).toHaveBeenCalledWith("tabindex");
  });
});
