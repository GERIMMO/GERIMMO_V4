// L'ARITHMÉTIQUE DES DATES CIVILES, EN UN SEUL ENDROIT (audit final du 27/10, COD-04).
//
// « Aujourd'hui à Paris », « tel jour plus n jours », « plus n mois, ramené au dernier jour du mois » et « cette saisie
// est-elle une vraie date » étaient recopiés dans des dizaines de fichiers, chacun avec ses noms. Une correction (29 février,
// fin de mois, changement d'heure) faite dans une copie ne se propageait pas aux autres. Les fonctions vivent ici ; les
// copies migrent une à une.
//
// Toutes travaillent sur des dates civiles « AAAA-MM-JJ », calculées en UTC : ni le fuseau du serveur, ni l'heure d'été
// n'entrent dans un ajout de jours ou de mois. Seule `aujourdhuiParis` lit une horloge, à l'heure de Paris.

const JOUR_PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Le jour de Paris (AAAA-MM-JJ) d'un instant — maintenant par défaut. Vercel tourne en UTC : sans ce calcul, la veille
 * avant 1 h (hiver) ou 2 h (été) du matin. */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  return JOUR_PARIS.format(maintenant);
}

/** Une date civile « AAAA-MM-JJ » qui existe au calendrier : « 2026-02-30 », « 2026-13-01 » ou « 28/02/2027 » ne passent pas. */
export function jourIsoValide(jour: unknown): jour is string {
  return typeof jour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(jour) && Number.isFinite(Date.parse(jour))
    && new Date(jour).toISOString().slice(0, 10) === jour;
}

/** Le jour, n jours plus tard (n négatif : plus tôt), en jours de calendrier. */
export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/** Le même jour, n mois plus tard, ramené au dernier jour du mois quand il n'existe pas : 31 janvier + 1 mois = 28 février
 * (29 en année bissextile), jamais 3 mars. */
export function ajouterMois(jour: string, n: number): string {
  const [a, m, j] = jour.slice(0, 10).split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m + n, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + n, Math.min(j, dernier))).toISOString().slice(0, 10);
}
