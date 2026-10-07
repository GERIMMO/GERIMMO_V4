// L'HEURE DE PARIS, CALCULÉE (06/10/2026).
//
// Le réglage marketing dit « 9 h, heure de Paris ». Jusqu'ici, rien ne le
// convertissait : le cron Vercel tournait à 8 h UTC, soit 10 h en été et 9 h
// en hiver. La base calcule l'instant exact (`instant_paris`) ; ce module en
// est le miroir côté serveur, testé autour du 25 octobre 2026.

const FUSEAU = "Europe/Paris";

type Composantes = { annee: number; mois: number; jour: number; heure: number; minute: number; seconde: number; isodow: number };

const JOURS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Les composantes d'un instant, lues à l'heure de Paris. */
export function composantesParis(instant: Date): Composantes {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSEAU, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const p = Object.fromEntries(parties.map((x) => [x.type, x.value]));
  return {
    annee: Number(p.year), mois: Number(p.month), jour: Number(p.day),
    heure: Number(p.hour) % 24, minute: Number(p.minute), seconde: Number(p.second),
    isodow: JOURS[p.weekday] ?? 0,
  };
}

/** « 2026-10-26 » */
export function dateParis(instant: Date): string {
  const c = composantesParis(instant);
  return `${c.annee}-${String(c.mois).padStart(2, "0")}-${String(c.jour).padStart(2, "0")}`;
}

/** Le décalage de Paris (minutes à l'est de l'UTC) à un instant donné : 120 en été, 60 en hiver. */
function decalageParis(instant: Date): number {
  const c = composantesParis(instant);
  const commeUtc = Date.UTC(c.annee, c.mois - 1, c.jour, c.heure, c.minute, c.seconde);
  return Math.round((commeUtc - instant.getTime()) / 60_000);
}

/**
 * L'instant universel de « jour à heure:minute, heure de Paris ».
 * 2026-10-26 09:00 Paris → 08:00 UTC ; 2026-10-23 09:00 Paris → 07:00 UTC.
 */
export function instantParis(jour: string, heure: number, minute = 0): Date {
  const [a, m, j] = jour.split("-").map(Number);
  const estimation = new Date(Date.UTC(a, m - 1, j, heure, minute));
  let resultat = new Date(estimation.getTime() - decalageParis(estimation) * 60_000);
  // Un passage d'heure entre l'estimation et le résultat : on recalcule une fois.
  const second = new Date(estimation.getTime() - decalageParis(resultat) * 60_000);
  if (second.getTime() !== resultat.getTime()) resultat = second;
  return resultat;
}

/** Le lendemain d'une date « AAAA-MM-JJ ». */
export function lendemain(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + 1)).toISOString().slice(0, 10);
}

/** Le jour ISO (1 = lundi … 7 = dimanche) d'une date « AAAA-MM-JJ ». */
export function isodow(jour: string): number {
  const [a, m, j] = jour.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return d === 0 ? 7 : d;
}
