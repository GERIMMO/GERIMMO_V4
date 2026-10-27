import { headers } from "next/headers";
import { ENTETE_CHEMIN, ENTETE_METHODE } from "@/lib/entetes-traversee";
import { estCodeGeste, type GesteTrace } from "@/lib/gestes-trace";

/**
 * D08-C : traversée en lecture seule, tracée sous le compte réel.
 * Le proxy décrit la requête ; la base refuse les écritures métier indépendamment
 * de ces en-têtes. Le support utilise des gestes distincts, motivés et bornés.
 * Une trace décrit la décision d'accès ; le résultat effectif du support est
 * journalisé dans la même transaction que son écriture.
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
      ecriture: Boolean(action) || (methode !== "GET" && methode !== "HEAD"),
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
  motif?: "organisation_introuvable" | "lecture_seule";
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
 * Écrit la ligne d’audit d’une traversée. Un échec se lit dans le journal serveur
 * et rend `false` : les gardes de consultation doivent alors refuser de livrer les données.
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
