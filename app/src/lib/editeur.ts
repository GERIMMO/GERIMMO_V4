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
  /**
   * Dénomination sociale d'une société ; pour un entrepreneur individuel, son nom et son prénom accompagnés de la
   * mention « entrepreneur individuel » ou des initiales « EI » (fiches officielles F37351 et F31808 d'Entreprendre
   * Service Public, lues le 24/11/2026 ; code de commerce, art. R. 526-27, lu dans le recueil du dirigeant ;
   * `validerIdentite` le vérifie à la saisie, `defautsVendeur` avant toute vente).
   */
  denomination: null as FaitEditeur,
  /** SAS, SARL… ou « Entrepreneur individuel » (voir `estEntrepreneurIndividuel`). */
  forme: null as FaitEditeur,
  /** Capital social, si société. `null` pour une entreprise individuelle. */
  capital: null as FaitEditeur,
  /** Adresse complète : siège d'une société, ou adresse de l'entreprise individuelle. */
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
// Décision du dirigeant du 24/11/2026 (Q7) : le vendeur est un entrepreneur individuel. Les libellés ne supposent plus
// une société (« dénomination sociale », « siège »).
const REQUIS = [
  ["denomination", "le nom ou la dénomination de l'éditeur"],
  ["forme", "la forme juridique"],
  ["siege", "l'adresse de l'éditeur"],
  ["rcs", "l'immatriculation (RNE ou RCS)"],
  ["siret", "le SIRET"],
  ["directeurPublication", "le directeur de la publication"],
  ["email", "l'adresse de contact"],
  ["telephone", "le téléphone de contact"],
] as const satisfies readonly (readonly [keyof typeof EDITEUR, string])[];

/**
 * Les coordonnées du médiateur de la consommation. Reprise du 24/11/2026 (décision de pilotage, lot D7) : le recueil
 * fourni par le dirigeant contient les articles L. 612-1 et L. 616-1 du code de la consommation (« le professionnel
 * garantit au consommateur le recours effectif à un dispositif de médiation de la consommation » ; il « communique au
 * consommateur […] les coordonnées du ou des médiateurs compétents dont il relève »). Tant qu'elles manquent, la
 * première souscription d'un PARTICULIER reste donc fermée par défaut (lib/garde-souscription.ts) ; le super admin peut
 * l'ouvrir quand même en levant le blocage, en connaissance de cause. Elles ne ferment rien d'autre : ni les pages
 * légales (qui disent qu'aucun médiateur n'est désigné), ni la souscription d'un professionnel, ni une hausse.
 */
const A_COMPLETER = [
  ["mediateurNom", "le médiateur de la consommation"],
  ["mediateurAdresse", "l'adresse du médiateur"],
  ["mediateurSite", "le site du médiateur"],
] as const satisfies readonly (readonly [keyof typeof EDITEUR, string])[];

/**
 * Ce qu'il manque encore des faits REQUIS, en français. Ils déterminent l'encadré des pages légales et la garde générale
 * d'identité de l'éditeur.
 *
 * Le paramètre existe pour que le test puisse vérifier la mécanique sur un
 * éditeur complet — sans lui, il ne pourrait qu'observer l'état du jour et ne
 * prouverait jamais que l'encadré disparaît une fois les faits fournis.
 */
export function faitsManquants(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  return REQUIS.filter(([cle]) => !editeur[cle]).map(([, libelle]) => libelle);
}

/** Coordonnées du médiateur restant à renseigner (elles ne ferment que la première souscription d'un particulier). */
export function faitsACompleter(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  return A_COMPLETER.filter(([cle]) => !editeur[cle]).map(([, libelle]) => libelle);
}

/** Vrai tant que les documents ne sont pas finalisés. */
export function documentsIncomplets(editeur: Record<string, FaitEditeur> = EDITEUR): boolean {
  return faitsManquants(editeur).length > 0;
}

/**
 * Ce que le texte des conditions générales (/conditions) imprime de l'identité saisie, et rien d'autre : le nom,
 * l'adresse et l'adresse de contact (formulaire de rétractation, articles 8 et 17), et la présence de l'encadré
 * « Document en cours de finalisation » (un fait requis manque). Le médiateur n'y figure plus : depuis la version du
 * 24/11/2026, l'article 17 renvoie aux mentions légales, qu'il soit désigné ou non.
 *
 * Sert à la garde de commande (lib/garde-souscription-serveur.ts, relecture D7R-02) : retoucher le téléphone, le
 * médiateur ou un prestataire ne change pas le contrat et ne doit pas refermer les ventes ; changer le nom ou
 * l'adresse le change. tests/vendeur-mediateur-reprise-d7.test.ts (bloc 4) prouve, champ par champ, que le texte rendu ne
 * dépend de rien d'autre : si un article se met à citer un autre champ, ce test échoue et la liste doit suivre.
 */
