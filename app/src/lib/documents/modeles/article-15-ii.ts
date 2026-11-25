// Article 15, II, de la loi n° 89-462 du 6 juillet 1989 — les cinq premiers alinéas, que le congé pour vendre d'un
// logement loué nu doit REPRODUIRE (même article : « Les termes des cinq alinéas précédents sont reproduits à peine de
// nullité dans chaque notification »).
//
// D'OÙ VIENT CE TEXTE. Recueil des textes fourni par le dirigeant (24 novembre 2026, V6, référence 02), qui déclare :
// source Légifrance, version en vigueur depuis le 29 juillet 2023. Gerimmo ne l'a pas recontrôlé sur Légifrance.
// Copié mot pour mot, alinéa par alinéa ; seuls les retours à la ligne de la mise en page du recueil sont retirés.
//
// NE JAMAIS RETOUCHER ce texte à la main (ni typographie, ni accent, ni ponctuation). Si la loi change : remplacer
// les cinq alinéas d'un bloc, depuis le texte officiel, mettre à jour VERSION_ARTICLE_15_II et l'empreinte ci-dessous.
// L'empreinte est le garde-fou : si le texte ne lui correspond plus, le congé pour vendre n'est pas imprimé.
import { createHash } from "node:crypto";

export const VERSION_ARTICLE_15_II = "version en vigueur depuis le 29 juillet 2023";

export const ALINEAS_ARTICLE_15_II: readonly string[] = [
  "II. - Lorsqu'il est fondé sur la décision de vendre le logement, le congé doit, à peine de nullité, indiquer le prix et les conditions de la vente projetée. Le congé vaut offre de vente au profit du locataire : l'offre est valable pendant les deux premiers mois du délai de préavis. Les dispositions de l'article 46 de la loi n° 65-557 du 10 juillet 1965 fixant le statut de la copropriété des immeubles bâtis ne sont pas applicables au congé fondé sur la décision de vendre le logement.",
  "A l'expiration du délai de préavis, le locataire qui n'a pas accepté l'offre de vente est déchu de plein droit de tout titre d'occupation sur le local.",
  "Le locataire qui accepte l'offre dispose, à compter de la date d'envoi de sa réponse au bailleur, d'un délai de deux mois pour la réalisation de l'acte de vente. Si, dans sa réponse, il notifie son intention de recourir à un prêt, l'acceptation par le locataire de l'offre de vente est subordonnée à l'obtention du prêt et le délai de réalisation de la vente est porté à quatre mois. Le contrat de location est prorogé jusqu'à l'expiration du délai de réalisation de la vente. Si, à l'expiration de ce délai, la vente n'a pas été réalisée, l'acceptation de l'offre de vente est nulle de plein droit et le locataire est déchu de plein droit de tout titre d'occupation.",
  "Dans le cas où le propriétaire décide de vendre à des conditions ou à un prix plus avantageux pour l'acquéreur, le notaire doit, lorsque le bailleur n'y a pas préalablement procédé, notifier au locataire ces conditions et prix à peine de nullité de la vente. Cette notification est effectuée à l'adresse indiquée à cet effet par le locataire au bailleur ; si le locataire n'a pas fait connaître cette adresse au bailleur, la notification est effectuée à l'adresse des locaux dont la location avait été consentie. Elle vaut offre de vente au profit du locataire. Cette offre est valable pendant une durée d'un mois à compter de sa réception. L'offre qui n'a pas été acceptée dans le délai d'un mois est caduque.",
  "Le locataire qui accepte l'offre ainsi notifiée dispose, à compter de la date d'envoi de sa réponse au bailleur ou au notaire, d'un délai de deux mois pour la réalisation de l'acte de vente. Si, dans sa réponse, il notifie son intention de recourir à un prêt, l'acceptation par le locataire de l'offre de vente est subordonnée à l'obtention du prêt et le délai de réalisation de la vente est porté à quatre mois. Si, à l'expiration de ce délai, la vente n'a pas été réalisée, l'acceptation de l'offre de vente est nulle de plein droit."
];

/** Empreinte SHA-256 des cinq alinéas joints par un retour à la ligne, calculée sur le texte du recueil. */
const EMPREINTE_ATTENDUE = "c2cdca5fedd1cd5890e74bbe71412dd1730e7c7a4fcec73da1af53b5148aece0";

/**
 * Les cinq alinéas, seulement s'ils sont intacts (cinq alinéas, empreinte inchangée) ; sinon `null` : l'appelant
 * n'imprime pas le congé pour vendre et le dit. `alineas` ne se passe que dans les tests.
 */
export function alineasArticle15IIIntacts(alineas: readonly string[] = ALINEAS_ARTICLE_15_II): readonly string[] | null {
  if (alineas.length !== 5) return null;
  const empreinte = createHash("sha256").update(alineas.join("\n"), "utf8").digest("hex");
  return empreinte === EMPREINTE_ATTENDUE ? alineas : null;
}
