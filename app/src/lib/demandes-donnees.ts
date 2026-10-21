/** Une demande de droits réutilise le support privé, sans déclencher un effacement. */
export const PREFIXE_DEMANDE_DONNEES = "Données personnelles — ";
export const TYPES_DEMANDE_DONNEES = {
  acces: "Recevoir une copie de mes données",
  rectification: "Corriger mes données",
  effacement: "Demander l’effacement de mes données",
  fermeture: "Fermer mon compte",
} as const;
export type TypeDemandeDonnees = keyof typeof TYPES_DEMANDE_DONNEES;
export function typeDemandeDonnees(valeur: unknown): TypeDemandeDonnees | null {
  return typeof valeur === "string" && Object.hasOwn(TYPES_DEMANDE_DONNEES, valeur) ? valeur as TypeDemandeDonnees : null;
}
/** Un mois civil à partir du jour de réception à Paris, ramené au dernier jour
 * du mois suivant lorsqu'il n'existe pas de jour équivalent. Pas « 30 jours ». */
export function echeanceDemandeDonnees(recueLe: string): string | null {
  const date = new Date(recueLe);
  if (!Number.isFinite(date.getTime())) return null;
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const [annee, mois, numero] = jour.split("-").map(Number);
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(annee, mois, Math.min(numero, dernier))).toISOString().slice(0, 10);
}
export function estDemandeDonnees(r: { nature: string; organization_id: string | null; titre: string }): boolean {
  return r.nature === "question" && r.organization_id === null && r.titre.startsWith(PREFIXE_DEMANDE_DONNEES);
}
