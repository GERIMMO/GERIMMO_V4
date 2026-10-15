import { lireLignesDevis } from "./devis-structure";

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
  if (validite && (!/^\d{4}-\d{2}-\d{2}$/.test(validite) || !Number.isFinite(Date.parse(validite)) || new Date(validite).toISOString().slice(0, 10) !== validite)) {
    throw new Error("Indiquez une date de validité correcte.");
  }
  if (validite && validite <= new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })) {
    throw new Error("La date de validité du devis est dépassée. Choisissez une date à partir de demain.");
  }
  const dans30Jours = new Date();
  dans30Jours.setDate(dans30Jours.getDate() + 30);
  return {
    calcul, diagnostic, delai, duree, contraintes, observations, noteRevision,
    prestations: calcul.lignes.map(l => l.libelle).join(" ; ").slice(0, 6000),
    valideJusquAu: validite || dans30Jours.toISOString().slice(0, 10),
  };
}
