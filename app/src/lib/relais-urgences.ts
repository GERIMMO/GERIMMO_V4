// L'E-MAIL IMMÉDIAT DES URGENCES DU RELAIS (D46-B, décision du dirigeant du 15/10/2026, « envoi immédiat pour les
// urgences ») — la partie sans effet : les libellés, le sujet et le corps du message, la phrase de la console.
//
// Une urgence du relais est une alerte interne NOUVELLE du mode vacances (`signaler_urgence_vacances`, appelée par
// `traiter_vacances` ou par la console). Sa nature vient de sa clé quand `traiter_vacances` l'a posée, sinon c'est un
// signalement fait à la main (une clé saisie qui imite celle du système n'y change rien, migration 20261014812000) ;
// jamais de son titre (texte libre) : le message ne porte que ces natures, leur heure et un lien vers la console. Ni nom,
// ni adresse, ni montant.
// L'envoi lui-même : `lib/relais-urgences-envoi.ts` (serveur seulement). La file : migration 20261014811000 ; le passage
// fréquent qui les constate : migration 20261014812000.

import { formaterDateHeureParis } from "./heure-paris";

/** Au plus 6 e-mails immédiats CRÉÉS par heure glissante ; au-delà, les urgences attendent le passage suivant ou l'e-mail de 5 h. */
export const PLAFOND_URGENCES_PAR_HEURE = 6;

/**
 * LE PASSAGE FRÉQUENT (relecture du 15/10/2026). Une urgence n'existe qu'une fois CONSTATÉE (`traiter_vacances`). Les
 * tâches Vercel ne passent qu'une fois par jour, le matin : un événement de l'après-midi attendait jusqu'à environ 18 h.
 * Depuis la migration 20261014812000, pg_cron appelle toutes les 10 minutes, jour et nuit (tâche `relais-urgences`), la
 * route /api/cron/relais?mode=urgences, qui constate puis envoie dans la foulée (`passerUrgencesRelais`).
 */
export const INTERVALLE_PASSAGE_URGENCES_MINUTES = 10;
/** L'horaire pg_cron de ce passage (tests/relais-urgences-passage-base.test.ts le compare à la base). */
export const HORAIRE_PASSAGE_URGENCES = "*/10 * * * *";

/**
 * Le délai RÉEL maximal entre l'événement et le départ de son e-mail, en marche normale : l'écart entre deux passages
 * (10 minutes) plus le passage lui-même — constat, puis envoi, chaque appel au service d'e-mail borné à 10 secondes, les
 * adresses en parallèle : moins d'une minute. Une urgence signalée à la main dans la console part aussitôt (après la
 * réponse du geste). Au-delà, l'urgence part au passage suivant ou dans l'e-mail de 5 h : plafond de 6 e-mails par heure
 * atteint, envoi en échec (repris au passage suivant), ou passage fréquent en panne (pg_net, jeton, site injoignable),
 * que l'e-mail de 5 h signale (« sans passage »).
 */
export const DELAI_URGENCE_MAX_MINUTES = INTERVALLE_PASSAGE_URGENCES_MINUTES + 1;

/**
 * LE FILET, si le passage fréquent ne fonctionne pas : le relais est alors actualisé à chaque passage de mission de
 * vercel.json, chaque matin de 03 h à 09 h UTC, soit de 4 h (hiver) à 11 h (été) à Paris ; sur l'offre Hobby de Vercel,
 * une tâche part à l'heure près (« 0 9 * * * » entre 09 h 00 et 09 h 59 UTC) : la fenêtre annoncée va donc jusqu'à
 * midi. tests/relais-urgences.test.ts vérifie que ces heures suivent vercel.json.
 */
export const PASSAGES_DU_MATIN_PARIS = { debut: 4, fin: 12 } as const;

/** La phrase de la console (décision du 15/10/2026) : le délai court à partir de l'événement. */
export const PHRASE_CANAUX_RELAIS = `Urgences : e-mail immédiat, au plus ${DELAI_URGENCE_MAX_MINUTES} min après l’événement ; autres alertes : e-mail quotidien à 5 h (Paris).`;

/** Ce que la console dit du constat : le passage fréquent, le geste manuel, et le filet si le passage est en panne. */
export const PHRASE_CONSTAT_URGENCES = `Un passage automatique constate les urgences toutes les ${INTERVALLE_PASSAGE_URGENCES_MINUTES} minutes, jour et nuit, et envoie leur e-mail dans la foulée : il part au plus ${DELAI_URGENCE_MAX_MINUTES} minutes après l’événement. Une urgence signalée à la main dans cette console part aussitôt. Si ce passage ne fonctionne pas, l’e-mail de 5 h le signale, et les urgences ne sont plus constatées qu’au passage des équipes, chaque matin entre ${PASSAGES_DU_MATIN_PARIS.debut} h et ${PASSAGES_DU_MATIN_PARIS.fin} h (heure de Paris), ou quand on actualise le relais.`;

