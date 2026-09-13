export const VUES_AGENDA = ["semaine", "a-planifier", "a-verifier"] as const;
export type VueAgenda = typeof VUES_AGENDA[number];
export const TAILLE_PAGE_AGENDA = 30;

export function jourParis(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}
export function decalerJour(jour: string, decalage: number) {
  const date = new Date(`${jour}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + decalage);
  return date.toISOString().slice(0, 10);
}
/** Un lundi civil, indépendant du fuseau du serveur et de l'heure d'été. */
export function semaineAgenda(saisie: unknown, maintenant = new Date()) {
  const valide = typeof saisie === "string" && /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(saisie)
    && Number.isFinite(Date.parse(`${saisie}T12:00:00Z`))
    && new Date(`${saisie}T12:00:00Z`).toISOString().slice(0, 10) === saisie;
  const jour = valide ? saisie as string : jourParis(maintenant);
  const lundi = decalerJour(jour, -((new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7));
  return { lundi, suivant: decalerJour(lundi, 7), precedent: decalerJour(lundi, -7), dimanche: decalerJour(lundi, 6) };
}
/** L'offset est calculé pour chaque borne, y compris les semaines de changement d'heure. */
export function minuitParis(jour: string) {
  const instant = new Date(`${jour}T00:00:00Z`);
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(instant));
  return new Date(instant.getTime() - heure * 3_600_000).toISOString();
}
export function vueAgenda(saisie: unknown): VueAgenda {
  return VUES_AGENDA.includes(saisie as VueAgenda) ? saisie as VueAgenda : "semaine";
}
export function pageAgenda(saisie: unknown) {
  return typeof saisie === "string" && /^\d{1,4}$/.test(saisie) ? Math.max(1, Number(saisie)) : 1;
}
