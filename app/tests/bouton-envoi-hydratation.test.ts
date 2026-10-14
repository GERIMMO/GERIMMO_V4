/**
 * Décision D30 B (fiche PR178-B-04 du 13/10/2026) : sur les formulaires protégés, un clic sur « Envoyer » avant la fin du
 * chargement du script ne faisait rien, sans un mot (l'envoi passe par une fonction du navigateur, pas par le formulaire
 * du HTML). Le bouton d'envoi commun (`BoutonEnvoi`) est donc inerte dans le HTML du serveur et ne s'active qu'à
 * l'hydratation. Les formulaires que le navigateur sait envoyer seul (action serveur passée telle quelle) ne l'attendent pas.
 *
 * Ces tests rendent le composant côté serveur — c'est exactement le HTML que voit le téléphone avant que le script
 * n'arrive. Le passage à « actif » après hydratation se vérifie au navigateur (voir le compte rendu du lot).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement, type ElementType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoutonEnvoi } from "../src/components/ui/bouton-envoi";
import { AIDE_BOUTON_EN_ATTENTE, useHydrate } from "../src/lib/use-hydrate";

const RACINE = path.resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(path.join(RACINE, chemin), "utf8");
const rendre = (type: ElementType, props: Record<string, unknown> | null, ...enfants: ReactNode[]) =>
  renderToStaticMarkup(createElement(type, props, ...enfants));

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
    return chemin.endsWith(".tsx") ? [chemin] : [];
  });
}
const relatif = (f: string) => path.relative(RACINE, f).split(path.sep).join("/");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("useHydrate", () => {
  it("est faux dans le HTML du serveur (avant que le script n'arrive)", () => {
    const Sonde = () => createElement("span", null, useHydrate() ? "prete" : "en-attente");
    expect(rendre(Sonde, null)).toBe("<span>en-attente</span>");
  });
});

describe("BoutonEnvoi avant l'hydratation (D30 B)", () => {
  it("est désactivé dans un formulaire, avec une infobulle qui dit pourquoi", () => {
    const html = rendre("form", null, createElement(BoutonEnvoi, null, "Enregistrer"));
    expect(html).toMatch(/<button[^>]*\bdisabled=""/);
    expect(html).toContain(`title="${AIDE_BOUTON_EN_ATTENTE}"`);
    expect(html).toContain("Enregistrer");
    expect(html).toContain('type="submit"');
  });

  it("garde son libellé : aucun texte n'est remplacé pendant l'attente de la page", () => {
    const html = rendre(BoutonEnvoi, { enCoursTexte: "Enregistrement…" }, "Enregistrer");
    expect(html).toContain("Enregistrer");
    expect(html).not.toContain("Enregistrement…");
  });

  it("`envoiNatif` : un formulaire que le navigateur envoie seul n'attend pas la page", () => {
    const html = rendre("form", null, createElement(BoutonEnvoi, { envoiNatif: true }, "Créer mon compte"));
    // (« disabled: » figure dans les classes du bouton : on cherche l'attribut, pas le mot.)
    expect(html).not.toMatch(/\bdisabled=""/);
    expect(html).not.toContain(AIDE_BOUTON_EN_ATTENTE);
  });

  it("reste désactivé quand l'appelant le demande, page prête ou non", () => {
    expect(rendre(BoutonEnvoi, { envoiNatif: true, disabled: true }, "Envoyer")).toMatch(/\bdisabled=""/);
  });

  it("respecte une infobulle de l'appelant et la roue d'un envoi en cours", () => {
    expect(rendre(BoutonEnvoi, { envoiNatif: true, title: "Tout est prêt" }, "Envoyer")).toContain('title="Tout est prêt"');
    const enCours = rendre(BoutonEnvoi, { envoiNatif: true, enCours: true, enCoursTexte: "Envoi…" }, "Envoyer");
    expect(enCours).toMatch(/\bdisabled=""/);
    expect(enCours).toContain("Envoi…");
    expect(enCours).toContain("animate-spin");
  });
});

describe("qui attend la page, qui n'attend pas", () => {
  const fichiers = fichiersTsx(path.join(RACINE, "src")).map((f) => ({ f: relatif(f), source: sansCommentaires(readFileSync(f, "utf8")) }));
  const HOOKS_DE_PROTECTION = /\buse(ActionFormulaire|ActionStateProtegee|ActionRetour|ActionStateSuivi)\b/;

  // Les seuls formulaires dont l'action est une action serveur passée telle quelle à useActionState de React : le
  // navigateur les envoie sans script (le « témoin » de la fiche : /inscription).
  const ENVOI_NATIF = [
    "src/app/inscription/formulaire-inscription.tsx",
    "src/app/mot-de-passe-oublie/formulaire-reinitialisation.tsx",
    "src/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe.tsx",
    "src/app/compte/formulaire-mot-de-passe.tsx",
    "src/app/invitations/[invitationId]/reponse.tsx",
  ];

  const balisesBouton = (source: string) => [...source.matchAll(/<BoutonEnvoi\b[^>]*>/g)].map((m) => m[0]);

  it("exactement ces cinq fichiers déclarent `envoiNatif`, sur chacun de leurs boutons", () => {
    const declarant = fichiers.filter(({ source }) => balisesBouton(source).some((b) => /\benvoiNatif\b/.test(b))).map(({ f }) => f).sort();
    expect(declarant).toEqual([...ENVOI_NATIF].sort());
    for (const f of ENVOI_NATIF) {
      const balises = balisesBouton(fichiers.find((x) => x.f === f)!.source);
      expect(balises.length, f).toBeGreaterThan(0);
      for (const b of balises) expect(b, f).toMatch(/\benvoiNatif\b/);
    }
  });

  it("aucun formulaire à `envoiNatif` ne passe par un crochet de protection (il ne s'enverrait pas sans script)", () => {
    for (const f of ENVOI_NATIF) {
      const { source } = fichiers.find((x) => x.f === f)!;
      expect(HOOKS_DE_PROTECTION.test(source), f).toBe(false);
      expect(source, f).toMatch(/useActionState[<(]/);
      expect(source, f).toMatch(/from "react"/);
    }
  });

  it("tout formulaire protégé qui emploie BoutonEnvoi l'attend : jamais d'`envoiNatif` à côté d'un crochet de protection", () => {
    const fautifs = fichiers
      .filter(({ source }) => HOOKS_DE_PROTECTION.test(source) && balisesBouton(source).some((b) => /\benvoiNatif\b/.test(b)))
      .map(({ f }) => f);
    expect(fautifs).toEqual([]);
  });

  // 23 fichiers (35 formulaires sur 216) ont encore un bouton d'envoi écrit à la main : supervision (admin) et portail
  // artisan surtout. Ils gardent leur comportement d'avant. Cette liste dit l'écart et ne peut que raccourcir : un nouveau
  // formulaire protégé doit employer BoutonEnvoi, ou se justifier ici.
  const BOUTON_ECRIT_A_LA_MAIN = [
    "src/app/admin/consignes/formulaires.tsx",
    "src/app/admin/marketing/formulaire-campagne.tsx",
    "src/app/admin/marketing/reglages-automatiques.tsx",
    "src/app/admin/marketing/veto-post.tsx",
    "src/app/admin/publications/bouton-chercher-sujets.tsx",
    "src/app/admin/relais/vacances-formulaires.tsx",
    "src/app/agence/[orgId]/baux/[bailId]/personnes-bail.tsx",
    "src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx",
    "src/app/artisan/attestations/formulaire-piece.tsx",
    "src/app/artisan/clients/formulaire.tsx",
    "src/app/artisan/devis/[sollicitationId]/renvoyer-email.tsx",
    "src/app/artisan/entreprise/documents-entreprise.tsx",
    "src/app/artisan/entreprise/reglages-entreprise.tsx",
    "src/app/artisan/inscription/formulaire-compte.tsx",
    "src/app/artisan/inscription/formulaire-inscription.tsx",
    "src/app/artisan/missions/[interventionId]/accepter-refuser.tsx",
    "src/app/artisan/missions/[interventionId]/bouton-demarrer.tsx",
    "src/app/artisan/missions/[interventionId]/compte-rendu/bilan/formulaire-bilan.tsx",
    "src/app/artisan/missions/[interventionId]/compte-rendu/photo-chantier.tsx",
    "src/app/artisan/missions/[interventionId]/creneaux/formulaire-creneaux.tsx",
    "src/app/artisan/missions/[interventionId]/dates-locataire.tsx",
    "src/app/artisan/missions/[interventionId]/facture/formulaire-facture.tsx",
    "src/components/formulaires-fiscaux.tsx",
  ];
  const protegesSansBoutonCommun = fichiers
    .filter(({ source }) => /<form[^>]*data-saisie-confirmee/.test(source) && !/\bBoutonEnvoi\b/.test(source))
    .map(({ f }) => f)
    .sort();

  it("le composant commun couvre la plupart des formulaires protégés (condition de D30 B)", () => {
    const protegesTous = fichiers.filter(({ source }) => /<form[^>]*data-saisie-confirmee/.test(source));
    const comptes = (liste: typeof fichiers) => liste.reduce((n, { source }) => n + (source.match(/<form[^>]*data-saisie-confirmee/g) ?? []).length, 0);
    const total = comptes(protegesTous);
    const couverts = comptes(protegesTous.filter(({ source }) => /\bBoutonEnvoi\b/.test(source)));
    expect(total).toBeGreaterThan(200);
    expect(couverts / total).toBeGreaterThan(0.8);
  });

  it("la liste des boutons écrits à la main est exacte : ni oubli, ni entrée périmée", () => {
    expect(protegesSansBoutonCommun).toEqual([...BOUTON_ECRIT_A_LA_MAIN].sort());
  });

  it("BoutonEnvoi s'appuie sur le crochet commun, pas sur un état propre", () => {
    const source = lire("src/components/ui/bouton-envoi.tsx");
    expect(source).toContain('from "@/lib/use-hydrate"');
    expect(source).toMatch(/useHydrate\(\)/);
  });
});
