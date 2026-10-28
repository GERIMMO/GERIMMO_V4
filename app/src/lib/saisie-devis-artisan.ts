import { decalerJour } from "./agenda-gestion";
import { lireLignesDevis } from "./devis-structure";
import { aujourdhuiParis } from "./ged";
import { jourIsoValide } from "./dates";

/** L'aperçu et l'envoi valident les mêmes données et recalculent les prix. */
export function lireSaisieDevisArtisan(formData: FormData) {
  const calcul = lireLignesDevis(formData.get("lignes_devis"));
  const texte = (nom: string) => String(formData.get(nom) ?? "").trim();
  const diagnostic = texte("diagnostic");
  const delai = texte("delai");
  const duree = texte("duree");
  const contraintes = texte("contraintes");
  const observations = texte("observations");
  const validite = texte("valide_jusqu_au");
  // D18 (livraison 2) : « ce qui change » par rapport à la version précédente ; la base l'exige dès la version 2.
  const noteRevision = texte("note_revision");
  if (!diagnostic || !delai || !duree) {
    throw new Error("Complétez le diagnostic, le délai et la durée estimée.");
  }
  if (diagnostic.length > 4000 || delai.length > 240 || duree.length > 240 || contraintes.length > 3000 || observations.length > 3000) {
    throw new Error("Raccourcissez le diagnostic (4 000 caractères), le délai et la durée (240), ou les observations et contraintes (3 000).");
  }
  if (noteRevision.length > 4000) {
    throw new Error("Raccourcissez « ce qui change » (4 000 caractères au plus).");
  }
  if (validite && !jourIsoValide(validite)) {
    throw new Error("Indiquez une date de validité correcte.");
  }
  // « Aujourd'hui » est le jour de Paris (le serveur tourne en UTC) : une validité au jour même est dépassée, et la
  // validité par défaut (30 jours, comme la base) se compte depuis ce jour, pas depuis la veille entre minuit et 2 h.
  const aujourdhui = aujourdhuiParis();
  if (validite && validite <= aujourdhui) {
    throw new Error("La date de validité du devis est dépassée. Choisissez une date à partir de demain.");
  }
  return {
    calcul, diagnostic, delai, duree, contraintes, observations, noteRevision,
    prestations: calcul.lignes.map(l => l.libelle).join(" ; ").slice(0, 6000),
    valideJusquAu: validite || decalerJour(aujourdhui, 30),
  };
}
