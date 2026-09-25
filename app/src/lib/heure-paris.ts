// Les heures de la console, toujours à l'heure de Paris (25/09).
//
// Vercel tourne en UTC : « Diffusée le 25/09/2026 09:00 » s'affichait pour un
// post parti à 11 h, pendant que d'autres écrans forçaient déjà Europe/Paris.
// Chaque page qui affiche une heure passe par ici et dit le fuseau UNE fois,
// en pied de page (`NOTE_FUSEAU`), plutôt qu'après chaque horodatage.

export const FUSEAU_PARIS = "Europe/Paris";

/** La mention à poser une seule fois par page. */
export const NOTE_FUSEAU = "Heures affichées à l'heure de Paris.";

type Horodatage = string | number | Date | null | undefined;

function date(valeur: Horodatage): Date | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** « 25/09/2026 11:00 » ou « — ». */
export function formaterDateHeureParis(valeur: Horodatage): string {
  const d = date(valeur);
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU_PARIS,
  });
}

/** « 25/09/2026 » ou « — ». */
export function formaterDateParis(valeur: Horodatage): string {
  const d = date(valeur);
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FUSEAU_PARIS,
  });
}

/** « 11:00 » ou « — ». */
export function formaterHeureParis(valeur: Horodatage): string {
  const d = date(valeur);
  if (!d) return "—";
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU_PARIS,
  });
}

/** « 25 sept. 2026, 11:00 » — la forme longue des calendriers, ou un repli. */
export function formaterDateHeureLongueParis(valeur: Horodatage, repli = "—"): string {
  const d = date(valeur);
  if (!d) return repli;
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: FUSEAU_PARIS });
}

/**
 * L'instant UTC (ISO) où commence — ou finit, avec `fin` — la journée de Paris
 * `aaaa-mm-jj`. Sert à borner une lecture de journal saisie en dates : le
 * décalage (+01:00 ou +02:00) est celui de ce jour-là. `null` si la date est
 * mal formée.
 */
export function borneJourParis(jour: string, fin = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const midi = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(midi.getTime())) return null;
  const decalage = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_PARIS, timeZoneName: "longOffset" })
    .formatToParts(midi)
    .find((p) => p.type === "timeZoneName")?.value.replace("UTC", "") || "+00:00";
  const d = new Date(`${jour}T${fin ? "23:59:59.999" : "00:00:00.000"}${decalage}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
