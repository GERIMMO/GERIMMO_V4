// Les clés anti-doublon des e-mails de tâche (décision D47, fiche IA-04).
//
// Les tâches d'envoi (quittances, avis d'échéance, relances, rappels) envoient,
// PUIS marquent. Si le marquage échoue, ou si l'attente est coupée par le délai
// maximal de `lib/email.ts` alors que le service avait accepté le message,
// l'objet reste « à envoyer » et repart à la passe suivante. La clé
// d'idempotence, transmise au service d'e-mail, lui fait rendre la réponse du
// premier envoi au lieu d'en émettre un second — tant qu'il la retient.
//
// Une clé est STABLE (la même d'une passe à l'autre pour le même objet et le
// même destinataire) et DISTINCTE (deux destinataires, deux niveaux de relance
// ou deux rendez-vous ne se confondent jamais : un destinataire qui partagerait
// la clé d'un autre ne recevrait rien). Elle ne contient jamais d'adresse :
// l'adresse est remplacée par son empreinte. Même patron que les rapports
// mensuels (`lib/rapports-mensuels.ts`).

import { createHash } from "node:crypto";

/** La limite du service d'e-mail pour une clé d'idempotence. */
export const LONGUEUR_MAX_CLE = 256;

function empreinte(texte: string): string {
  return createHash("sha256").update(texte).digest("hex");
}

/** L'adresse, sans casse ni espaces autour : « Marc@… » et « marc@… » ne font qu'un. */
function empreinteAdresse(adresse: string): string {
  return empreinte(adresse.trim().toLowerCase());
}

/**
 * Une clé trop longue, ou qui sortirait de l'ASCII imprimable (un en-tête HTTP
 * ne l'accepterait pas), est remplacée par l'empreinte de son contenu : elle
 * reste stable et le service l'accepte. Les clés ordinaires ne sont pas touchées.
 */
function borner(cle: string): string {
  return cle.length <= LONGUEUR_MAX_CLE && !/[^\x21-\x7e]/.test(cle) ? cle : `replie/${empreinte(cle)}`;
}

/** Une date lue en base, ramenée à un format unique : le même instant donne la même clé. */
function instant(valeur: string): string {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? valeur : date.toISOString();
}

/** La quittance : un destinataire, un objet. Patron donné par la décision D47. */
export function cleQuittance(quittanceId: string): string {
  return borner(`quittance/${quittanceId}`);
}

/** L'avis d'échéance d'un appel, pour un destinataire (le titulaire et chaque colocataire ont la leur). */
export function cleAvisEcheance(appelId: string, destinataire: string): string {
  return borner(`avis-echeance/${appelId}/${empreinteAdresse(destinataire)}`);
}

/**
 * La relance de loyer, pour un destinataire. Le niveau et le terme relancé
 * (`dateEcheance`) l'identifient : la relance 2 du même bail, ou celle d'un
 * terme ultérieur, est un autre courrier. Le rôle sépare le locataire (et ses
 * colocataires) de la caution, qui reçoit une autre information.
 */
export function cleRelanceLoyer(p: {
  bailId: string;
  niveau: string;
  dateEcheance: string;
  destinataire: string;
  role: "locataire" | "caution";
}): string {
  return borner(`relance/${p.bailId}/${p.niveau}/${p.dateEcheance}/${p.role}/${empreinteAdresse(p.destinataire)}`);
}

/**
 * Le rappel d'un rendez-vous, pour le locataire ou l'artisan. Comme la trace en
 * base (une fois par intervention, échéance et destinataire), plus le début du
 * rendez-vous : un rendez-vous déplacé est un autre message.
 */
export function cleRappelRendezVous(p: {
  interventionId: string;
  echeance: string;
  destinataire: string;
  debutPrevu: string;
}): string {
  return borner(`rappel/${p.interventionId}/${p.echeance}/${p.destinataire}/${instant(p.debutPrevu)}`);
}

/** Le rappel d'un geste qui n'est pas venu : reprend la clé « type:objet » de sa trace. */
export function cleRappelGeste(cleTrace: string): string {
  return borner(`rappel-geste/${cleTrace}`);
}
