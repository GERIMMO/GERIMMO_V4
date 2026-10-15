// L'E-MAIL IMMÉDIAT DES URGENCES DU RELAIS (D46-B, décision du dirigeant du 15/10/2026, « envoi immédiat pour les
// urgences ») — la partie sans effet : les libellés, le sujet et le corps du message, la phrase de la console.
//
// Une urgence du relais est une alerte interne NOUVELLE du mode vacances (`signaler_urgence_vacances`, appelée par
// `traiter_vacances` ou par la console). Sa nature vient de sa clé, jamais de son titre (texte libre) : le message ne
// porte que ces natures, leur heure et un lien vers la console. Ni nom, ni adresse, ni montant.
// L'envoi lui-même : `lib/relais-urgences-envoi.ts` (serveur seulement). La file : migration 20261014811000.

import { formaterDateHeureParis } from "./heure-paris";

/** Au plus 6 e-mails immédiats CRÉÉS par heure glissante ; au-delà, les urgences attendent le passage suivant ou l'e-mail de 5 h. */
export const PLAFOND_URGENCES_PAR_HEURE = 6;

/**
 * Le délai entre le CONSTAT d'une urgence (sa pose en base) et le départ de son e-mail, en marche normale. Il ne court
 * pas depuis l'événement lui-même : voir `PASSAGES_DU_MATIN_PARIS`. L'envoi part juste après la transaction qui pose
 * l'urgence, dans la même requête (passage de mission, passage de 5 h, geste de la console) : le temps d'une lecture de
 * la file et d'un appel au service d'e-mail, borné à 15 secondes, les adresses en parallèle (trois tours au plus).
 * Plafond atteint ou envoi en échec : l'urgence part au passage suivant, au plus tard dans l'e-mail de 5 h.
 */
export const DELAI_URGENCE_MAX_MINUTES = 1;

/**
 * QUAND UNE URGENCE EST CONSTATÉE (relecture du 15/10/2026). Rien ne la guette en continu : elle n'est posée que lorsque
 * le relais est actualisé (`traiter_vacances`) ou qu'on la signale dans la console. Le relais est actualisé :
 *  · à chaque passage de mission de vercel.json, chaque matin de 03 h à 09 h UTC, soit de 4 h (hiver) à 11 h (été) à
 *    Paris, passage de 5 h compris ;
 *  · dans la journée, seulement quand une mission est lancée : la mission marketing appelée par pg_cron quand une
 *    publication est due, « Lancer maintenant » de l'écran Santé ;
 *  · au geste « Actualiser » de la console.
 * Un événement survenu entre deux passages (passage « veille » de 09 h UTC interrompu, habilitation perdue l'après-midi)
 * n'est donc constaté qu'au passage suivant, souvent le lendemain matin, jusqu'à environ 18 h plus tard ; son e-mail
 * part alors. Un passage fréquent (pg_cron toutes les 5 à 15 min) irait au-delà de la décision du 15/10 : il revient au
 * dirigeant d'en décider. tests/relais-urgences.test.ts vérifie que ces heures suivent vercel.json.
 */
export const PASSAGES_DU_MATIN_PARIS = { debut: 4, fin: 11 } as const;

/** La phrase de la console (décision du 15/10/2026) : le délai court à partir du constat. */
export const PHRASE_CANAUX_RELAIS = `Urgences : e-mail immédiat, au plus ${DELAI_URGENCE_MAX_MINUTES} min après leur constat ; autres alertes : e-mail quotidien à 5 h (Paris).`;

/** Ce que la console dit du constat : quand il a lieu, et ce qui attend le passage suivant. */
export const PHRASE_CONSTAT_URGENCES = `Les urgences ne sont pas surveillées en continu : elles sont constatées au passage des équipes, chaque matin entre ${PASSAGES_DU_MATIN_PARIS.debut} h et ${PASSAGES_DU_MATIN_PARIS.fin} h (heure de Paris), dans la journée seulement si une mission est lancée (publication programmée, lancement à la main), et dans cette console quand on actualise le relais ou qu’on signale une urgence. Ce qui arrive entre deux passages, par exemple l’après-midi, n’est constaté qu’au passage suivant, souvent le lendemain matin : son e-mail part alors, pas avant.`;

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
<div style="font-family:Figtree,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f2352">
  <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:0 0 8px">Relais — urgence du mode vacances</p>
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${n > 1 ? `${n} urgences à examiner` : "1 urgence à examiner"}</h1>
  <ul style="margin:0;padding-left:20px;line-height:1.6">${lignes}</ul>
  <p style="font-size:13px;color:#53617a;margin:8px 0 0">Heures du constat (heure de Paris).</p>
  <p style="margin:22px 0 20px">
    <a href="${echapper(lienConsole)}" style="display:inline-block;background:#2457f5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Ouvrir la console</a>
  </p>
  <p style="font-size:13px;color:#53617a;margin:0">Cet e-mail part au plus ${DELAI_URGENCE_MAX_MINUTES} min après le constat d’une urgence du relais, une seule fois par urgence, au plus ${PLAFOND_URGENCES_PAR_HEURE} fois par heure : au-delà, ou si l’envoi échoue, les urgences en attente partent groupées au passage suivant ou dans l’e-mail de 5 h (heure de Paris), qui les rappelle toutes. Une urgence n’est constatée qu’au passage des équipes (chaque matin) ou dans la console : ce qui arrive entre deux passages n’est constaté qu’au passage suivant, et l’heure indiquée est celle du constat. Il ne contient ni nom ni montant ; l’arrêt d’urgence ne le coupe pas. Rien ne se décide depuis lui : les gestes se font dans la console.</p>
</div>`;
}

// ── Le rappel de l'e-mail de 5 h ──────────────────────────────────────────────────────────────────────────────────

/** Le sort de l'e-mail immédiat d'une urgence, tel que la base le dit (`urgences_relais_recentes`). */
export type UrgenceRecente = { alerte: string; nature: string; posee_le: string; email: string };

const SORTS: Record<string, string> = {
  envoye: "e-mail immédiat envoyé",
  en_cours: "e-mail immédiat en cours d’envoi",
  en_attente: "e-mail immédiat pas encore parti (plafond atteint ou envoi à reprendre) : rappelée ici",
  quotidien: "reprise dans un e-mail de 5 h",
  echec: "e-mail immédiat non confirmé pour toutes les adresses (échec de l’envoi)",
  hors_file: "pas d’e-mail immédiat (posée avant sa mise en place, ou file indisponible)",
};

export function libelleSortEmail(sort: string): string {
  return Object.hasOwn(SORTS, sort) ? SORTS[sort] : "sort de l’e-mail immédiat inconnu";
}