export function identiteDesConditions(identite: Record<string, unknown>): Record<string, string | null> {
  const faits: Record<string, FaitEditeur> = {};
  for (const [cle, valeur] of Object.entries(identite)) faits[cle] = typeof valeur === "string" && valeur ? valeur : null;
  return {
    denomination: faits.denomination ?? null,
    siege: faits.siege ?? null,
    email: faits.email ?? null,
    encadre: documentsIncomplets(faits) ? "en cours de finalisation" : "complet",
  };
}

/** La confidentialité doit identifier son responsable ; le médiateur relève des mentions et des CGV. */
export function confidentialiteIncomplete(editeur: Record<string, FaitEditeur> = EDITEUR): boolean {
  return ["denomination", "forme", "siege", "email"].some((cle) => !editeur[cle]?.trim());
}

/** Minuscules, sans accents, espaces (insécables compris) réduits à un seul : pour comparer une saisie libre. */
function formeSimple(texte: string | null | undefined): string {
  return (texte ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s\u00a0\u202f]+/g, " ").trim();
}

// Les mots qui désignent un entrepreneur individuel dans le champ libre « Forme juridique » (relecture D7R-03 : une
// virgule, une parenthèse collée ou « E.I. » faisaient sortir du régime, et la page annonçait un capital « à venir »).
const MOTS_ENTREPRENEUR_INDIVIDUEL =
  /(?:^|[^a-z0-9])(?:entrepreneur individuel|entrepreneuse individuelle|entreprise individuelle|micro[- ]?entrepreneur|micro[- ]?entrepreneuse|micro[- ]?entreprise|auto[- ]?entrepreneur|auto[- ]?entrepreneuse)(?:[^a-z0-9]|$)/;
// Les initiales, en tête du champ seulement : « EI », « E.I. », « EI (nom commercial X) ». « EIRL » et « EIffage » n'en sont pas.
const INITIALES_EI_EN_TETE = /^e\.? ?i\.?(?:[^a-z0-9]|$)/;

/** La forme juridique saisie désigne-t-elle un entrepreneur individuel ? Ponctuation, casse et accents indifférents. */
export function estEntrepreneurIndividuel(editeur: Record<string, FaitEditeur>): boolean {
  const forme = formeSimple(editeur.forme);
  return MOTS_ENTREPRENEUR_INDIVIDUEL.test(forme) || INITIALES_EI_EN_TETE.test(forme);
}

/**
 * Le nom porte-t-il la mention de l'entrepreneur individuel ?
 *
 * Code de commerce, article R. 526-27 (recueil fourni par le dirigeant le 24/11/2026, non recontrôlé par nous) :
 * « l'entrepreneur individuel utilise une dénomination incorporant son nom ou nom d'usage précédé ou suivi
 * immédiatement des mots : “ entrepreneur individuel ” ou des initiales : “ EI ” ».
 *
 * On vérifie donc que la mention est un mot entier (« EI » ou « E.I. » en majuscules, ou les mots en toutes lettres),
 * et qu'elle TOUCHE un autre mot du nom : rien entre eux qu'une espace, une virgule ou une parenthèse. Un trait d'union
 * ou une apostrophe collent deux mots en un seul : « EI-CONSEIL Martin » ne porte pas la mention (relecture D7R-05).
 * Refusés aussi : la mention seule (aucun nom) et la mention niée (« non entrepreneur individuel »).
 * Ce que le code ne sait pas faire : reconnaître que le mot voisin est bien le NOM de la personne (« SOCIETE EI » passe).
 */