export type NatureUrgence = "responsable_non_habilite" | "passage_a_reprendre" | "lecture_bloquee" | "signalement_manuel";

const LIBELLES: Record<NatureUrgence, string> = {
  responsable_non_habilite: "Le responsable du relais a perdu son habilitation : aucune tâche du plan ne peut démarrer",
  passage_a_reprendre: "Un passage des équipes est à reprendre",
  lecture_bloquee: "Une lecture autorisée par une consigne est bloquée",
  signalement_manuel: "Une urgence a été signalée à la main dans la console",
};

/** Le libellé d'une nature d'urgence ; une nature inconnue reste générique (jamais le texte reçu). */
export function libelleUrgence(nature: string): string {
  return Object.hasOwn(LIBELLES, nature) ? LIBELLES[nature as NatureUrgence] : "Une urgence du relais";
}

export type UrgenceEnvoi = { nature: string; posee_le: string };

export function sujetUrgencesRelais(n: number): string {
  return n > 1 ? `Gerimmo — ${n} urgences du relais` : "Gerimmo — urgence du relais";
}

function echapper(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Le corps de l'e-mail immédiat. Il ne dépend que des urgences de l'envoi et du lien : un envoi repris produit
 * exactement le même message (même clé d'envoi, même contenu), que le service ne renvoie pas une seconde fois.
 */
export function htmlUrgencesRelais(urgences: UrgenceEnvoi[], lienConsole: string): string {
  const n = urgences.length;
  const lignes = urgences.map((u) => `<li>${echapper(formaterDateHeureParis(u.posee_le))} — ${echapper(libelleUrgence(u.nature))}</li>`).join("");
  return `
<div style="font-family:Figtree,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#14304f">
  <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:0 0 8px">Relais — urgence du mode vacances</p>
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${n > 1 ? `${n} urgences à examiner` : "1 urgence à examiner"}</h1>
  <ul style="margin:0;padding-left:20px;line-height:1.6">${lignes}</ul>
  <p style="font-size:13px;color:#53617a;margin:8px 0 0">Heures du constat (heure de Paris).</p>
  <p style="margin:22px 0 20px">
    <a href="${echapper(lienConsole)}" style="display:inline-block;background:#14304f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Ouvrir la console</a>
  </p>
  <p style="font-size:13px;color:#53617a;margin:0">Cet e-mail part au plus ${DELAI_URGENCE_MAX_MINUTES} min après l’événement : un passage automatique constate les urgences toutes les ${INTERVALLE_PASSAGE_URGENCES_MINUTES} minutes, jour et nuit, et l’heure indiquée est celle de ce constat ; une urgence signalée à la main dans la console part aussitôt. Il part une seule fois par urgence, au plus ${PLAFOND_URGENCES_PAR_HEURE} fois par heure : au-delà, ou si l’envoi échoue, les urgences en attente partent groupées au passage suivant ou dans l’e-mail de 5 h (heure de Paris), qui les rappelle toutes. Il ne contient ni nom ni montant ; l’arrêt d’urgence ne le coupe pas. Rien ne se décide depuis lui : les gestes se font dans la console.</p>
</div>`;
}

// ── Le rappel de l'e-mail de 5 h ──────────────────────────────────────────────────────────────────────────────────

/** Le sort de l'e-mail immédiat d'une urgence, tel que la base le dit (`urgences_relais_recentes`). */
export type UrgenceRecente = { alerte: string; nature: string; posee_le: string; email: string };

const SORTS: Record<string, string> = {
  envoye: "e-mail immédiat envoyé",
  en_cours: "e-mail immédiat en cours d’envoi",
  // Relecture du 15/10 : un envoi à reprendre (échec pour au moins une adresse) ou coupé n'est jamais dit « en cours ».
  echec_reprise: "e-mail immédiat en échec pour au moins une adresse : nouvel essai au passage suivant",
  en_attente: "e-mail immédiat pas encore parti (plafond atteint ou envoi à reprendre) : rappelée ici",
  quotidien: "reprise dans un e-mail de 5 h",
  echec: "e-mail immédiat non confirmé pour toutes les adresses (échec de l’envoi)",
  hors_file: "pas d’e-mail immédiat (posée avant sa mise en place, ou file indisponible)",
};

export function libelleSortEmail(sort: string): string {
  return Object.hasOwn(SORTS, sort) ? SORTS[sort] : "sort de l’e-mail immédiat inconnu";
}
