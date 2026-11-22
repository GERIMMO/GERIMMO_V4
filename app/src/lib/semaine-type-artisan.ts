// AUDIT PALIER 1 DU 22/11/2026, P2-03 — la semaine type et les absences de l'artisan.
//
// La semaine type est une plage horaire par jour (1 = lundi … 7 = dimanche). Elle ne sert qu'à l'artisan : préremplir
// les trois créneaux qu'il propose pour une intervention. Elle ne réserve rien et personne d'autre ne la lit.
// Ce module ne contient que des calculs : il sert au formulaire (navigateur) comme aux actions (serveur).

export type PlageJour = { jour: number; debut: string; fin: string };
export type AbsenceArtisan = { id: string; du: string; au: string; en_cours: boolean };
export type CreneauPropose = { jour: string; debut: string; fin: string };

/** Les sept jours, dans l'ordre de la base : l'indice 0 est le jour 1. */
export const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Lit la semaine type du formulaire : pour chaque jour coché, ses deux heures. Rend la liste, ou la phrase du refus. */
export function lireSemaineType(formulaire: FormData): { jours: PlageJour[] } | { erreur: string } {
  const jours: PlageJour[] = [];
  for (let jour = 1; jour <= 7; jour++) {
    if (formulaire.get(`jour_${jour}`) !== "on") continue;
    const debut = String(formulaire.get(`debut_${jour}`) ?? "").trim();
    const fin = String(formulaire.get(`fin_${jour}`) ?? "").trim();
    const nom = JOURS_SEMAINE[jour - 1].toLowerCase();
    if (!HEURE.test(debut) || !HEURE.test(fin)) return { erreur: `Indiquez l’heure de début et l’heure de fin du ${nom}.` };
    if (fin <= debut) return { erreur: `Le ${nom}, l’heure de fin doit suivre l’heure de début.` };
    jours.push({ jour, debut, fin });
  }
  return { jours };
}

/** Le jour de la semaine d'une date « AAAA-MM-JJ », de 1 (lundi) à 7 (dimanche), sans dépendre du fuseau. */
export function jourDeLaSemaine(jourIso: string): number {
  const [a, m, j] = jourIso.split("-").map(Number);
  const rang = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return rang === 0 ? 7 : rang;
}

function lendemain(jourIso: string): string {
  const [a, m, j] = jourIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + 1)).toISOString().slice(0, 10);
}

/** « 08:00 » → « 10:00 », sans dépasser la fin de la plage : deux heures, la durée d'un dépannage courant. */
function finDuCreneau(debut: string, finDePlage: string): string {
  const [h, m] = debut.split(":").map(Number);
  const minutes = Math.min((h + 2) * 60 + m, 23 * 60 + 59);
  const deuxHeures = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return deuxHeures < finDePlage ? deuxHeures : finDePlage;
}

/**
 * Les prochains créneaux que la semaine type permet, un par jour travaillé, à partir d'un jour donné (compris).
 * Les jours d'absence sont sautés. Rend au plus `nombre` créneaux ; moins si la semaine type ou les absences ne
 * laissent rien dans les `horizon` jours qui suivent (rien n'est inventé pour atteindre le compte).
 */
export function prochainsCreneaux({ semaine, absences, aPartirDe, nombre = 3, horizon = 60 }: {
  semaine: PlageJour[];
  absences: Pick<AbsenceArtisan, "du" | "au">[];
  aPartirDe: string;
  nombre?: number;
  horizon?: number;
}): CreneauPropose[] {
  if (!JOUR_ISO.test(aPartirDe)) return [];
  const plages = new Map(semaine.filter((p) => HEURE.test(p.debut) && HEURE.test(p.fin) && p.fin > p.debut).map((p) => [p.jour, p]));
  const creneaux: CreneauPropose[] = [];
  let jour = aPartirDe;
  for (let i = 0; i < horizon && creneaux.length < nombre; i++, jour = lendemain(jour)) {
    const plage = plages.get(jourDeLaSemaine(jour));
    if (!plage) continue;
    // Les dates ISO se comparent comme du texte : bornes comprises, comme en base.
    if (absences.some((a) => a.du <= jour && jour <= a.au)) continue;
    creneaux.push({ jour, debut: plage.debut, fin: finDuCreneau(plage.debut, plage.fin) });
  }
  return creneaux;
}

/** « du 12/12/2026 au 03/01/2027 », ou « le 12/12/2026 » pour un seul jour. */
export function libelleAbsence(absence: Pick<AbsenceArtisan, "du" | "au">): string {
  const fr = (iso: string) => iso.split("-").reverse().join("/");
  return absence.du === absence.au ? `le ${fr(absence.du)}` : `du ${fr(absence.du)} au ${fr(absence.au)}`;
}
