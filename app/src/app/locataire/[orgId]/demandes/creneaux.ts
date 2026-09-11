// Le vocabulaire des créneaux du locataire — partagé par le formulaire et par
// l'action serveur, pour qu'ils ne puissent pas diverger.
//
// POURQUOI DES DEMI-JOURNÉES, ET NON SIX SÉLECTEURS date-heure.
// RM-10.2.2 oblige le locataire à proposer TROIS créneaux dès qu'aucun de ceux
// de l'artisan ne lui convient : « un refus sec bloquerait sans faire
// avancer ». Trois créneaux saisis en début ET fin, c'est six sélecteurs
// date-heure ; sur le gabarit de référence de cet espace — le téléphone,
// 390 px — c'est le geste qu'on abandonne. Or un locataire qui abandonne ici
// ne refuse pas : il ne répond plus, et le dossier s'arrête.
// Une date + « matin » ou « après-midi », c'est aussi la façon dont on donne
// ses disponibilités dans la vraie vie. La base reçoit bien deux instants
// (intervention_creneaux.debut/fin, contrainte fin > debut) : ce sont ces
// bornes-là.
//
// Arbitrage à confirmer (rapport du 11/09) : le wiki dit « trois créneaux » et
// le code V3 un format « AAAA-MM-JJ HH:MM-HH:MM » ; il ne dit nulle part si le
// locataire doit pouvoir donner une heure précise. Si oui, ce module est le
// seul endroit à changer.
export const DEMI_JOURNEES = [
  { valeur: "matin", libelle: "Matin", plage: "8 h – 12 h", debut: "08:00", fin: "12:00" },
  {
    valeur: "apres_midi",
    libelle: "Après-midi",
    plage: "14 h – 18 h",
    debut: "14:00",
    fin: "18:00",
  },
] as const;

export type DemiJournee = (typeof DEMI_JOURNEES)[number]["valeur"];

export function demiJournee(valeur: string) {
  return DEMI_JOURNEES.find((d) => d.valeur === valeur);
}

/** Nombre de créneaux que le locataire doit proposer (RM-10.2.2). */
export const CRENEAUX_MINIMUM = 3;

/**
 * Une date locale (« 2026-09-20 ») et une heure murale (« 08:00 ») à l'heure
 * de Paris → l'instant ISO correspondant.
 *
 * Jumelle de `instantParis` dans `actions/incidents.ts` (le rendez-vous saisi
 * par le gérant) : les deux sont privées à leur fichier « use server », qui
 * n'a le droit d'exporter que des fonctions asynchrones. Le bon remède est un
 * `lib/dates.ts` commun — hors de ce lot, signalé au rapport.
 *
 * Deux passes : la première suppose le décalage de l'instant « comme UTC », la
 * seconde le corrige si l'on a traversé une bascule d'heure d'été.
 */
export function instantParis(date: string, heure: string): string | null {
  const jour = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const hm = /^(\d{2}):(\d{2})$/.exec(heure);
  if (!jour || !hm) return null;
  const commeUTC = Date.UTC(+jour[1], +jour[2] - 1, +jour[3], +hm[1], +hm[2]);
  if (!Number.isFinite(commeUTC)) return null;
  const decalage = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - instant;
  };
  const approche = commeUTC - decalage(commeUTC);
  const instant = commeUTC - decalage(approche);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}
