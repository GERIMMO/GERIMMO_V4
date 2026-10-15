/**
 * Décision D32 (fiche PUB-03, 14/10/2026) : les conditions générales, les
 * mentions légales et la politique de confidentialité cessent de décrire
 * l'offre et le prix des agences — la V1 publique ne les propose pas.
 *
 * Partie TEXTE seule. L'identité de l'éditeur (lib/editeur.ts) est vide et
 * n'est pas inventée : ces tests vérifient que les pages le disent en toutes
 * lettres tant qu'elle manque, et qu'un champ vide ne casse aucune phrase.
 * Ils ne publient rien : ils lisent le texte visible des trois pages.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// L'en-tête et le pied du site public n'ont rien à voir avec ce que l'on vérifie.
vi.mock("@/components/chrome-public", () => ({
  EnTetePublic: () => null,
  PiedPublic: () => null,
}));

import PageConditions from "../src/app/conditions/page";
import PageConfidentialite from "../src/app/confidentialite/page";
import PageMentionsLegales from "../src/app/mentions-legales/page";
import { CONDITIONS_DATE, CONDITIONS_VERSION, EDITEUR, documentsIncomplets, faitsManquants } from "../src/lib/editeur";

/** Le texte que lit le visiteur : balises retirées, entités décodées, blancs réduits. */
function texteVisible(html: string): string {
  return html
    // Un bloc (paragraphe, ligne, titre…) sépare deux mots ; une balise de texte (gras, lien, italique) n'en sépare aucun.
    .replace(/<\/?(?:p|li|ul|ol|div|section|main|h[1-6]|table|thead|tbody|tr|td|th|dl|dt|dd|br|header|footer|nav)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const PAGES = {
  conditions: () => texteVisible(renderToStaticMarkup(PageConditions())),
  confidentialite: () => texteVisible(renderToStaticMarkup(PageConfidentialite())),
  "mentions-legales": () => texteVisible(renderToStaticMarkup(PageMentionsLegales())),
} as const;

const textes = {} as Record<keyof typeof PAGES, string>;
beforeAll(() => {
  for (const nom of Object.keys(PAGES) as (keyof typeof PAGES)[]) textes[nom] = PAGES[nom]();
});

describe("les pages légales ne décrivent plus l'offre ni le prix des agences", () => {
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("/%s : aucune occurrence de « agence » dans le texte visible", (nom) => {
    expect(textes[nom]).not.toMatch(/agence/i);
  });

  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("/%s : ni tarif d'agence, ni lots sous mandat, ni marque blanche", (nom) => {
    expect(textes[nom]).not.toMatch(/marque blanche/i);
    expect(textes[nom]).not.toMatch(/lots? sous mandat/i);
    expect(textes[nom]).not.toMatch(/tarif mensuel/i);
    expect(textes[nom]).not.toMatch(/agents? immobiliers?/i);
  });

  it("conditions : le Client est le propriétaire bailleur qui gère son propre parc", () => {
    expect(textes.conditions).toContain("souscrit au Service — propriétaire bailleur gérant son propre parc.");
  });

  it("conditions, art. 8.1 : le prix dépend du nombre de biens gérés, et rien d'autre n'est annoncé", () => {
    expect(textes.conditions).toContain("Le prix dépend du nombre de biens gérés ; les fonctions de gestion sont les mêmes quelle que soit la formule.");
    expect(textes.conditions).toContain("Les particuliers et les sociétés civiles qui gèrent leurs propres biens relèvent des formules Solo (1 bien), Bailleur (jusqu'à 3), Investisseur (jusqu'à 10) et Patrimoine (jusqu'à 20, puis un supplément par bien), en paiement mensuel ou annuel.");
    // La phrase qui suit l'énumération des formules enchaîne sur la franchise de TVA, sans trou.
    expect(textes.conditions).toMatch(/en paiement mensuel ou annuel\. L'Éditeur ne facturant pas de TVA \(article 8\.4\), les prix publiés sont, pour tous, les montants payés\. Les montants en vigueur sont publiés sur la page Tarifs/);
  });

  it("conditions, art. 8.3 : la facturation ne parle que du choix mensuel ou annuel", () => {
    expect(textes.conditions).toContain("8.3 — Facturation. Les particuliers choisissent un paiement mensuel ou annuel. Le paiement se fait par carte");
  });

  it("mentions légales : l'activité ne vise que les propriétaires bailleurs, et la marque blanche n'y figure plus", () => {
    expect(textes["mentions-legales"]).toContain("logiciel de gérance immobilière que des propriétaires bailleurs utilisent pour leur propre gestion.");
    const pi = textes["mentions-legales"].slice(textes["mentions-legales"].indexOf("Propriété intellectuelle"));
    expect(pi.slice(0, pi.indexOf("Signaler un contenu illicite"))).not.toMatch(/couleurs|logo/i);
  });

  it("confidentialité : le formulaire du site ne cite plus les champs « agence » et « taille du portefeuille »", () => {
    expect(textes.confidentialite).toContain("Les informations transmises (nom, adresse électronique, téléphone, message) servent uniquement à vous recontacter");
  });

  it("confidentialité : les évaluations de l'annuaire viennent des clients et des locataires, comme sur l'écran de l'artisan", () => {
    expect(textes.confidentialite).toContain("Annuaire des artisans et évaluations laissées par les clients et les locataires");
    expect(textes.confidentialite).toContain("si vous intervenez pour des propriétaires bailleurs");
    expect(textes.confidentialite).toContain("évaluations laissées par les clients et les locataires. Une note contestée");
  });

  it("confidentialité et mentions : à qui s'adresser pour le dossier de gestion locative, sans détour", () => {
    expect(textes.confidentialite).toContain("traitées pour le compte de votre propriétaire bailleur, qui en est responsable de traitement.");
    expect(textes.confidentialite).toContain("c'est à votre propriétaire bailleur qu'il faut vous adresser.");
    expect(textes.confidentialite).toContain("est déterminée par votre propriétaire bailleur, responsable de traitement");
    expect(textes.confidentialite).toContain("gestion locative, à votre propriétaire bailleur, depuis la messagerie de votre espace.");
    expect(textes["mentions-legales"]).toContain("c'est à votre propriétaire bailleur qu'il faut vous adresser, et non à Gerimmo : il en est responsable, nous n'en sommes que le sous-traitant.");
  });

  it("confidentialité : le cloisonnement se dit par organisation, comme dans les conditions (art. 2)", () => {
    expect(textes.confidentialite).toContain("une organisation ne peut pas lire les données d'une autre, même par erreur de programme.");
  });
});

describe("l'identité de l'éditeur manque : les pages le disent en toutes lettres, sans phrase cassée", () => {
  it("l'éditeur est vide (état du 14/10/2026) : ce que le dirigeant doit fournir, champ par champ", () => {
    // Ce test décrit ce que le dirigeant doit fournir pour clore D32 ; il ne doit pas échouer le jour où il le fait.
    const aFournir = faitsManquants({});
    expect(aFournir).toEqual([
      "la dénomination sociale",
      "la forme juridique",
      "l'adresse du siège",
      "l'immatriculation au RCS",
      "le SIRET",
      "le directeur de la publication",
      "l'adresse de contact",
      "le médiateur de la consommation",
    ]);
    // L'état du jour est cohérent avec cette liste : un champ vide figure dans les manques, un champ rempli non.
    for (const [cle, libelle] of [
      ["denomination", "la dénomination sociale"],
      ["forme", "la forme juridique"],
      ["siege", "l'adresse du siège"],
      ["rcs", "l'immatriculation au RCS"],
      ["siret", "le SIRET"],
      ["directeurPublication", "le directeur de la publication"],
      ["email", "l'adresse de contact"],
      ["mediateurNom", "le médiateur de la consommation"],
    ] as const) {
      expect(faitsManquants().includes(libelle)).toBe(!EDITEUR[cle]);
    }
  });

  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("/%s : tant que l'identité manque, l'encadré « Document en cours de finalisation » est affiché", (nom) => {
    // Vrai tant que documentsIncomplets() l'est ; l'encadré ne dépend pas d'autre chose pour l'identité.
    if (documentsIncomplets()) expect(textes[nom]).toContain("Document en cours de finalisation.");
  });

  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("/%s : chaque « (à venir) » suit un libellé, jamais seul ou entre parenthèses vides", (nom) => {
    const t = textes[nom];
    expect(t).not.toMatch(/(^|[:;,.]\s)\(à venir\)/);
    expect(t).not.toContain("() (à venir)");
    expect(t).not.toMatch(/null|undefined/);
    // Un libellé sans article derrière une préposition (« à adresse de contact », « l'adresse adresse… ») trahit une
    // phrase écrite pour la valeur, pas pour sa réserve.
    expect(t).not.toMatch(/\b(?:à|de|par|sur) (?:adresse|dénomination|numéro|forme juridique|raison sociale|ville et numéro|localisation)\b/i);
    expect(t).not.toMatch(/l'adresse adresse/i);
    for (const m of t.matchAll(/(\S+(?: \S+){0,3}) \(à venir\)/g)) {
      expect(m[1].length).toBeGreaterThan(1);
    }
  });

  it("les phrases qui portent un champ de l'éditeur se lisent entières quand le champ est vide", () => {
    if (!EDITEUR.email) {
      expect(textes["mentions-legales"]).toContain("Pour toute question sur le service : adresse de contact (à venir).");
      // Chaque libellé porte son article : « à l'adresse de contact de l'Éditeur (à venir) » se lit, « à adresse de contact (à venir) » non.
      expect(textes.conditions).toContain("la réclamation s'adresse à l'adresse de contact de l'Éditeur (à venir).");
      expect(textes.conditions).toContain("adressée à l'adresse de contact de l'Éditeur (à venir) ou depuis la page « Aide et retours » de son espace.");
      expect(textes.confidentialite).toContain("dans tous les cas, à l'adresse de contact de l'éditeur (à venir). Chaque demande reçoit une réponse dans le mois");
      expect(textes["mentions-legales"]).toContain("peut être signalé à l'adresse de signalement (à venir), en précisant la date du constat");
      expect(textes.confidentialite).not.toContain("l'adresse adresse");
    }
    if (!EDITEUR.mediateurNom) {
      expect(textes["mentions-legales"]).toContain("Médiateur nom du médiateur (à venir)");
    }
    if (!EDITEUR.denomination) {
      expect(textes.conditions).toContain("À l'attention de [dénomination de l'Éditeur] (à venir), [adresse du siège] (à venir), [adresse de contact] (à venir) :");
    }
  });

  it("la voie de contact reste ouverte au public tant que l'adresse manque : le formulaire de l'accueil", () => {
    if (!EDITEUR.email) {
      expect(textes.conditions + textes.confidentialite + textes["mentions-legales"]).toContain("formulaire de contact de l'accueil");
    }
  });
});

describe("la version des conditions suit la modification", () => {
  it("est datée du jour de la modification, au même format que la clé enregistrée à l'inscription", () => {
    expect(CONDITIONS_VERSION).toBe("2026-10-15");
    expect(CONDITIONS_DATE).toBe("15 octobre 2026");
    expect(textes.conditions).toContain("Version du 15 octobre 2026");
    expect(textes.conditions).toContain("version du 15 octobre 2026");
  });

  it("le script des comptes de recette copie la même version (il simule une inscription qui a accepté les conditions)", () => {
    const sql = readFileSync(resolve(__dirname, "..", "e2e/recette-production/preparer-comptes.sql"), "utf8");
    expect(sql).toContain(`v_version_cgu constant text := '${CONDITIONS_VERSION}';`);
  });
});
