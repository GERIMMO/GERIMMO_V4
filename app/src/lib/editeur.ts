// L'identité de l'éditeur, en un seul endroit.
//
// Les mentions légales, les conditions générales et la politique de
// confidentialité citent toutes les mêmes faits : dénomination, siège,
// immatriculation, contact. Écrits trois fois, ils divergent au premier
// changement d'adresse — et une mention légale fausse est pénalement
// sanctionnée (art. 1-1 de la LCEN, rédaction issue de la loi n° 2024-449 du
// 21 mai 2024 ; plan de conformité du 23/10, R35 : l'ancienne référence
// « art. 6-III » était périmée). Ils vivent donc ici, et nulle part ailleurs.
//
// `null` veut dire « pas encore fourni » : la page l'affiche alors comme un
// champ RESTÉ À REMPLIR, en toutes lettres, exactement comme le générateur de
// documents traite une donnée manquante (lib/documents/gabarit.ts). Elle ne le
// remplace jamais par du vide, ni par une valeur vraisemblable : un contrat
// dont on devine les parties n'engage personne.

import type { RegimeTva } from "@/lib/tarifs";

export type FaitEditeur = string | null;

export const EDITEUR = {
  /** Dénomination sociale ou nom de l'entrepreneur individuel. */
  denomination: null as FaitEditeur,
  /** SAS, SARL, entreprise individuelle… */
  forme: null as FaitEditeur,
  /** Capital social, si société. `null` pour une entreprise individuelle. */
  capital: null as FaitEditeur,
  /** Adresse complète du siège. */
  siege: null as FaitEditeur,
  /** Immatriculation RNE ou RCS ; clé historique conservée en base. */
  rcs: null as FaitEditeur,
  siret: null as FaitEditeur,
  tvaIntracommunautaire: null as FaitEditeur,
  /** Nom et qualité du directeur de la publication. */
  directeurPublication: null as FaitEditeur,
  /** Adresse électronique de contact du public. */
  email: null as FaitEditeur,
  telephone: null as FaitEditeur,
  /** Nom du médiateur de la consommation, puis ses coordonnées. */
  mediateurNom: null as FaitEditeur,
  mediateurAdresse: null as FaitEditeur,
  mediateurSite: null as FaitEditeur,
} as const;

/**
 * Le régime de TVA de l'éditeur, que le porteur déclare : franchise en base
 * (décision du 28/09/2026, reconfirmée le 20/10/2026).
 *
 * Il décide de ce que l'on affiche et de ce que l'on facture : un éditeur en
 * franchise en base (art. 293 B du CGI) ne facture aucune TVA, un éditeur
 * assujetti la facture au taux qu'il indique. Tant qu'il vaut `null`, AUCUN
 * montant de taxe n'est calculé ni inventé, et la souscription en ligne reste
 * fermée (lib/stripe.ts, `configurationStripe`).
 *
 * Exemples : `{ nature: "franchise" }` ou `{ nature: "assujetti", tauxPourcent: 20 }`.
 */
export const REGIME_TVA: RegimeTva | null = { nature: "franchise" };

/**
 * Les faits SANS LESQUELS la page ne remplit pas son office légal.
 *
 * Le capital ne figure pas dans cette liste (une entreprise individuelle n'en
 * a pas), ni le numéro de TVA (selon le régime). Le téléphone professionnel
 * reste nécessaire pour le service proposé aux consommateurs.
 */
const REQUIS = [
  ["denomination", "la dénomination sociale"],
  ["forme", "la forme juridique"],
  ["siege", "l'adresse du siège"],
  ["rcs", "l'immatriculation (RNE ou RCS)"],
  ["siret", "le SIRET"],
  ["directeurPublication", "le directeur de la publication"],
  ["email", "l'adresse de contact"],
  ["telephone", "le téléphone de contact"],
] as const satisfies readonly (readonly [keyof typeof EDITEUR, string])[];

