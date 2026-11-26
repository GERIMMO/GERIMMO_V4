// CE QU'ON PEUT FAIRE DE SON PROPRE COMPTE — la logique, sans écran ni réseau.
//
// POURQUOI CET ÉCRAN EXISTE (relevé du 19/09). Un utilisateur connecté n'avait
// AUCUN moyen de changer son mot de passe : le seul chemin passait par
// « Mot de passe oublié », donc par un email, donc par une boîte mail
// accessible — et il n'avait aucun moyen de remplacer son second facteur.
// Le porteur du projet s'est retrouvé enfermé dehors le jour où son trousseau
// a perdu la clé TOTP : seule une intervention en base a pu le rouvrir. Un
// produit qui exige une intervention manuelle pour un geste aussi banal n'est
// pas fini.
//
// Ces fonctions sont pures pour être vérifiables : l'écran et l'action serveur
// ne font que les appeler.

/** Politique RM-A4.3 : douze caractères, vérifiés contre les fuites côté Auth. */
export const LONGUEUR_MINIMALE = 12;

/**
 * Le motif de refus d'un changement de mot de passe, ou `null` si la saisie
 * tient. L'ordre des contrôles est celui que la personne vit : d'abord ce
 * qu'elle a oublié de taper, ensuite ce qui ne va pas dans ce qu'elle a tapé.
 */
export function verdictMotDePasse(
  actuel: string,
  nouveau: string,
  confirmation: string
): string | null {
  if (!actuel) return "Saisissez votre mot de passe actuel.";
  if (nouveau.length < LONGUEUR_MINIMALE) {
    return `Le nouveau mot de passe doit compter au moins ${LONGUEUR_MINIMALE} caractères.`;
  }
  if (nouveau === actuel) {
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  if (nouveau !== confirmation) return "Les deux saisies ne correspondent pas.";
  return null;
}

/**
 * Ce que la trace d'un changement de mot de passe dit de la fermeture des AUTRES sessions (lot L1, 26/11/2026).
 *
 * `signOut({ scope: "others" })` rend une erreur quand Auth échoue ou ne répond pas (erreur du service, limite de
 * fréquence, réseau ; le SDK tait lui-même un 401, 403 ou 404), et rien ne dit alors qu'une session a été fermée.
 * L'échec part dans le détail de l'événement « changement_mot_de_passe » : un compte connecté n'écrit au journal
 * technique qu'une liste fermée d'événements (migration 20260927141000). Seuls la nature de l'erreur et son statut
 * y figurent, jamais son message ; la console n'affiche de toute façon que des codes courts et des nombres. Quand la
 * fermeture a abouti, rien n'est ajouté : la trace d'un changement ordinaire reste celle d'avant.
 */
export function traceFermetureAutresSessions(
  erreur: { code?: string; name?: string; status?: number } | null
): Record<string, string | number> {
  if (!erreur) return {};
  return {
    fermeture_autres_sessions: "echec",
    erreur: erreur.code ?? erreur.name ?? "inconnue",
    ...(typeof erreur.status === "number" ? { statut: erreur.status } : {}),
  };
}

export type FacteurTotp = {
  id: string;
  friendly_name?: string | null;
  status?: string;
};

/**
 * Où en est la double authentification de ce compte :
 *  · `aucun` — rien de vérifié : on peut en ajouter un, librement ;
 *  · `a-confirmer` — un facteur vérifié existe, mais la session est restée en
 *    aal1 : Supabase REFUSERA de le retirer (403) tant qu'un code n'a pas été
 *    saisi. C'est exactement le mur contre lequel le porteur du projet s'est
 *    cogné ; l'écran doit donc demander le code AVANT de proposer le retrait,
 *    et non après ;
 *  · `actif` — facteur vérifié et session élevée : tout est possible.
 *
 * Un facteur non vérifié (configuration interrompue) ne compte pas : il
 * n'ouvre rien et ne protège rien.
 */
export type EtatSecondFacteur = "aucun" | "a-confirmer" | "actif";

export function etatSecondFacteur(
  facteurs: FacteurTotp[],
  niveau: string | null | undefined
): EtatSecondFacteur {
  const verifies = facteurs.filter((f) => f.status === "verified");
  if (verifies.length === 0) return "aucun";
  return niveau === "aal2" ? "actif" : "a-confirmer";
}

// Les facteurs sont nommés « Application Gerimmo <horodatage ISO> » à
// l'inscription : lisible pour la machine, illisible pour l'utilisateur.
const PREFIXE_NOM = "Application Gerimmo ";

/** Le nom d'un facteur, dit en français. */
export function libelleFacteur(
  facteur: FacteurTotp,
  formaterDate: (iso: string) => string
): string {
  const nom = facteur.friendly_name ?? "";
  if (nom.startsWith(PREFIXE_NOM)) {
    const horodatage = nom.slice(PREFIXE_NOM.length).trim();
    const date = new Date(horodatage);
    if (horodatage && !Number.isNaN(date.getTime())) {
      return `Application ajoutée le ${formaterDate(horodatage)}`;
    }
  }
  return nom || "Application d'authentification";
}

/** Le nom donné à un facteur qu'on crée maintenant. */
export function nomPourNouveauFacteur(maintenant: Date): string {
  return `${PREFIXE_NOM}${maintenant.toISOString().slice(0, 19)}`;
}
