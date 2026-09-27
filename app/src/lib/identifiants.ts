import { notFound } from "next/navigation";

// Un identifiant d'URL qui n'a pas la forme d'un UUID ne désigne rien : c'est
// une page introuvable, pas une panne (audit agence 27/09 — `/personnes/nimporte`
// affichait « la lecture a échoué… rechargez la page », la base refusant la
// valeur avant même de chercher).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estUuid(valeur: unknown): valeur is string {
  return typeof valeur === "string" && UUID.test(valeur);
}

/** Page introuvable si l'un des identifiants d'URL n'est pas un UUID. */
export function exigerUuids(...valeurs: unknown[]): void {
  if (!valeurs.every(estUuid)) notFound();
}