/**
 * Les faits À COMPLÉTER, qui ne ferment rien (décision du dirigeant du
 * 23/10/2026 : « les infos importantes manquantes seront remplies plus tard
 * mais ne doivent pas être bloquantes », médiateur cité en exemple).
 *
 * Le médiateur de la consommation reste une obligation envers les clients
 * particuliers (art. L. 616-1 du code de la consommation ; un nom seul ne
 * suffit pas) : tant qu'il manque, les mentions légales le disent à sa place
 * (« Adhésion à venir »), la console le rappelle au dirigeant, mais ni le
 * paiement en ligne ni l'encadré « Document en cours de finalisation » n'en
 * dépendent plus.
 */
const A_COMPLETER = [
  ["mediateurNom", "le médiateur de la consommation"],
  ["mediateurAdresse", "l'adresse du médiateur"],
  ["mediateurSite", "le site du médiateur"],
] as const satisfies readonly (readonly [keyof typeof EDITEUR, string])[];

/**
 * Ce qu'il manque encore des faits REQUIS, en français. Seuls ceux-là ferment
 * le paiement (lib/garde-souscription.ts) et affichent l'encadré des pages
 * légales.
 *
 * Le paramètre existe pour que le test puisse vérifier la mécanique sur un
 * éditeur complet — sans lui, il ne pourrait qu'observer l'état du jour et ne
 * prouverait jamais que l'encadré disparaît une fois les faits fournis.
 */
export function faitsManquants(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  return REQUIS.filter(([cle]) => !editeur[cle]).map(([, libelle]) => libelle);
}

/** Ce qu'il reste à compléter sans que rien n'en dépende : rappelé au dirigeant seulement. */
export function faitsACompleter(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  return A_COMPLETER.filter(([cle]) => !editeur[cle]).map(([, libelle]) => libelle);
}

/** Vrai tant que les documents ne sont pas finalisés. */
export function documentsIncomplets(editeur: Record<string, FaitEditeur> = EDITEUR): boolean {
  return faitsManquants(editeur).length > 0;
}

/** La confidentialité doit identifier son responsable ; le médiateur relève des mentions et des CGV. */
export function confidentialiteIncomplete(editeur: Record<string, FaitEditeur> = EDITEUR): boolean {
  return ["denomination", "forme", "siege", "email"].some((cle) => !editeur[cle]?.trim());
}

export function estEntrepreneurIndividuel(editeur: Record<string, FaitEditeur>): boolean {
  return /^(?:EI|entrepreneur individuel|entreprise individuelle)(?:\s|$)/i.test(editeur.forme?.trim() ?? "");
}

// ── Où écrire à l'éditeur ──────────────────────────────────────────────────
//
// Tant que `EDITEUR.email` manque, la seule voie ouverte au public est le
// formulaire de contact de l'accueil. Jusqu'au 13/10 c'était le formulaire de
// devis des agences (rubrique Agences) : un locataire venu exercer ses droits
// tombait sur une demande commerciale (relevé du 24/09). La V1 publique ne
// propose plus d'offre agence : la même rubrique est devenue un formulaire de
// contact ordinaire (« Une question ? »), et l'adresse prend le relais dès
// qu'elle est fournie ci-dessus.
export const FORMULAIRE_ACCUEIL = "/#contact";

/** L'adresse à laquelle écrire, ou `null` : il faut alors passer par le formulaire. */
export function courrielDeContact(editeur: Record<string, FaitEditeur> = EDITEUR): string | null {
  return editeur.email || null;
}

