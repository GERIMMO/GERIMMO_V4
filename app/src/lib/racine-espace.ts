// LES DEUX RACINES DES ÉCRANS DE GESTION — décision D27 (fiche DES-A-08, option B, ratifiée le 14/10/2026).
//
// Les écrans de gestion (parc, baux, loyers, personnes…) sont partagés par les agences et par le propriétaire direct :
// un seul jeu de pages, sous `src/app/agence/[orgId]`. Le propriétaire direct n'a pourtant plus à lire le mot
// « agence » dans son adresse : ses écrans vivent sous `/espace/<id>/…`.
//
//  · `/espace/<id>/…` est un ALIAS : aucun dossier `espace` n'existe dans `src/app`. Le proxy (src/proxy.ts) réécrit
//    l'adresse vers `/agence/<id>/…`, APRÈS toutes ses gardes (session, expiration, second facteur, porte de /admin),
//    et seulement quand `<id>` est l'organisation d'un propriétaire direct à laquelle la personne a un accès de
//    gestion. Pour toute autre organisation, l'alias répond « introuvable » (404). Sans le proxy, l'alias n'existe pas.
//  · `/agence/<id>/…` d'un propriétaire direct est REDIRIGÉ À VIE (308, chemin et requête conservés) vers
//    `/espace/<id>/…` : les liens déjà envoyés ou mis en favori continuent de fonctionner. Les agences ne changent pas.
//  · Tout lien que l'application émet pour un propriétaire direct pointe vers `/espace` (ce module en est la source).
//
// Les chemins de ROUTE (`revalidatePath`, `LayoutProps<"/agence/[orgId]">`) restent ceux des dossiers : `/agence/…`.
// La garde des pages (verifierAccesEspace) et la RLS de la base ne changent pas : elles restent les vraies portes.

export const RACINE_AGENCE = "/agence";
export const RACINE_PROPRIETAIRE = "/espace";

/** La racine des écrans : `/espace` pour un propriétaire direct, `/agence` pour une agence et ses agents. */
export function racineEspace(estProprietaire: boolean): string {
  return estProprietaire ? RACINE_PROPRIETAIRE : RACINE_AGENCE;
}

/** L'adresse de base d'une organisation : `/espace/<id>` ou `/agence/<id>`. */
export function baseEspace(orgId: string, estProprietaire: boolean): string {
  return `${racineEspace(estProprietaire)}/${orgId}`;
}

/** La base d'une organisation d'après une racine déjà connue (« /espace » ou « /agence ») ; « /agence » par défaut. */
export function baseDepuisRacine(orgId: string, racine: string = RACINE_AGENCE): string {
  return `${racine === RACINE_PROPRIETAIRE ? RACINE_PROPRIETAIRE : RACINE_AGENCE}/${orgId}`;
}

