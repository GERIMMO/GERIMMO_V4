// Le jour du mois d'une échéance tel qu'il s'écrit : « le 1er », puis « le 2 », « le 15 »… (phase 3 : S10).
// Module sans dépendance (phase 3, lot 43, T06) : les écrans (composants clients compris) l'importent comme les modèles de
// documents, qui le reçoivent par le gabarit ; il vivait dans le gabarit, qui dépend de node:crypto.
export function jourDuMois(jour: number | string | null | undefined): string | null {
  const texte = jour === null || jour === undefined ? "" : String(jour).trim();
  if (texte === "") return null;
  return Number(texte) === 1 ? "1er" : texte;
}