// ── Prestataires (sous-traitants techniques) ───────────────────────────────
//
// Une seule liste pour les mentions légales et la page confidentialité : elles
// décrivaient les mêmes prestataires dans deux tableaux différents — colonnes
// dans un autre ordre, libellés divergents, Stripe sur une page seulement
// (relevé du 24/09). `localisation: null` s'affiche en réserve, comme un fait
// d'éditeur manquant.
//
// 19/10 : ce que le code ne sait pas, il ne le devine pas — mais il ne le fige
// plus à vide non plus. La localisation laissée à `null` et les coordonnées de
// chaque prestataire (dénomination, adresse, téléphone) se saisissent dans
// /admin/parametres, par les mêmes clés JSON que l'identité
// (`CHAMPS_PRESTATAIRES`), et `prestatairesAvecFaits` les superpose à cette
// liste. Une localisation établie par le code ne se laisse pas écraser par la
// saisie : elle a été vérifiée dans la configuration (vercel.json, lib/*.ts) ;
// si un prestataire change de région, c'est le code qu'il faut corriger.
export type Prestataire = {
  /** Clé courte et stable, qui nomme les champs de saisie : `coordonneesSupabase`, `localisationBan`… */
  cle: string;
  nom: string;
  role: string;
  localisation: FaitEditeur;
  /** Dénomination, adresse et téléphone, tels que saisis dans /admin/parametres ; `null` tant qu'ils manquent. */
  coordonnees?: FaitEditeur;
  /** Source officielle décrivant le prestataire et ses traitements. */
  documentation?: string;
  /**
   * Sous-traitant ultérieur des données que l'Éditeur traite pour le compte du Client ou de l'Artisan (annexes
   * « article 28 » des conditions, plan de conformité du 23/10, R11). Seuls ces prestataires figurent à l'annexe, lus
   * depuis cette liste et jamais depuis la base : la liste fait partie de la version acceptée, et la changer demande
   * une nouvelle version des conditions (tests/conditions-empreinte.test.ts).
   */
  sousTraitantClient?: true;
  /** Ce que le prestataire traite pour le Client, quand son rôle général couvre davantage (annexe seulement). */
  roleClient?: string;
};

