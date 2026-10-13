// Les contrôles de plausibilité des fiches (bien, lot, personne), côté serveur.
//
// Audit du 13/10/2026 (PROP-02, PROP-04, PROP-07) : un code postal « 7501 »,
// une année de construction 1500, une date de naissance en 2030, un téléphone
// « abc » ou une surface qui fait déborder la colonne étaient acceptés puis
// imprimés dans le bail. Chaque contrôle rend `null` si tout va bien, sinon la
// phrase à afficher. Le champ HTML aide ; ce fichier est ce qui fait foi.

/** Un bien est en France : cinq chiffres, comme la base communale (INSEE). */
export function verifierCodePostalBien(codePostal: string): string | null {
  return /^\d{5}$/.test(codePostal.trim())
    ? null
    : "Le code postal du bien comporte cinq chiffres (par exemple 75011).";
}

/**
 * Une personne peut résider hors de France (4 chiffres belges, lettres
 * britanniques) : on écarte seulement ce qui ne peut pas être un code postal.
 */
export function verifierCodePostalPersonne(codePostal: string): string | null {
  const cp = codePostal.trim();
  if (/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(cp) && /\d/.test(cp)) return null;
  return "Le code postal n'est pas valide (par exemple 75011).";
}

/** Facultatif : vide passe ; sinon des chiffres, avec +, espaces, points, tirets, parenthèses. */
export function verifierTelephone(telephone: string): string | null {
  const t = telephone.trim();
  if (!t) return null;
  const chiffres = t.replace(/\D/g, "");
  if (/^\+?[\d\s.()-]+$/.test(t) && chiffres.length >= 6 && chiffres.length <= 15) return null;
  return "Le numéro de téléphone n'est pas valide (par exemple 06 12 34 56 78).";
}

/**
 * Une date de naissance existe, n'est pas dans le futur et n'est pas
 * antérieure à 1900. La majorité n'est pas exigée : un mineur peut détenir une
 * quote-part par succession.
 */
export function verifierDateNaissance(date: string, aujourdhui: string): string | null {
  const d = date.trim();
  if (!d) return null;
  const valide = /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  if (!valide) return "La date de naissance n'est pas valide.";
  if (d > aujourdhui) return "La date de naissance ne peut pas être dans le futur.";
  if (d < "1900-01-01") return "La date de naissance est antérieure à 1900 : vérifiez la saisie.";
  return null;
}

/**
 * L'année de construction pilote les diagnostics et les mentions du bail : un
 * entier plausible (1600 jusqu'à cinq ans après l'année en cours, pour un
 * immeuble en cours de construction).
 */
export function verifierAnneeConstruction(annee: number, anneeCourante: number): string | null {
  const max = anneeCourante + 5;
  if (annee >= 1600 && annee <= max) return null;
  return `L'année de construction doit être comprise entre 1600 et ${max}.`;
}

/** La colonne accepte 99 999,99 m² ; un logement de plus de 9 999,99 m² est une faute de frappe. */
export const SURFACE_MAX_M2 = 9999.99;

export function verifierSurface(valeur: number, nom = "La surface"): string | null {
  if (!Number.isFinite(valeur) || valeur <= 0) return null; // l'obligation se dit ailleurs
  return valeur > SURFACE_MAX_M2 ? `${nom} dépasse ${SURFACE_MAX_M2.toLocaleString("fr-FR")} m² : vérifiez la saisie.` : null;
}
