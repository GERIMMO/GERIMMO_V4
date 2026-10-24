// L'export complet (R49) : les règles sans effet, partagées par la route, la page et les tests.

/** Un mot de passe saisi depuis moins de ce délai vaut confirmation d'identité, comme le second facteur. */
export const DUREE_MOT_DE_PASSE_RECENT_SECONDES = 15 * 60;

/**
 * Identité confirmée récemment : second facteur validé dans la session (AAL2), ou connexion par mot de passe depuis
 * moins de quinze minutes (entrée « password » du jeton). Même règle que `demander_export_complet` en base.
 */
export function identiteRecenteConfirmee(claims: { aal?: unknown; amr?: unknown } | null | undefined, maintenant = Date.now()): boolean {
  if (!claims) return false;
  if (claims.aal === "aal2") return true;
  if (!Array.isArray(claims.amr)) return false;
  const secondes = Math.floor(maintenant / 1000);
  return claims.amr.some((e) => {
    if (!e || typeof e !== "object") return false;
    const { method, timestamp } = e as { method?: unknown; timestamp?: unknown };
    return method === "password" && typeof timestamp === "number" && Number.isSafeInteger(timestamp)
      && timestamp <= secondes + 30 && timestamp >= secondes - DUREE_MOT_DE_PASSE_RECENT_SECONDES;
  });
}

export const ETATS_EXPORT: Record<string, string> = {
  demande: "Demandée",
  en_cours: "En préparation",
  pret: "Prête",
  echec: "Échec",
  expire: "Supprimée (sept jours passés)",
};

export const MESSAGE_IDENTITE_EXPORT =
  "Pour télécharger l’archive complète, confirmez votre identité : validez votre second facteur, ou reconnectez-vous avec votre mot de passe (valable quinze minutes).";
