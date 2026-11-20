// Continuité de navigation entre un espace (propriétaire, agence, locataire, artisan, supervision) et les pages
// servies hors de sa coquille : conditions générales, confidentialité, aide, compte, quittance, outils, journal…
//
// Constat de l'audit du 20/11/2026 : ces pages affichaient la vitrine publique (« Se connecter », « Créer mon
// compte ») à une personne déjà connectée, sans aucun retour vers son espace. Elle avait l'impression de sortir de
// Gerimmo. Logique pure, sans navigateur : le composant `ContinuiteEspace` l'applique, les tests la vérifient.

export const CLE_ESPACE = "gerimmo:espace";

export type EspaceMemorise = { href: string; libelle: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Les pages publiques rangées sous `/artisan` : s'y trouver ne prouve aucune session. */
const ARTISAN_PUBLIC = /^\/artisan\/(inscription|panne)(\/|$)/;

/** Les écrans d'entrée et de sortie de session : y arriver efface l'espace retenu, et aucun bandeau n'y paraît. */
const ENTREE_SESSION = /^\/(connexion|inscription|mot-de-passe-oublie|nouveau-mot-de-passe|auth|invitations|signature)(\/|$)/;

/** L'espace auquel appartient un chemin, ou null s'il est servi hors de toute coquille d'espace. */
export function espaceDuChemin(chemin: string): string | null {
  if (new RegExp(`^/espace/${UUID}(/|$)`, "i").test(chemin)) return "mon espace propriétaire";
  if (new RegExp(`^/agence/${UUID}(/|$)`, "i").test(chemin)) return "mon espace de gestion";
  if (new RegExp(`^/locataire/${UUID}(/|$)`, "i").test(chemin)) return "mon espace locataire";
  if (/^\/artisan(\/|$)/.test(chemin) && !ARTISAN_PUBLIC.test(chemin)) return "mon espace artisan";
  if (/^\/admin(\/|$)/.test(chemin)) return "la supervision";
  return null;
}

/**
 * L'accueil de l'espace auquel appartient un chemin : là où ramener quelqu'un depuis un écran d'erreur ou une page
 * introuvable, sans le faire sortir de son espace. Null hors d'un espace.
 */
export function accueilEspaceDuChemin(chemin: string): EspaceMemorise | null {
  const libelle = espaceDuChemin(chemin);
  if (!libelle) return null;
  const avecIdentifiant = new RegExp(`^/(espace|agence|locataire)/${UUID}`, "i").exec(chemin);
  if (avecIdentifiant) return { href: avecIdentifiant[0], libelle };
  return { href: chemin.startsWith("/admin") ? "/admin" : "/artisan", libelle };
}

/** Ce chemin ouvre ou ferme une session : la mémoire de l'espace n'y survit pas. */
export function cheminEntreeSession(chemin: string): boolean {
  return ENTREE_SESSION.test(chemin);
}

/**
 * Relit ce qui a été retenu. Tout ce qui ne désigne pas un chemin interne d'espace est écarté : la valeur vient du
 * stockage du navigateur, on ne la suit jamais vers une autre origine ni vers une page quelconque.
 */
export function lireEspaceMemorise(brut: string | null): EspaceMemorise | null {
  if (!brut) return null;
  try {
    const valeur = JSON.parse(brut) as Partial<EspaceMemorise> | null;
    if (!valeur || typeof valeur.href !== "string") return null;
    if (!valeur.href.startsWith("/") || valeur.href.startsWith("//") || valeur.href.includes("\\")) return null;
    const chemin = valeur.href.split(/[?#]/)[0];
    const libelle = espaceDuChemin(chemin);
    if (!libelle) return null;
    return { href: valeur.href.slice(0, 600), libelle };
  } catch {
    return null;
  }
}

/** Ce qu'il faut retenir en visitant ce chemin (recherche comprise), ou null hors d'un espace. */
export function espaceAMemoriser(chemin: string, recherche = ""): EspaceMemorise | null {
  const libelle = espaceDuChemin(chemin);
  if (!libelle) return null;
  return { href: `${chemin}${recherche}`.slice(0, 600), libelle };
}
