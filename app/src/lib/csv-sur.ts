/**
 * Un tableur évalue comme une FORMULE toute cellule de texte qui commence par =, +, - ou @ (ou par une tabulation ou un retour
 * chariot) : un libellé « =HYPERLINK(...) » saisi par un utilisateur partirait en commande à l'ouverture du fichier de son
 * comptable. Audit du 13/10 (CHF-04) : l'export du journal de gestion recopiait les libellés tels quels.
 *
 * À n'appliquer qu'aux colonnes de TEXTE saisi (libellé, nom de bien ou de lot, mandant) : jamais aux montants, dont un « -780,00 »
 * est légitime. Le texte reste lisible : une apostrophe en tête est la convention des tableurs pour « ceci est du texte ».
 */
export function neutraliserFormule(valeur: string): string {
  return /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
}
