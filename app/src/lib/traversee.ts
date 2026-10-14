import { headers } from "next/headers";
import { ENTETE_CHEMIN, ENTETE_METHODE } from "@/lib/entetes-traversee";
import { estCodeGeste, type GesteTrace } from "@/lib/gestes-trace";

/**
 * Trace de l'entrée du super-administrateur dans un espace client (audit du 13/10, SA-01 et SA-09,
 * décision D08, option A : statu quo accepté, trace plus précise — AUCUN droit ne change).
 *
 * Avant : la ligne d'audit `traversee_action` disait seulement « un super-administrateur est passé »
 * (détails vides), elle partait aussi à la simple ouverture d'une page, et chaque navigation écrivait
 * de 1 à 15 lignes `traversee_espace` vides (pages liées chargées à l'avance, pages et mises en page
 * rendues par des requêtes distinctes).
 *
 * Maintenant, chaque ligne dit :
 * - l'ACTION : une consultation de page (`traversee_espace`) ou un geste lancé depuis une page
 *   (`traversee_action`, seulement quand la requête peut écrire : action serveur ou formulaire en POST
 *   — jamais à l'ouverture d'une page ni au téléchargement d'un fichier) ;
 * - l'OBJET : l'adresse, la rubrique de l'espace et l'identifiant de l'objet ouvert (bail, lot,
 *   incident…) quand l'adresse en porte un. Pour une action FINANCIÈRE, l'action dit elle-même son nom
 *   (`geste`) et la cible qu'elle modifie (l'identifiant du bail, du rapport, de l'écriture…) : la cible l'emporte
 *   sur l'objet de la page d'où part le geste, qui n'en porte souvent aucun (la fenêtre de lot est sur
 *   `/agence/<org>/parc`) — voir lib/gestes-trace.ts ;
 * - le RÉSULTAT : la décision d'accès — `autorise`, ou `refuse` (organisation introuvable). Une demande
 *   vers une organisation qui n'existe pas s'écrit SANS organisation (`audit_log.organization_id` est une clé
 *   étrangère : l'identifiant d'une organisation absente ne peut pas y figurer) ; l'identifiant demandé est
 *   alors dans les détails (`org_demandee`), pour retrouver qui a essayé quoi.
 *
 * Limite assumée : la trace est posée par la porte d'entrée, AVANT le geste. Elle dit « le
 * super-administrateur est autorisé à agir ici », pas « le geste a réussi » : la console l'écrit « accès :
 * autorisé » (et non « résultat »), et le résultat d'un geste financier est lisible dans ses propres écritures
 * et lignes d'audit (`contre_ecriture`, `suppression_encaissement`…). Les actions non financières n'ont pas de
 * nom lisible côté serveur : on garde l'empreinte technique de l'action (`action_ref`) pour la rapprocher de la
 * version déployée. Faire écrire la ligne par les fonctions financières elles-mêmes (auteur, montant, résultat)
 * relève de l'option B ou C de D08, non appliquées.
 *
 * Limite constatée sur un vrai serveur (Next.js 16.3, `next start`) : une page liée que le navigateur
 * charge à l'avance (préchargement, sans que personne ne l'ouvre) est rendue par le serveur, sous la
 * session du super-administrateur, comme une page ouverte. Next.js MASQUE ses en-têtes de navigation
 * (`rsc`, `next-router-prefetch`…) au proxy et à `headers()` (documentation : « Proxy », § « RSC requests
 * and rewrites ») : rien, côté application, ne distingue les deux. Ces pages sont donc tracées comme des
 * consultations, ce qui peut surdéclarer (jamais sous-déclarer) ; la base n'écrit qu'une ligne par page et
 * par minute, ce qui borne le bruit au nombre de liens de l'écran. Activer `skipProxyUrlNormalize` pour
 * lire ces en-têtes changerait le comportement de tout le proxy : non fait ici.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ContexteRequete = {
  /** L'adresse de la requête, sans paramètres ; null hors requête (tests, outils). */
  chemin: string | null;
  /** Vrai pour une action serveur (le navigateur envoie son identifiant ; Next.js ne le masque pas). */
  actionServeur: boolean;
  /**
   * Vrai quand la requête peut écrire : une action serveur, ou toute méthode autre que GET/HEAD (un
   * formulaire envoyé sans JavaScript n'a pas d'en-tête d'action, mais c'est un POST). Inconnu = vrai.
   */
  ecriture: boolean;
  /** Empreinte technique de l'action serveur (16 premiers caractères), sinon null. */
  actionRef: string | null;
};

/** Lit le contexte de la requête en cours ; hors requête, rend un contexte « inconnu » prudent. */
export async function lireContexteRequete(): Promise<ContexteRequete> {
  try {
    const h = await headers();
    const brut = h.get(ENTETE_CHEMIN);
    const action = h.get("next-action");
    const methode = h.get(ENTETE_METHODE)?.toUpperCase() ?? null;
    return {
      chemin: brut && brut.startsWith("/") && brut.length <= 300 ? brut : null,
      actionServeur: Boolean(action),
      ecriture: Boolean(action) || (methode !== null && methode !== "GET" && methode !== "HEAD"),
      actionRef: action ? action.slice(0, 16) : null,
    };
  } catch {
    // Hors requête, le contexte est inconnu : on ne prétend pas que c'était une simple lecture.
    return { chemin: null, actionServeur: true, ecriture: true, actionRef: null };
  }
}