//
// Audit 25/09 (C2) : le code envoyait des données à Yousign, OpenAI et Meta
// sans que les pages légales les nomment. Le rôle décrit ce qui leur est
// transmis, tel que le code l'établit (lib/zoho-sign.ts, lib/analyse-veille.ts,
// lib/visuel-marketing.ts, admin/brief, admin/publications, lib/facebook.ts).
// La localisation n'est écrite que lorsqu'elle est certaine ; sinon `null`.
export const PRESTATAIRES: readonly Prestataire[] = [
  {
    cle: "supabase",
    sousTraitantClient: true,
    nom: "Supabase",
    role: "Base de données, authentification, stockage des fichiers",
    localisation: "Région eu-west-3 (Paris, France)",
    documentation: "https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq",
  },
  {
    cle: "vercel",
    sousTraitantClient: true,
    nom: "Vercel",
    role: "Hébergement et diffusion de l'application",
    // La région des fonctions est fixée dans vercel.json (`regions: ["cdg1"]`) :
    // sans ce réglage, Vercel exécute le serveur à Washington, et les données
    // transitent hors UE à chaque page.
    localisation: "Fonctions serveur en région cdg1 (Paris, France) ; diffusion et opérations internationales",
    documentation: "https://vercel.com/legal/privacy-notice",
  },
  {
    cle: "resend",
    sousTraitantClient: true,
    nom: "Resend",
    role: "Envoi des courriels du service (quittances, avis, relances, rappels)",
    // Domaine d'envoi gerimmo.app créé en région eu-west-1 (constaté dans le
    // tableau de bord Resend par le porteur, 27/09).
    localisation: "Région eu-west-1 (Irlande)",
    documentation: "https://resend.com/legal/privacy-policy",
  },
  {
    cle: "stripe",
    nom: "Stripe",
    role: "Encaissement des abonnements",
    localisation: "Irlande",
    documentation: "https://stripe.com/privacy",
  },
  {
    cle: "zohoSign",
    sousTraitantClient: true,
    nom: "Zoho Sign",
    // Décision du dirigeant du 23/10 : le cautionnement et l'état des lieux se signent dans Gerimmo, comme le bail, ses
    // avenants, les accords et les devis (lib/politique-signature.ts, DOCUMENTS_ZOHO).
    role: "Signature électronique des baux et de leurs avenants, des actes de cautionnement, des états des lieux, des accords d'échelonnement ou de travaux et des devis : document à signer, nom, adresse électronique et téléphone des signataires ; invitations par courriel, vérification par SMS et conservation des preuves de signature",
    localisation: "Centre de données Union européenne (sign.zoho.eu) ; acheminement des SMS par les prestataires de Zoho",
    documentation: "https://www.zoho.com/privacy.html",
  },
  {
    cle: "yousign",
    nom: "Yousign / Youtrust (inactif)",
    // Adaptateur historique conservé dans le code, non utilisé par le
    // circuit Zoho Sign actuellement activé.
    role: "Ancienne intégration de signature des baux, inactive : aucune transmission par le circuit de signature Zoho Sign actuellement utilisé",
    localisation: "France",
    documentation: "https://youtrust.com/legal-notice",
  },
  {
    cle: "openai",
    sousTraitantClient: true,
    nom: "OpenAI",
    role: "Assistance rédactionnelle de la supervision (veille, brouillons et illustrations du Journal) et propositions de devis artisans : textes éditoriaux publics, catalogue tarifaire et symptômes techniques sélectionnés ; les propositions de devis excluent les noms, adresses et descriptions libres des occupants",
    // Pour le Client, seules les propositions de devis le concernent : la supervision éditoriale n'est pas un
    // traitement pour son compte.
    roleClient: "Propositions de devis artisans : catalogue tarifaire et symptômes techniques sélectionnés, à l'exclusion des noms, adresses et descriptions libres des occupants",
    localisation: "États-Unis (transfert hors UE)",
    documentation: "https://openai.com/policies/data-processing-addendum/",
  },
  // Audit 27/09 : la sauvegarde quotidienne (.github/workflows/sauvegarde.yml,
  // docs/sauvegarde-et-restauration.md) fait intervenir deux prestataires que
  // les pages ne nommaient pas. Le chantier s'exécute sur les machines de
  // GitHub Actions : la base (pg_dump des schémas public, auth, storage) et
  // les fichiers y sont exportés PUIS chiffrés (AES-256-GCM, scripts/
  // sauvegarde/) — ils y passent donc en clair le temps du chiffrement, et
  // les copies locales sont effacées en fin de passage. La copie chiffrée est
  // déposée chez Scaleway, région `fr-par` (réglage SCW_REGION du chantier,
  // fr-par par défaut et choix du porteur du 25/09), conservée 90 jours ; la
  // clé de chiffrement ne quitte pas les secrets GitHub.
  {
    cle: "scaleway",
    sousTraitantClient: true,
    nom: "Scaleway",
    role: "Stockage de la sauvegarde quotidienne : copie chiffrée (AES-256-GCM) de la base et des fichiers, conservée 90 jours, illisible sans la clé que Scaleway ne détient pas",
    localisation: "Région fr-par (Paris, France)",
    documentation: "https://www.scaleway.com/fr/politique-confidentialite/",
  },
  {
    cle: "github",
    sousTraitantClient: true,
    nom: "GitHub (Actions)",
    role: "Exécution de la sauvegarde quotidienne : la base et les fichiers transitent par ses machines le temps d'être chiffrés, puis les copies locales sont effacées ; détient la clé de chiffrement des sauvegardes",
    localisation: "Prestataire établi aux États-Unis (transfert hors UE)",
    documentation: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
  },
  // Autocomplétion d'adresse de la fiche d'un bien (parc/formulaire-bien.tsx) :
  // le navigateur envoie le texte de l'adresse tapée à l'API de la Base
  // Adresse Nationale, admise dans la CSP (next.config.ts) le 27/09.
  {
    cle: "ban",
    nom: "Base Adresse Nationale (api-adresse.data.gouv.fr)",
    role: "Autocomplétion des adresses saisies dans la fiche d'un bien : texte de l'adresse et données techniques de la requête, dont l'adresse IP",
    // Non établie par le code : à saisir dans /admin/parametres (clé `localisationBan`), jamais devinée ici.
    localisation: null,
    documentation: "https://adresse.data.gouv.fr/donnees-personnelles",
  },
  {
    cle: "meta",
    nom: "Meta (Facebook)",
    role: "Publication des articles du Journal sur Facebook : titre, texte et illustration. Meta traite également les interactions et statistiques des visiteurs de la page Facebook selon ses propres règles",
    localisation: "Irlande, avec transfert vers les États-Unis",
    documentation: "https://www.facebook.com/privacy/policy/",
  },
];

