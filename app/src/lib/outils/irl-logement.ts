// OUTIL GRATUIT « CALCUL IRL » — CE QUE LE LOGEMENT CHANGE (30/09).
//
// 1. L'adresse (Base Adresse Nationale, déjà autorisée par la CSP : l'écran
//    « Ajouter un bien » l'interroge de la même façon) remplit la lettre, et
//    son code postal désigne la série de l'IRL : la série nationale
//    (001515333) vaut pour la France métropolitaine. La Corse et l'outre-mer
//    ont leurs propres séries Insee, dont les identifiants ne sont pas
//    vérifiés ici : l'indice s'y saisit à la main, et l'indice métropolitain
//    n'y est JAMAIS appliqué.
// 2. Le DPE : un logement classé F ou G ne peut plus voir son loyer révisé
//    (gel des loyers des « passoires thermiques », loi Climat et résilience,
//    depuis le 24/08/2022 ; RM-3.8.6 du wiki). L'outil le dit et ne produit
//    pas de lettre.

export const URL_API_ADRESSE = "https://api-adresse.data.gouv.fr/search/";

export type SuggestionAdresse = {
  /** « 12 Rue des Lilas 69003 Lyon » */
  label: string;
  /** « 12 Rue des Lilas » */
  name: string;
  postcode: string;
  city: string;
};

/** L'adresse de recherche (5 suggestions, mode autocomplétion). */
export function urlRechercheAdresse(saisie: string): string {
  return `${URL_API_ADRESSE}?q=${encodeURIComponent(saisie.trim())}&limit=5&autocomplete=1`;
}

/** Les suggestions d'une réponse de la BAN ; liste vide si la réponse est inattendue. */
export function lireSuggestionsAdresse(json: unknown): SuggestionAdresse[] {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const r: SuggestionAdresse[] = [];
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> })?.properties;
    if (!p || typeof p.label !== "string") continue;
    r.push({
      label: p.label,
      name: typeof p.name === "string" ? p.name : p.label,
      postcode: typeof p.postcode === "string" ? p.postcode : "",
      city: typeof p.city === "string" ? p.city : "",
    });
  }
  return r;
}

/** La série de l'IRL applicable au logement. */
export type ZoneIrl = "metropole" | "corse" | "outre-mer";

/**
 * Le code postal désigne la série : 20xxx (Corse) et 97xxx / 98xxx
 * (outre-mer) ont leur propre indice ; tout autre code postal français à
 * cinq chiffres relève de la série métropolitaine. `null` si illisible.
 */
export function zoneIrlDuCodePostal(codePostal: string | null | undefined): ZoneIrl | null {
  const cp = (codePostal ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith("20")) return "corse";
  if (cp.startsWith("97") || cp.startsWith("98")) return "outre-mer";
  return "metropole";
}

/** Le code postal lu dans une adresse saisie librement (« … 69003 Lyon »). */
export function codePostalDeAdresse(adresse: string): string | null {
  const m = /\b(\d{5})\b/.exec(adresse ?? "");
  return m ? m[1] : null;
}

export const MESSAGE_ZONE_SPECIFIQUE: Record<Exclude<ZoneIrl, "metropole">, string> = {
  corse:
    "Logement en Corse : l'IRL applicable est un indice spécifique à la Corse, publié par l'Insee. Il est à saisir vous-même : l'indice de la France métropolitaine ne s'applique pas.",
  "outre-mer":
    "Logement outre-mer : l'IRL applicable est un indice spécifique à l'outre-mer, publié par l'Insee. Il est à saisir vous-même : l'indice de la France métropolitaine ne s'applique pas.",
};

export type ClasseDpe = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "inconnue";

export const CLASSES_DPE: { valeur: ClasseDpe; libelle: string }[] = [
  ..."ABCDEFG".split("").map((c) => ({ valeur: c as ClasseDpe, libelle: c })),
  { valeur: "inconnue", libelle: "Je ne sais pas" },
];

/** F ou G : le loyer ne peut pas être révisé (gel des passoires thermiques). */
export function revisionInterditeDpe(classe: ClasseDpe): boolean {
  return classe === "F" || classe === "G";
}

export const MESSAGE_GEL_DPE =
  "Révision interdite : le logement est classé F ou G au diagnostic de performance énergétique. Depuis le 24 août 2022, le loyer des logements F et G ne peut plus être révisé, ni augmenté (gel des loyers des passoires thermiques, loi Climat et résilience). Aucune lettre de révision n'est à envoyer.";