export function porteLaMentionEI(nom: string | null | undefined): boolean {
  const mots = (nom ?? "")
    // Les mots en toutes lettres et « E.I. » sont ramenés aux initiales, pour n'avoir qu'une forme à chercher.
    .replace(/(?<![\p{L}\p{N}-])entrepreneu(?:r\s+individuel|se\s+individuelle)(?![\p{L}\p{N}-])/giu, "EI")
    .replace(/(?<![\p{L}\p{N}.-])E\.I\.(?![\p{L}\p{N}])/gu, "EI")
    // Espaces, virgules et parenthèses séparent les mots ; le trait d'union et l'apostrophe, non.
    .split(/[\s\u00a0\u202f,()]+/u)
    .map((mot) => mot.replace(/[.;:]+$/u, ""))
    .filter(Boolean);
  const estUnNom = (mot: string | undefined) => mot !== undefined && mot !== "EI" && /^\p{L}[\p{L}\p{N}'’.-]+$/u.test(mot);
  const estUneNegation = (mot: string | undefined) => /^(?:non|pas|sans|ni|ex|ancien|ancienne)$/i.test(mot ?? "");
  return mots.some((mot, i) => mot === "EI" && !estUneNegation(mots[i - 1]) && (estUnNom(mots[i - 1]) || estUnNom(mots[i + 1])));
}

/** Le manque dit au super admin quand le nom d'un entrepreneur individuel ne porte pas la mention. */
export const MANQUE_MENTION_EI = "la mention « EI » accolée au nom de l'éditeur (entrepreneur individuel)";

/**
 * Tout ce qui empêche de vendre du côté du vendeur : les faits requis absents, puis la mention « EI » absente du nom
 * d'un entrepreneur individuel. La saisie la refuse déjà (lib/identite-editeur.ts) ; ce contrôle est rejoué à
 * l'ouverture des ventes et avant chaque première souscription, pour une identité enregistrée avant ce contrôle
 * (relecture D7R-05).
 */
export function defautsVendeur(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  const sansMention = Boolean(editeur.denomination) && estEntrepreneurIndividuel(editeur) && !porteLaMentionEI(editeur.denomination);
  return [...faitsManquants(editeur), ...(sansMention ? [MANQUE_MENTION_EI] : [])];
}

/** Les trois coordonnées du médiateur de la consommation sont-elles saisies ? (La saisie les exige ensemble.) */
export function mediateurDesigne(editeur: Record<string, FaitEditeur> = EDITEUR): boolean {
  return ["mediateurNom", "mediateurAdresse", "mediateurSite"].every((cle) => Boolean(editeur[cle]?.trim()));
}

/** « 123 456 789 » et « 123 456 789 00012 » (exemple fictif) depuis un SIRET de 14 chiffres ; `null` si la saisie n'en est pas un. */
export function sirenEtSiret(siret: string | null | undefined): { siren: string; siret: string } | null {
  const chiffres = (siret ?? "").replace(/\s/g, "");
  if (!/^\d{14}$/.test(chiffres)) return null;
  const siren = `${chiffres.slice(0, 3)} ${chiffres.slice(3, 6)} ${chiffres.slice(6, 9)}`;
  return { siren, siret: `${siren} ${chiffres.slice(9)}` };
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
  /** Ce que le prestataire traite pour l'Artisan (annexe des conditions de l'espace artisan), s'il diffère de `roleClient`. */
  roleArtisan?: string;
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
    // Décision du dirigeant du 23/10/2026 (« le cautionnement et l'état des lieux doivent être signés sur Gerimmo
    // directement ») : l'acte de cautionnement et l'état des lieux restent dans la liste, comme sur /tarifs et
    // « Mon abonnement » (plan de conformité du 23/10, lot 4).
    role: "Signature électronique des baux, avenants, accords, devis, actes de cautionnement et états des lieux : document à signer, nom, adresse électronique et téléphone mobile des signataires ; invitations par courriel, code à usage unique par SMS, certificat de réalisation commun à tous les signataires ; conservation des documents signés et de leur certificat jusqu'à leur suppression",
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
    // Audit palier 1 du 22/11/2026 (P0-10) : le rôle public taisait deux envois faits à la demande de l'utilisateur —
    // l'assistant « Demander à Gerimmo » (lib/conversation-privee-ia.ts) et la lecture assistée d'une facture ou d'une
    // photo de compteur (lib/lecture-document-ia.ts), qui transmet le fichier entier. Il les nomme désormais.
    role: "Aides par intelligence artificielle, déclenchées à la demande : assistant « Demander à Gerimmo » (le sujet choisi et les messages écrits par l’utilisateur, sans dossier joint) ; lecture assistée d’une facture ou d’une photo de compteur (le fichier choisi par l’utilisateur, avec ce qu’il contient) ; propositions de devis artisans (catalogue tarifaire et symptômes techniques sélectionnés, sans nom, adresse ni description libre des occupants). Assistance rédactionnelle de la supervision (veille, brouillons et illustrations du Journal) : textes éditoriaux publics",
    // Pour le Client, la supervision éditoriale n'est pas un traitement pour son compte : `roleClient` alimente
    // l'annexe 1 des conditions, dont le texte est figé par version (tests/conditions-empreinte.test.ts).
    // Version du 24/11/2026 (écart R34-A1, décision Q15) : l'annexe ne citait que les propositions de devis. Elle
    // décrit désormais les trois envois que le code fait réellement, relus le 24/11/2026 :
    //  · lib/conversation-privee-ia.ts — le sujet choisi, la question et l'historique de la conversation ;
    //  · lib/lecture-document-ia.ts — le fichier entier (PDF ou image), encodé dans la requête ;
    //  · lib/proposition-devis-ia.ts — la catégorie, les symptômes reconnus dans une liste fermée de mots, le catalogue.
    // La changer exige une nouvelle version des conditions.
    roleClient: "Aides par intelligence artificielle, déclenchées à la demande de l'utilisateur : assistant « Demander à Gerimmo » (le sujet choisi et les messages de la conversation, avec tout ce que l'utilisateur y écrit ; aucun dossier n'est joint) ; lecture assistée d'une facture ou d'une photo de compteur (le fichier choisi par l'utilisateur, transmis en entier avec tout ce qu'il contient) ; propositions de devis artisans (catégorie de la demande, symptômes techniques reconnus dans une liste fermée de mots et catalogue tarifaire, à l'exclusion des noms, adresses et descriptions libres des occupants)",
    // L'espace artisan n'a ni l'assistant ni la lecture assistée (réservés aux espaces propriétaire et locataire) :
    // pour l'Artisan, OpenAI ne reçoit que les propositions de devis. Ce texte est celui de l'annexe des conditions de
    // l'espace artisan depuis le 24/10/2026 ; il ne change pas, et ces conditions gardent leur version.
    roleArtisan: "Propositions de devis artisans : catalogue tarifaire et symptômes techniques sélectionnés, à l'exclusion des noms, adresses et descriptions libres des occupants",
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
    // Plan de conformité du 23/10 (lot 4) : un service public appelé par le navigateur, pas un sous-traitant de Gerimmo.
    role: "Service public appelé directement par votre navigateur pour compléter l'adresse d'un bien ; il reçoit le texte tapé et l'adresse IP de votre connexion",
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

/** Les mêmes sous-traitants, avec le rôle qui concerne l'Artisan : annexe des conditions de l'espace artisan. */
export function sousTraitantsArtisan(liste: readonly Prestataire[] = PRESTATAIRES): Prestataire[] {
  return liste.filter((p) => p.sousTraitantClient).map((p) => ({ ...p, role: p.roleArtisan ?? p.roleClient ?? p.role }));
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
// 24/10/2026 : V1, publiée le jour où le code qui la rend vraie est en production
// (PR #246, f79674c, mise en ligne le 24/10 ; plan de conformité du 23/10, lots 3
// et 4) — offre aux seuls propriétaires gérant leurs biens (agences retirées),
// rétractation en ligne (8.10), impayé et suspension (15), garanties légales
// (14 bis), signature électronique du bail, du cautionnement et de l'état des
// lieux (4.7), conservation, inactivité de 24 mois et archive complète (9),
// révision et modifications soumises à l'accord exprès (8.9, 16), annexe
// article 28 complétée, annexe L. 215 ; conditions de l'espace artisan séparées
// (même date). La règle d'inactivité (VERSION_MIN_INACTIVITE,
// lib/comptes-fermeture.ts) et la règle de conservation compte:inactif
// (migration 20261024150000) s'activent avec elle.
// 24/11/2026 : reprise du lot D7 et lot « textes » T4 — article 17 (médiateur : un seul texte, vrai qu'il soit désigné
// ou non, qui renvoie aux mentions légales), annexe 1 (ce qui est réellement transmis à OpenAI), conservation des
// factures portée de six à dix ans (article 9), article 2 (« l'entreprise »), article 15.3 (réexamen par une
// personne). Déclarée « nouvelles souscriptions uniquement » dans conditions-versions.json : le recueil de l'accord
// exprès des clients déjà abonnés est un autre lot (décision Q15, lot D4).
export const CONDITIONS_VERSION = "2026-11-24";

/** Date d'entrée en vigueur affichée en tête des conditions. */
export const CONDITIONS_DATE = "24 novembre 2026";

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
// modification de fond, avec la date affichée.
// 24/10/2026 : première version, publiée le même jour que la V1 des conditions clients.
export const CONDITIONS_ARTISANS_VERSION: string | null = "2026-10-24";

/** Date d'entrée en vigueur affichée en tête des conditions de l'espace artisan ; `null` tant qu'elles ne sont pas publiées. */
export const CONDITIONS_ARTISANS_DATE: string | null = "24 octobre 2026";
