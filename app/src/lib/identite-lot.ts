import { TYPES_BIEN } from "./parc";

/** Préserve le repère du lot dans un immeuble, sans répéter son adresse. */
export function identiteLot(fiche: {
  lot_nom: string;
  bien_nom: string;
  bien_type: string;
  adresse: string;
  ville: string;
}) {
  const normaliser = (texte: string) => texte.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
  const nom = fiche.lot_nom.trim();
  const titre = !nom || normaliser(nom) === "lot unique"
    ? `${TYPES_BIEN[fiche.bien_type] ?? "Bien"} — ${fiche.adresse}`
    : nom;
  const repere = [fiche.bien_nom, fiche.adresse, fiche.ville]
    .filter((texte, index, liste) => texte.trim() && !normaliser(titre).includes(normaliser(texte))
      && liste.findIndex((autre) => normaliser(autre) === normaliser(texte)) === index)
    .join(" · ");
  return { titre, repere };
}
