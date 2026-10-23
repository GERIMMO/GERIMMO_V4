// L'ACCEPTATION DES CONDITIONS, SELON L'ESPACE (plan de conformité du 23/10/2026, lot 1A : constats R10 et R60).
//
// Trois documents s'acceptent, et la base enregistre lequel (`acceptations_cgu.document`, migration 20261024090000) :
//  · « conditions_clients » : les conditions générales d'utilisation et de vente, acceptées par le propriétaire qui gère
//    ses biens (le Client) ;
//  · « conditions_artisans » : les conditions de l'espace artisan, DÈS QU'ELLES SONT PUBLIÉES (CONDITIONS_ARTISANS_VERSION
//    de lib/editeur.ts). Tant que la constante vaut `null`, tout ce qui est propre à l'artisan est inactif : il accepte
//    les conditions clients, comme avant, et la garde de son espace n'exige rien ;
//  · « regles_invites » : la personne invitée (un locataire) ne contracte pas avec l'Éditeur et n'accepte pas des
//    conditions de vente (R60). Elle prend connaissance des règles de son espace, que décrit l'article 7 de la version en
//    vigueur (« Espaces des locataires et des propriétaires mandants » : ces personnes ne contractent pas avec
//    l'Éditeur, ce qu'elles peuvent faire dans leur espace, l'exercice de leurs droits auprès du Client). Version
//    enregistrée : celle des conditions générales qui portent cet article (CONDITIONS_VERSION).
//
// Ce module ne lit rien et n'importe rien du serveur : libellés, refus et décisions sont communs au formulaire (client)
// et aux actions (serveur). La version des conditions de l'espace artisan se lit à l'appel, jamais au chargement : les
// tests éprouvent les deux états (publiées ou non) en remplaçant la constante.

import { CONDITIONS_ARTISANS_DATE, CONDITIONS_ARTISANS_VERSION, CONDITIONS_VERSION } from "@/lib/editeur";

export const DOCUMENTS_ACCEPTES = ["conditions_clients", "conditions_artisans", "regles_invites"] as const;
export type DocumentAccepte = (typeof DOCUMENTS_ACCEPTES)[number];

export function estDocumentAccepte(valeur: unknown): valeur is DocumentAccepte {
  return typeof valeur === "string" && (DOCUMENTS_ACCEPTES as readonly string[]).includes(valeur);
}

/** Les usages proposés au premier choix du mot de passe (« Vous utilisez Gerimmo pour »). */
export const ESPACES_INSCRIPTION = ["proprietaire_direct", "artisan", "invite"] as const;
export type EspaceInscription = (typeof ESPACES_INSCRIPTION)[number];

export function estEspaceInscription(valeur: unknown): valeur is EspaceInscription {
  return typeof valeur === "string" && (ESPACES_INSCRIPTION as readonly string[]).includes(valeur);
}

/** Les conditions de l'espace artisan : version et date affichée, ou `null` tant qu'elles ne sont pas publiées. */
export type ConditionsArtisans = { version: string | null; date: string | null };

/** L'état publié aujourd'hui, lu à l'appel (lib/editeur.ts). */
export function conditionsArtisansEnVigueur(): ConditionsArtisans {
  return { version: CONDITIONS_ARTISANS_VERSION, date: CONDITIONS_ARTISANS_DATE };
}

/**
 * La version des conditions de l'espace artisan que l'artisan doit accepter, ou `null` : rien à exiger tant qu'elles
 * ne sont pas publiées. Une valeur vide compte comme absente (jamais une version « » enregistrée).
 */
export function versionArtisansPubliee(artisans: ConditionsArtisans = conditionsArtisansEnVigueur()): string | null {
  const version = artisans.version?.trim();
  return version ? version : null;
}

/** L'adresse de la page des conditions de l'espace artisan (vague « textes »). */
export const CHEMIN_CONDITIONS_ARTISANS = "/conditions/artisans";

/**
 * La case des conditions telle qu'un espace la présente : le document et la version qu'elle fait accepter, son libellé
 * (en trois morceaux, le lien portant celui du milieu) et le refus quand elle n'est pas cochée.
 */
export type CaseConditions = {
  document: DocumentAccepte;
  version: string;
  avant: string;
  lien: string;
  apres: string;
  href: string;
  refus: string;
};