// « /agence/<id>… » ou « /espace/<id>… » en tête d'un chemin, quelle que soit la forme de l'identifiant.
const CHEMIN_AGENCE = /^\/agence\/([^/?#]+)/;
const CHEMIN_ESPACE = /^\/espace\/([^/?#]+)/;

/**
 * Le même chemin, sous la racine du propriétaire direct : « /agence/<id>/parc?x=1#y » → « /espace/<id>/parc?x=1#y ».
 * Tout autre chemin (autre racine, autre espace, adresse externe) est rendu tel quel.
 */
export function versEspaceProprietaire(chemin: string): string {
  return chemin.replace(CHEMIN_AGENCE, `${RACINE_PROPRIETAIRE}/$1`);
}

/** Le chemin émis pour ce profil : transformé pour un propriétaire direct, inchangé pour une agence. */
export function cheminPourProfil(chemin: string, estProprietaire: boolean): string {
  return estProprietaire ? versEspaceProprietaire(chemin) : chemin;
}

/** Le chemin sous la racine des dossiers (la route réelle), quel que soit le profil : « /espace/<id>/x » → « /agence/<id>/x ». */
export function versRouteAgence(chemin: string): string {
  return chemin.replace(CHEMIN_ESPACE, `${RACINE_AGENCE}/$1`);
}

/** Le chemin appartient-il aux écrans de gestion (l'une ou l'autre racine) ? */
export function estCheminDeGestion(chemin: string): boolean {
  return CHEMIN_AGENCE.test(chemin) || CHEMIN_ESPACE.test(chemin);
}

/** L'identifiant d'une organisation tel que les adresses le portent (UUID) : la seule forme que le proxy accepte. */
export const MOTIF_IDENTIFIANT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHEMIN_STRICT = new RegExp(`^/(agence|espace)/(${MOTIF_IDENTIFIANT})(/.*)?$`, "i");

export type CheminDeGestion = {
  /** La racine demandée. */
  racine: "agence" | "espace";
  /** L'organisation, en minuscules. */
  orgId: string;
  /** Le reste du chemin, avec sa barre oblique initiale (« /parc »), ou « » pour l'accueil. */
  suite: string;
};

/** Découpe une adresse `/agence/<uuid>/…` ou `/espace/<uuid>/…` ; null pour tout le reste (y compris un identifiant illisible). */
export function lireCheminDeGestion(pathname: string): CheminDeGestion | null {
  const m = CHEMIN_STRICT.exec(pathname);
  if (!m) return null;
  return { racine: m[1].toLowerCase() as "agence" | "espace", orgId: m[2].toLowerCase(), suite: m[3] ?? "" };
}

/**
 * Ce que le proxy fait d'une adresse de gestion, selon le TYPE de l'organisation visée tel que la personne y a accès
 * (null : aucun accès de gestion connu).
 *
 *  · `/espace/<id>` : réécrit vers `/agence/<id>` si et seulement si <id> est une organisation de propriétaire direct
 *    à laquelle la personne a accès ; sinon « introuvable » (l'adresse d'un autre profil n'est pas atteignable par
 *    l'alias, et l'on ne dit pas si l'organisation existe) ;
 *  · `/agence/<id>` d'un propriétaire direct : redirigé à vie (308) vers `/espace/<id>` pour une lecture (GET, HEAD).
 *    Un envoi (le POST d'une action serveur d'une page ouverte avant la mise en ligne) n'est pas redirigé : un 308 le
 *    rejouerait ailleurs ; il est servi tel quel et sa garde habituelle s'applique ;
 *  · `/agence/<id>` de toute autre organisation : inchangé.
 */
export type DecisionAlias = "passer" | "rediriger" | "reecrire" | "introuvable";

/**
 * L'en-tête de requête que le proxy pose sur une adresse qu'il vient de réécrire de `/espace/<id>` vers `/agence/<id>`.
 * Sa valeur est l'identifiant de l'organisation.
 *
 * Pourquoi : la première réalisation de D27 (14/10) a relevé que `next start` rappelait le proxy sur l'adresse réécrite ;
 * la seconde passe y voyait un ancien lien /agence d'un propriétaire direct et le redirigeait vers /espace : boucle sans
 * fin. La sonde du 15/10 (Next.js 16.3.8, journal `next:router-server:resolve-routes`) ne voit plus qu'une passe pour une
 * page, une requête RSC et un envoi d'action : la marque reste en garde-fou, pour une version ou un hébergement qui
 * rappellerait le proxy. Elle dit à une éventuelle seconde passe « cette adresse vient d'être réécrite, ne la redirige
 * pas ». Elle ne dispense de RIEN d'autre (session, expiration,
 * second facteur, porte de /admin, garde de la page, RLS) : seule la redirection de confort est sautée. Un visiteur qui
 * la forge n'y gagne que de ne pas être redirigé vers l'adresse canonique de SA PROPRE organisation ; la marque n'est
 * honorée que sur /agence, et que pour l'organisation qu'elle nomme.
 */
export const ENTETE_ALIAS = "x-gerimmo-alias-espace";

export function decisionAlias(
  chemin: CheminDeGestion,
  typeOrganisation: string | null,
  methode: string,
  dejaReecrite = false,
): DecisionAlias {
  const proprietaire = typeOrganisation === "proprietaire_direct";
  if (chemin.racine === "espace") return proprietaire ? "reecrire" : "introuvable";
  if (!proprietaire || dejaReecrite) return "passer";
  return methode === "GET" || methode === "HEAD" ? "rediriger" : "passer";
}

/** La requête vient-elle d'être réécrite par le proxy depuis l'alias de CETTE organisation ? (voir ENTETE_ALIAS) */
export function estDejaReecrite(chemin: CheminDeGestion, valeurEntete: string | null): boolean {
  return chemin.racine === "agence" && valeurEntete !== null && valeurEntete.trim().toLowerCase() === chemin.orgId;
}
