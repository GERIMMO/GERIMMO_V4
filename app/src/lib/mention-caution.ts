/** Un même texte sert à l'acte, à l'aide de saisie et au contrôle après signature.
 * La caution l'appose elle-même : jamais de valeur préremplie chez le prestataire.
 * Art. 2297 : engagement, défaillance, plafond en lettres et chiffres, renonciations.
 */
export function texteMentionCaution(p: { caution: string; locataires: string; plafond: string; solidaire: boolean }) {
  return `Je, soussigné(e) ${p.caution}, m'engage en qualité de caution${p.solidaire ? " solidaire" : ""} de ${p.locataires} envers le bailleur, à lui payer, en cas de défaillance du locataire, les sommes dues au titre du bail désigné dans le présent acte — loyers, charges, réparations locatives, intérêts et pénalités de retard —, pour la durée du bail et de ses renouvellements, dans la limite de la somme de ${p.plafond}, couvrant le principal et les accessoires.${p.solidaire ? " Je reconnais ne pouvoir exiger du bailleur qu'il poursuive d'abord le locataire, ni qu'il divise ses poursuites entre les cautions." : ""}`;
}

export const ERREUR_MENTION_CAUTION = "La mention de la caution est absente ou incomplète. Ce cautionnement ne peut pas être validé : préparez un nouvel acte et faites recopier la mention complète par le garant. Une réponse « OK » ne suffit pas.";

/** Tolère la typographie mobile et les retours à la ligne, jamais les omissions,
 * un autre montant, une autre identité ou la suppression d'une renonciation.
 * Le contrôle intégral est exécuté au retour côté serveur.
 */
export function expressionMentionCaution(mention: string) {
  if (mention.length < 200 || mention.length > 1800) throw new Error("La mention de caution doit être préparée à nouveau.");
  const corps = Array.from(mention.trim()).map(c => {
    if (/\s/u.test(c)) return "\\s+";
    if (/[’']/u.test(c)) return "['’]";
    if (/[—–]/u.test(c)) return "[—–-]";
    return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("").replace(/(?:\\s\+){2,}/g, "\\s+");
  return `^\\s*${corps}\\s*$`;
}

/** Zoho borne la taille des règles : première barrière de saisie compacte.
 * Elle ne prouve PAS la conformité : le serveur compare ensuite toute la mention.
 */
export function expressionSaisieMentionCaution(mention: string) {
  expressionMentionCaution(mention); // Refuse une préparation absente ou hors limites.
  return `^(?=[\\s\\S]{${Math.max(200, mention.length - 100)},2048}$)[\\s\\S]*caution[\\s\\S]*défaillance[\\s\\S]*principal[\\s\\S]*accessoires[\\s\\S]*$`;
}

export function mentionCautionConforme(attendue: string | undefined, recue: unknown): boolean {
  if (!attendue || typeof recue !== "string" || recue.length > 2048) return false;
  try { return new RegExp(expressionMentionCaution(attendue), "u").test(recue); }
  catch { return false; }
}
