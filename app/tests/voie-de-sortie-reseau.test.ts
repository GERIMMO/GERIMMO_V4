/**
 * Audit du 13/10/2026, PRO2-01, décision D17 (option A, texte seul) : un propriétaire dont la commune n'est pas ouverte
 * au réseau voyait un bouton grisé et un « carnet vide, sans formulaire d'ajout » : un cul-de-sac. L'écran de
 * sollicitation lui montre désormais la voie de sortie : clôturer l'incident, appeler lui-même l'artisan, signaler son
 * intérêt.
 *
 * NE PAS permettre l'ajout d'un artisan par SIRET (option B, non retenue) : la PR #170 a posé la règle « l'ajout
 * d'artisans est réservé aux agences ». Décision du dirigeant du 15/10/2026 : le propriétaire peut en revanche INVITER
 * un artisan (lien vers son carnet), qui s'inscrit lui-même et que Gerimmo valide. Un test garde les deux : le lien
 * d'invitation est là, aucun ajout par SIRET ni formulaire sur place.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/reseau", () => ({
  confirmerCommuneBien: vi.fn(),
  confirmerCommunesEvidentes: vi.fn(),
  signalerInteretReseau: vi.fn(),
}));

import { VoieDeSortieReseau } from "@/components/disponibilite-reseau";
import { voieDeSortieAffichee, type DisponibiliteReseau } from "@/lib/reseau";

const dispo = (partiel: Partial<DisponibiliteReseau>): DisponibiliteReseau => ({
  metier: "plomberie",
  nature: "entretien_courant",
  etat: "fermee",
  commune_code: "75056",
  commune_nom: "Paris",
  nb_artisans: 0,
  nb_contacts: 0,
  interet_enregistre: false,
  ...partiel,
});

describe("quand la voie de sortie s'affiche", () => {
  it("pour un propriétaire dont la commune n'est pas ouverte et dont le carnet est vide", () => {
    expect(voieDeSortieAffichee(dispo({ etat: "fermee" }), true)).toBe(true);
  });
  it("pour un propriétaire dont la commune est ouverte mais sans artisan disponible", () => {
    expect(voieDeSortieAffichee(dispo({ etat: "sans_artisan" }), true)).toBe(true);
  });
  it("pas quand le réseau est ouvert", () => {
    expect(voieDeSortieAffichee(dispo({ etat: "ouverte", nb_artisans: 2 }), true)).toBe(false);
  });
  it("pas quand son carnet lui permet de continuer (« Ouvrir avec mon carnet »)", () => {
    expect(voieDeSortieAffichee(dispo({ etat: "fermee", nb_contacts: 1 }), true)).toBe(false);
  });
  it("pas quand l'adresse du bien est incomplète : il doit d'abord la compléter", () => {
    expect(voieDeSortieAffichee(dispo({ etat: "adresse_incomplete" }), true)).toBe(false);
  });
  it("pas pour une agence, qui garde son carnet et peut y ajouter un artisan", () => {
    expect(voieDeSortieAffichee(dispo({ etat: "fermee" }), false)).toBe(false);
  });
});

describe("le texte de la voie de sortie", () => {
  const html = renderToStaticMarkup(createElement(VoieDeSortieReseau, { orgId: "org-1", interetEnregistre: false }));
  const texte = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("propose les trois issues : clôturer, appeler soi-même l'artisan, signaler son intérêt", () => {
    expect(texte).toContain("Clôturer l’incident");
    expect(texte).toContain("Appeler vous-même l’artisan de votre choix");
    expect(texte).toContain("Signaler votre intérêt");
  });

  it("renvoie à la section de clôture de la même page", () => {
    expect(html).toContain('href="#cloture"');
  });

  it("dit que le signalement ne déclenche aucun contact", () => {
    expect(texte).toContain("sans déclencher aucun contact");
  });

  it("quand l'intérêt est déjà enregistré, le dit au lieu de renvoyer à un bouton absent", () => {
    const deja = renderToStaticMarkup(createElement(VoieDeSortieReseau, { orgId: "org-1", interetEnregistre: true }))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    expect(deja).toContain("Votre intérêt est déjà enregistré");
    expect(deja).not.toContain("bouton ci-dessous");
  });

  // Décision du dirigeant du 15/10/2026 (remplace la question D17-B) : le propriétaire peut INVITER un artisan, qui
  // s'inscrit lui-même et que Gerimmo valide. L'ajout direct par SIRET reste réservé aux agences (PR #170).
  it("propose d'inviter un artisan depuis le carnet, sans aucun ajout par SIRET ni formulaire sur place", () => {
    expect(texte).toContain("Inviter un artisan que vous connaissez");
    expect(html).toContain('href="/agence/org-1/artisans#inviter-un-artisan"');
    expect(texte).toContain("Gerimmo vérifie son inscription");
    expect(texte).toContain("pour les biens situés dans sa zone d’intervention");
    expect(texte.toLowerCase()).not.toMatch(/siret|ajouter un artisan|réservé aux agences/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });
});

describe("le branchement dans l'écran de sollicitation", () => {
  const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

  it("le formulaire d'ouverture de la mise en concurrence affiche la voie de sortie", () => {
    const source = lire("src/app/agence/[orgId]/incidents/formulaires-artisan.tsx");
    expect(source).toContain("voieDeSortieAffichee(d, estProprietaire)");
    expect(source).toContain("<VoieDeSortieReseau");
  });

  it("le volet artisan lui dit si l'espace est celui d'un propriétaire", () => {
    const source = lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
    expect(source).toMatch(/<FormulaireConsultation[\s\S]*?estProprietaire=\{estProprietaire\}/);
  });

  it("le bouton de sollicitation reste désactivé tant qu'aucun artisan n'est disponible (statu quo conservé)", () => {
    const source = lire("src/app/agence/[orgId]/incidents/formulaires-artisan.tsx");
    expect(source).toContain("disabled={!autorisee}");
  });
});