/**
 * Les sous-traitants ultérieurs des annexes « article 28 » des conditions (plan de conformité du 23/10, R11) : liste
 * figée du code — Supabase, Vercel, Resend, Zoho Sign, Scaleway, GitHub (Actions), OpenAI —, sans la Base Adresse
 * Nationale (service public appelé par le navigateur, pas un sous-traitant) ni Yousign (inactif, aucune donnée).
 * Lue depuis les constantes, jamais depuis la base : ni localisation ni coordonnées saisies n'y entrent, si bien que
 * le texte accepté ne change pas au gré des paramètres. Le rôle affiché est celui qui concerne le Client.
 */
export function sousTraitantsClient(liste: readonly Prestataire[] = PRESTATAIRES): Prestataire[] {
  return liste.filter((p) => p.sousTraitantClient).map((p) => ({ ...p, role: p.roleClient ?? p.role }));
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** La clé de saisie des coordonnées d'un prestataire : `coordonneesSupabase`. */
export const cleCoordonnees = (p: Prestataire) => `coordonnees${majuscule(p.cle)}`;
/** La clé de saisie de la localisation d'un prestataire que le code ne localise pas : `localisationBan`. */
export const cleLocalisation = (p: Prestataire) => `localisation${majuscule(p.cle)}`;

/**
 * Les champs de saisie des prestataires (clé → libellé du formulaire de
 * /admin/parametres), dans l'ordre du tableau des pages légales : l'hébergement
 * d'abord. Une localisation n'est à saisir que si le code ne l'établit pas.
 * La base n'admet que ces clés (contrainte `identite_champs_connus`, migration
 * 20261019123000) : en ajouter une ici demande une migration, appliquée avant
 * le code.
 */
export const CHAMPS_PRESTATAIRES: Record<string, string> = Object.fromEntries(
  PRESTATAIRES.flatMap((p) => [
    // Un séparateur plutôt qu'une seconde parenthèse : « GitHub (Actions) (dénomination, …) » se lisait mal.
    ...(p.localisation ? [] : [[cleLocalisation(p), `Localisation de ${p.nom} : pays ou région des serveurs`]]),
    [cleCoordonnees(p), `Coordonnées de ${p.nom} : dénomination, adresse, téléphone`],
  ])
);

/**
 * Les prestataires tels que les pages les affichent : la liste du code,
 * complétée par ce qui a été saisi. La saisie fournit ce que le code laisse à
 * `null` ; elle n'écrase jamais une localisation que le code établit.
 */
export function prestatairesAvecFaits(
  editeur: Record<string, FaitEditeur> = EDITEUR,
  liste: readonly Prestataire[] = PRESTATAIRES
): Prestataire[] {
  return liste.map((p) => ({
    ...p,
    localisation: p.localisation || editeur[cleLocalisation(p)] || null,
    coordonnees: editeur[cleCoordonnees(p)] || null,
  }));
}

/**
 * Vrai tant qu'un prestataire n'a pas sa localisation — ni, si la page affiche
 * les coordonnées (mentions légales), ses coordonnées.
 */
export function prestatairesIncomplets(liste: readonly Prestataire[] = PRESTATAIRES, avecCoordonnees = false): boolean {
  return liste.some((p) => !p.localisation || (avecCoordonnees && !p.coordonnees));
}

/** Ce qu'il manque encore aux prestataires, en français, au style de `faitsManquants`. */
export function reservesPrestataires(
  editeur: Record<string, FaitEditeur> = EDITEUR,
  liste: readonly Prestataire[] = PRESTATAIRES
): string[] {
  const prestataires = prestatairesAvecFaits(editeur, liste);
  const reserves = prestataires.filter((p) => !p.localisation).map((p) => `la localisation de ${p.nom}`);
  const sansCoordonnees = prestataires.filter((p) => !p.coordonnees);
  if (sansCoordonnees.length) {
    const n = sansCoordonnees.length;
    reserves.push(
      `les coordonnées de ${n} prestataire${n > 1 ? "s" : ""} sur ${prestataires.length} (${sansCoordonnees.map((p) => p.nom).join(", ")})`
    );
  }
  return reserves;
}

/**
 * Tout ce qui reste à compléter pour que les pages légales soient finalisées :
 * les faits d'éditeur, puis les prestataires. C'est ce que l'écran des
 * paramètres dit après chaque enregistrement. Le médiateur y figure aussi
 * (23/10) : il ne ferme rien, mais il reste dû.
 */
export function reservesLegales(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  return [...faitsManquants(editeur), ...faitsACompleter(editeur), ...reservesPrestataires(editeur)];
}

// ── Version des conditions générales ───────────────────────────────────────
//
// Le contrat peut changer ; ce qui a été accepté, non. On enregistre donc à
// l'inscription QUELLE version a été acceptée, et quand — sans quoi l'éditeur
// ne peut pas prouver le contenu de l'accord le jour de sa formation
// (relevé du 11/09 : la base notait que la case avait été cochée, rien de
// plus).
//
// À incrémenter à CHAQUE modification de fond des conditions, en même temps
// que `CONDITIONS_DATE`.
// 28/09/2026 : nouvelle grille tarifaire (article 8), fin du premier bien
// offert.
// 29/09/2026 : conditions générales d'utilisation ET DE VENTE — reconduction
// de l'annuel (art. L. 215-1 du code de la consommation), conservation,
// disponibilité, plafond de responsabilité, mise en demeure, annexe
// « article 28 du RGPD ».
// 30/09/2026 : essai gratuit porté de 14 jours à 2 mois pour toute inscription
// jusqu'au 31/12/2026 (offre de lancement), 1 mois ensuite (article 8.2).
// 24/10/2026 (date PROVISOIRE, voir ci-dessous) : V1 — offre aux seuls
// propriétaires gérant leurs biens (agences retirées), rétractation en ligne
// (8.10), impayé et suspension (15), garanties légales (14 bis), signature
// électronique (4.7), conservation (9), révision et modifications (8.9, 16),
// annexe article 28 complétée, annexe L. 215 ; conditions de l'espace artisan
// séparées.
//
// DATE PROVISOIRE (plan de conformité du 23/10, lot 3) : « 2026-10-24 » tient la
// place de la date de publication réelle de la V1, qui sera posée le jour de la
// mise en ligne — en même temps que la clé de conditions-versions.json, la date
// d'effet qui y figure et CONDITIONS_ARTISANS_VERSION / CONDITIONS_ARTISANS_DATE.
// La V1 ne paraît qu'une fois en production le code qui la rend vraie.
export const CONDITIONS_VERSION = "2026-10-24";

/** Date d'entrée en vigueur affichée en tête des conditions (PROVISOIRE, voir ci-dessus). */
export const CONDITIONS_DATE = "24 octobre 2026";

// ── Version des conditions de l'espace artisan ─────────────────────────────
//
// Plan de conformité du 23/10/2026 (constat R10) : les artisans n'acceptent plus les conditions écrites pour les
// propriétaires bailleurs, mais les « Conditions de l'espace artisan » (/conditions/artisans), versionnées et
// archivées à part (document « conditions_artisans »).
// TANT QUE CES DEUX VALEURS SONT NULLES, le mécanisme de l'espace artisan est INACTIF : l'artisan accepte les
// conditions clients, comme avant (case de l'inscription, document « conditions_clients »), et la garde de
// l'espace artisan n'exige rien. Il s'active seul dès qu'elles sont renseignées, en même temps que la page publiée :
// case « J'accepte les conditions de l'espace artisan » (document « conditions_artisans »), garde de
// src/app/artisan/layout.tsx (lib/conditions-acceptation.ts). Même règle qu'au-dessus : à changer à chaque
// modification de fond, avec la date affichée. Première version : même date PROVISOIRE que la V1 des conditions
// clients, publiée le même jour.
export const CONDITIONS_ARTISANS_VERSION: string | null = "2026-10-24";

/** Date d'entrée en vigueur affichée en tête des conditions de l'espace artisan ; `null` tant qu'elles ne sont pas publiées (PROVISOIRE). */
export const CONDITIONS_ARTISANS_DATE: string | null = "24 octobre 2026";
