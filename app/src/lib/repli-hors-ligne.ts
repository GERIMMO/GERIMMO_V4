import { clicQuitteLaPage, type ClicSurLien, type LienClique } from "@/lib/protection-saisie";

/**
 * Repli hors ligne SANS service worker (décision D26 B, audit du 13/10/2026, DES-A-06).
 *
 * Hors ligne, un clic sur un lien de l'application menait à la page d'erreur du navigateur (« No internet », en
 * anglais) qui ne se corrigeait pas au retour du réseau : Next.js tente la navigation, la requête échoue, et il retombe
 * sur un chargement complet de la page, que le navigateur refuse. On ne peut pas afficher de page de l'application à ce
 * moment-là sans service worker — et un service worker mettrait des pages authentifiées en cache sur l'appareil, ce que la
 * décision exclut (option C, pas avant D14). On retient donc le clic AVANT la navigation, quand l'appareil sait qu'il n'a
 * plus de réseau : l'utilisateur reste dans l'application, avec un message et un bouton « Réessayer ».
 *
 * Limite assumée : `navigator.onLine` ne dit « hors ligne » que lorsque l'appareil n'a plus aucun réseau (mode avion,
 * tunnel, ascenseur). Un réseau présent mais mourant (un seul trait de signal) passe pour « en ligne » : la navigation
 * échoue alors comme avant. Seul un service worker saurait traiter ce cas.
 */
export const TEXTES_HORS_LIGNE = {
  titre: "Connexion perdue",
  horsLigne: "Votre appareil n’est plus connecté à Internet. Vous restez sur cette page : vérifiez votre connexion, puis touchez « Réessayer ».",
  toujoursHorsLigne: "La connexion n’est pas revenue. Vérifiez votre réseau, puis réessayez.",
  connexionRevenue: "La connexion est revenue. Touchez « Réessayer » pour ouvrir la page.",
  reessayer: "Réessayer",
  fermer: "Fermer",
} as const;

export type EtatRepli = { connexionRevenue: boolean; echecReessai: boolean };

/** Le message à lire, selon que la connexion est revenue ou qu'un essai vient d'échouer. */
export function messageDuRepli({ connexionRevenue, echecReessai }: EtatRepli): string {
  if (connexionRevenue) return TEXTES_HORS_LIGNE.connexionRevenue;
  if (echecReessai) return TEXTES_HORS_LIGNE.toujoursHorsLigne;
  return TEXTES_HORS_LIGNE.horsLigne;
}

/**
 * Ce clic doit-il être retenu ? Oui s'il quitterait la page (même règle que les gardes de départ des formulaires :
 * `clicQuitteLaPage`) et que l'appareil n'a plus de réseau. `page` est l'adresse courante (`location.href`).
 */
export function doitRetenirLeClic(clic: ClicSurLien, lien: LienClique, page: string, enLigne: boolean): boolean {
  return !enLigne && clicQuitteLaPage(clic, lien, page);
}