/** La case des conditions clients, la même partout où un propriétaire ouvre son espace (R60 : libellé unique). */
export const CASE_CONDITIONS_CLIENTS: Omit<CaseConditions, "version"> = {
  document: "conditions_clients",
  avant: "J’accepte les ",
  lien: "conditions générales d’utilisation et de vente",
  apres: ".",
  href: "/conditions",
  refus: "Acceptez les conditions générales d’utilisation et de vente pour continuer.",
};

/** La case d'une personne invitée : elle prend connaissance des règles de son espace (article 7), sans contracter. */
export const CASE_REGLES_INVITES: Omit<CaseConditions, "version"> = {
  document: "regles_invites",
  avant: "J’ai pris connaissance des ",
  lien: "règles d’utilisation des espaces invités",
  apres: " (article 7 des conditions générales).",
  href: "/conditions",
  refus: "Cochez la case pour confirmer que vous avez pris connaissance des règles d’utilisation des espaces invités.",
};

/** La case de l'artisan, une fois ses conditions publiées. */
export const CASE_CONDITIONS_ARTISANS: Omit<CaseConditions, "version"> = {
  document: "conditions_artisans",
  avant: "J’accepte les ",
  lien: "conditions de l’espace artisan",
  apres: ".",
  href: CHEMIN_CONDITIONS_ARTISANS,
  refus: "Acceptez les conditions de l’espace artisan pour continuer.",
};

/**
 * La case que présente l'espace choisi. Un artisan dont les conditions ne sont pas publiées accepte les conditions
 * clients (comportement d'avant le 24/10) ; un usage inconnu reçoit la case du propriétaire, la plus engageante, que le
 * serveur refuse de toute façon (« Choisissez l'usage de votre compte »).
 */
export function caseConditions(espace: string, artisans: ConditionsArtisans = conditionsArtisansEnVigueur()): CaseConditions {
  if (espace === "invite") return { ...CASE_REGLES_INVITES, version: CONDITIONS_VERSION };
  const versionArtisans = espace === "artisan" ? versionArtisansPubliee(artisans) : null;
  if (versionArtisans) return { ...CASE_CONDITIONS_ARTISANS, version: versionArtisans };
  return { ...CASE_CONDITIONS_CLIENTS, version: CONDITIONS_VERSION };
}

/** Le libellé complet de la case, en texte (tests, accessibilité). */
export function libelleCase(c: Pick<CaseConditions, "avant" | "lien" | "apres">): string {
  return `${c.avant}${c.lien}${c.apres}`;
}

/** Le nom du champ caché qui dit quelle case l'écran a montrée, au moment de l'envoi. */
export const CHAMP_DOCUMENT_AFFICHE = "cgu_document";

/**
 * Le document dont la case a été AFFICHÉE à l'envoi. Une page servie avant le 24/10 (déploiement pendant la saisie)
 * n'envoie pas ce champ : elle ne montrait que la case des conditions clients.
 */
export function documentAffiche(brut: FormDataEntryValue | null): DocumentAccepte | null {
  if (brut === null) return "conditions_clients";
  return estDocumentAccepte(brut) ? brut : null;
}

/**
 * Le refus quand l'usage du compte a changé sans que la case suive (formulaire envoyé sans script après avoir changé
 * la liste) : la case affichée n'était pas celle de l'usage choisi. Rien n'est enregistré ; la case revient décochée,
 * avec le bon libellé.
 */
export const MESSAGE_CASE_A_REVOIR =
  "L’usage de votre compte a changé : lisez la case qui s’affiche maintenant, cochez-la, puis validez de nouveau.";

// ── « Plus tard » sur l'écran d'une nouvelle version (R19) ─────────────────────────────────────────────────────────

/** La clé de « Plus tard » dans le stockage de session de l'onglet : aucun témoin, effacée à la fermeture de l'onglet. */
export const CLE_REPORT_CONDITIONS = "gerimmo-conditions-plus-tard";

/**
 * La valeur gardée par « Plus tard » : la version reportée et l'heure de la connexion pendant laquelle elle l'a été.
 * Une nouvelle connexion change cette heure : l'écran revient (« à la connexion », plan § 3, lot 1A).
 */
export function valeurReport(version: string, derniereConnexion: string | null): string {
  return `${version}|${derniereConnexion ?? "-"}`;
}
