// Les clés anti-doublon des e-mails de tâche (décision D47, fiche IA-04).
//
// Les tâches d'envoi (quittances, avis d'échéance, relances, rappels) envoient,
// PUIS marquent. Si le marquage échoue, ou si l'attente est coupée par le délai
// maximal de `lib/email.ts` alors que le service avait accepté le message,
// l'objet reste « à envoyer » et repart à la passe suivante. La clé
// d'idempotence, transmise au service d'e-mail, lui fait rendre la réponse du
// premier envoi au lieu d'en émettre un second — tant qu'il la retient.
//
// Une clé est STABLE (la même d'une passe à l'autre pour le même objet, le
// même destinataire et le même courrier) et DISTINCTE (deux destinataires, deux
// niveaux de relance ou deux rendez-vous ne se confondent jamais : un
// destinataire qui partagerait la clé d'un autre ne recevrait rien). Elle ne
// contient jamais d'adresse : l'adresse est remplacée par son empreinte. Même
// patron que les rapports mensuels (`lib/rapports-mensuels.ts`).
//
// LA CLÉ SUIT LE CONTENU (relecture du 14/10). Le service refuse (409) une clé
// réutilisée avec un autre contenu. Si la clé ne portait que l'identifiant de
// l'objet, tout courrier dont l'état change d'une passe à l'autre serait refusé
// jusqu'à l'oubli de la clé, avec un motif trompeur : la base révise la MÊME
// quittance quand l'encaissé change (un reçu partiel devient quittance), un
// règlement modifie le montant d'un avis ou d'une relance. Chaque clé porte donc
// ce que le courrier montre de l'état de l'objet : tant que le courrier est le
// même, la clé ne bouge pas (pas de doublon) ; quand il change, la clé change
// (c'est un autre courrier, il part). Ce que le courrier montre ne doit lui-même
// dériver ni avec les jours ni avec l'heure : voir `messageRappelGeste`.
//
// LIMITE CONNUE. Le service ne retient la clé que 24 h (hypothèse tirée d'un
// commentaire de `lib/rapports-mensuels.ts`, non vérifiée auprès du prestataire),
// et les tâches tournent une fois par jour : la reprise du lendemain arrive au
// bord de cette fenêtre. La clé borne le doublon des reprises rapprochées ; elle
// ne le supprime pas.

import { createHash } from "node:crypto";
import type { Palier } from "./relance-paiement-email";

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

/**
 * Un montant en centimes, écrit en entier : « 700 », « 700.00 » et 700 donnent
 * « 70000 ». Aucune lecture par `Number()` ni `parseFloat` : un nombre déjà lu
 * passe par `toFixed(2)`, un texte se lit au caractère (deux décimales au
 * plus). Une valeur absente se dit « aucun » ; une valeur illisible garde
 * l'empreinte de son texte, pour que la clé reste stable sans jamais lever.
 */
export function centimes(montant: number | string | null | undefined): string {
  if (montant === null || montant === undefined) return "aucun";
  const texte = typeof montant === "number" && Number.isFinite(montant) ? montant.toFixed(2) : String(montant).trim();
  const lu = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texte);
  if (!lu) return `brut-${empreinte(texte).slice(0, 12)}`;
  return `${lu[1]}${(lu[2] ?? "").padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
}

/**
 * La quittance : un destinataire, un objet, et ce que le document est. La base
 * révise la MÊME ligne quand l'encaissé change (`resynchroniser_quittances` :
 * reçu partiel devenu quittance, montant modifié, retour à « à envoyer ») ; le
 * courrier change alors de sujet et de montant, et la clé avec lui — sans quoi
 * la quittance libératoire serait refusée par le service jusqu'à l'oubli de la
 * clé. Patron donné par la décision D47 : `quittance/<id>`, complété de `q`
 * (quittance) ou `r` (reçu), du montant en centimes et de l'empreinte de l'adresse.
 */
export function cleQuittance(p: {
  quittanceId: string;
  estQuittance: boolean;
  montant: number | string;
  destinataire: string;
}): string {
  return borner(
    `quittance/${p.quittanceId}/${p.estQuittance ? "q" : "r"}/${centimes(p.montant)}/${empreinteAdresse(p.destinataire)}`
  );
}

/**
 * L'avis d'échéance d'un appel, pour un destinataire (le titulaire et chaque
 * colocataire ont le leur). Le courrier annonce le montant de l'échéance et
 * l'arriéré : un règlement entre deux passes les change, et la clé avec eux.
 */
export function cleAvisEcheance(p: {
  appelId: string;
  destinataire: string;
  resteDu: number | string;
  arriere: number | string;
}): string {
  return borner(`avis-echeance/${p.appelId}/${centimes(p.resteDu)}/${centimes(p.arriere)}/${empreinteAdresse(p.destinataire)}`);
}

/**
 * La relance de loyer, pour un destinataire. Le niveau et le terme relancé
 * (`dateEcheance`) l'identifient : la relance 2 du même bail, ou celle d'un
 * terme ultérieur, est un autre courrier. Le rôle sépare le locataire (et ses
 * colocataires) de la caution, qui reçoit une autre information.
 *
 * Le courrier dit le reste dû du terme et la dette totale du bail ; l'information
 * de la caution ne dit que la dette totale (à défaut, le reste dû du terme). Un
 * règlement partiel entre deux passes change ces montants, et la clé avec eux.
 */
export function cleRelanceLoyer(p: {
  bailId: string;
  niveau: string;
  dateEcheance: string;
  destinataire: string;
  role: "locataire" | "caution";
  reste: number | string;
  totalDu?: number | string | null;
}): string {
  const montants = p.role === "caution" ? centimes(p.totalDu ?? p.reste) : `${centimes(p.reste)}/${centimes(p.totalDu)}`;
  return borner(
    `relance/${p.bailId}/${p.niveau}/${p.dateEcheance}/${p.role}/${montants}/${empreinteAdresse(p.destinataire)}`
  );
}

/**
 * La relance de paiement d'un abonnement (prélèvement échoué), pour un
 * destinataire : par organisation et par palier, avec la date de passage en
 * lecture seule que tous les paliers annoncent. Deux paliers ne partagent
 * jamais la clé. Ce que le courrier montre en plus dépend du palier : le montant
 * mensuel au palier 0, le nombre de jours restants au palier 1 (« il vous reste
 * N jours » change chaque matin), rien au-delà. Un test garde cette
 * correspondance avec `relance-paiement-email.ts`.
 */
export function cleRelanceAbonnement(p: {
  organisationId: string;
  palier: Palier;
  lectureSeuleLe: string;
  joursRestants: number;
  montantMensuel: number | string;
  destinataire: string;
}): string {
  const variable = p.palier === 0 ? centimes(p.montantMensuel) : p.palier === 1 ? `${p.joursRestants}j` : "-";
  return borner(
    `relance-abonnement/${p.organisationId}/${p.palier}/${p.lectureSeuleLe.slice(0, 10)}/${variable}/${empreinteAdresse(p.destinataire)}`
  );
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

/**
 * Le rappel d'un geste qui n'est pas venu : reprend la clé « type:objet » de sa
 * trace. Son texte ne compte pas les jours écoulés (voir `messageRappelGeste`) :
 * il est identique d'un matin à l'autre, sans quoi le service refuserait la reprise.
 */
export function cleRappelGeste(cleTrace: string): string {
  return borner(`rappel-geste/${cleTrace}`);
}
