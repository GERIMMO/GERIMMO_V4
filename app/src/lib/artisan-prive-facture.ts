// Décision D24-B du dirigeant (14/10/2026, fiches ARC-07 et ARC-04) : une facture externe déposée est définitive
// (aucune correction ni annulation n'existe encore), donc un écran de relecture précède le dépôt, et le numéro ne
// peut servir qu'une fois pour un même artisan, sans tenir compte des majuscules ni des espaces autour.

/** Le texte que la base renvoie (migration 20261014310000) quand le numéro est déjà pris. */
export const MESSAGE_NUMERO_FACTURE_UTILISE =
  "Ce numéro de facture est déjà utilisé dans votre registre (les majuscules et les espaces autour ne comptent pas). Chaque facture doit porter son propre numéro : vérifiez-le sur la pièce jointe.";