export type ObjetOuvert = { route: string | null; rubrique: string | null; objet_id: string | null };

/**
 * L'objet désigné par l'adresse : « /agence/<org>/baux/<bail> » → rubrique « baux », objet <bail>.
 * Une rubrique sans objet (« /agence/<org>/loyers ») n'a pas d'identifiant ; l'accueil de l'espace
 * est la rubrique « accueil ».
 */
export function decrireObjet(chemin: string | null, orgId: string): ObjetOuvert {
  if (!chemin) return { route: null, rubrique: null, objet_id: null };
  const segments = chemin.split("/").filter(Boolean);
  const position = segments.indexOf(orgId);
  // Sous « /agence/<org>/… » : la rubrique suit l'organisation. Une adresse qui ne la porte pas (geste lancé
  // d'un autre écran) garde sa première rubrique.
  const apres = position >= 0 ? segments.slice(position + 1) : segments;
  const rubrique = apres[0] ?? "accueil";
  const objet = apres.slice(1).find((segment) => UUID.test(segment) && segment !== orgId) ?? null;
  return {
    route: chemin,
    // Le code reste court et sans caractère libre : il s'affiche dans la console.
    rubrique: /^[a-z0-9_-]{1,40}$/i.test(rubrique) ? rubrique.toLowerCase() : "autre",
    objet_id: objet ? objet.toLowerCase() : null,
  };
}

type ClientQuiTrace = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

export type DemandeTrace = {
  orgId: string;
  /** `espace` : l'entrée dans l'espace ; `geste` : un geste lancé depuis l'espace. */
  nature: "espace" | "geste";
  resultat: "autorise" | "refuse";
  /** Pourquoi, quand le résultat est un refus. */
  motif?: "organisation_introuvable";
  /** Pour une action financière : son nom et la cible qu'elle modifie (lib/gestes-trace.ts). */
  geste?: GesteTrace;
};

/** Faux quand la demande vise une organisation qui n'existe pas : la ligne d'audit n'a alors aucune organisation à citer. */
function organisationConnue(demande: DemandeTrace): boolean {
  return demande.motif !== "organisation_introuvable";
}

/** Les détails de la ligne d'audit : sans texte libre ni donnée personnelle, bornés. */
export function detailsTraversee(demande: DemandeTrace, contexte: ContexteRequete): { action: "traversee_espace" | "traversee_action"; details: Record<string, string> } {
  const objet = decrireObjet(contexte.chemin, demande.orgId);
  // Un geste est une requête qui peut écrire (action serveur, formulaire envoyé en POST) ; une page,
  // un fichier ou une lecture n'en sont pas. Hors requête (contexte inconnu), on garde le cas le plus
  // prudent : un geste.
  const geste = demande.nature === "geste" && contexte.ecriture;
  const details: Record<string, string> = {
    resultat: demande.resultat,
    requete: contexte.actionServeur ? "action_serveur" : contexte.ecriture ? "formulaire" : "page",
  };
  if (demande.motif) details.motif = demande.motif;
  // L'organisation demandée n'existe pas : elle ne peut pas être la clé de la ligne, on la dit ici (un identifiant
  // valide, sinon « invalide » : une adresse trafiquée n'écrit pas de texte libre dans le journal).
  if (!organisationConnue(demande)) details.org_demandee = UUID.test(demande.orgId) ? demande.orgId.toLowerCase() : "invalide";
  if (objet.rubrique) details.rubrique = objet.rubrique;
  if (objet.objet_id) details.objet_id = objet.objet_id;
  // Le nom du geste et sa cible viennent de l'action, pas de l'adresse : seuls un nom de la liste et un
  // identifiant valide sont écrits. La cible l'emporte sur l'objet de la page d'où part le geste.
  if (demande.geste && estCodeGeste(demande.geste.geste)) {
    details.geste = demande.geste.geste;
    const cible = demande.geste.cible;
    if (typeof cible === "string" && UUID.test(cible)) details.objet_id = cible.toLowerCase();
  }
  if (objet.route) details.route = objet.route;
  if (contexte.actionRef) details.action_ref = contexte.actionRef;
  return { action: geste ? "traversee_action" : "traversee_espace", details };
}

/**
 * Écrit la ligne d'audit d'une traversée. Un échec d'écriture ne bloque pas la page (comme avant),
 * mais il se lit dans le journal du serveur. Rend `false` si la ligne n'a pas pu être écrite.
 */
export async function tracerTraversee(db: ClientQuiTrace, demande: DemandeTrace): Promise<boolean> {
  const contexte = await lireContexteRequete();
  const { action, details } = detailsTraversee(demande, contexte);
  try {
    // Sans organisation connue, la ligne est écrite sans organisation (voir plus haut) : sinon la clé étrangère
    // refuserait l'écriture et la tentative ne laisserait aucune trace.
    const org = organisationConnue(demande) ? demande.orgId : null;
    const { error } = await db.rpc("log_sa_access", { org, sa_action: action, sa_details: details });
    if (error) console.error(`[traversée] ${action} non journalisée:`, error.message);
    return !error;
  } catch (e) {
    console.error(`[traversée] ${action} non journalisée:`, e instanceof Error ? e.message : e);
    return false;
  }
}
