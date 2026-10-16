// L'E-MAIL IMMÉDIAT DES URGENCES DU RELAIS (D46-B, décision du dirigeant du 15/10/2026) — l'envoi.
//
// La file vit en base (migration 20261014811000) : chaque alerte interne nouvelle du mode vacances y entre « à envoyer »,
// par déclencheur, dans la transaction qui la pose — sans rien attendre et sans pouvoir la faire échouer. Ce module la
// vide. Il est appelé JUSTE APRÈS chaque endroit qui peut poser une urgence, une fois cette transaction validée :
//  · chaque passage de mission (/api/cron/equipes → `executerMission`, après `traiter_vacances`), y compris les appels
//    de la mission marketing par pg_cron (toutes les 5 minutes de 05 h à 19 h UTC, quand une publication est due) et
//    « Lancer maintenant » de l'écran Santé ;
//  · le passage de 5 h (/api/cron/relais, après `traiter_vacances`) ;
//  · les deux gestes de la console qui en posent (« Actualiser », « Signaler une urgence interne »), après la réponse ;
//  · LE PASSAGE FRÉQUENT (relecture du 15/10, migration 20261014812000) : pg_cron appelle toutes les 10 minutes, jour et
//    nuit, /api/cron/relais?mode=urgences avec son propre jeton généré en base (`accesPassageUrgences`) ; la route ne fait
//    que constater (`traiter_vacances`) puis vider la file (`passerUrgencesRelais`). Sans lui, les tâches Vercel ne
//    passant qu'une fois par jour, un événement de l'après-midi n'était constaté que le lendemain matin.
// Une urgence ne naît que dans l'un de ces passages, l'e-mail part du même.
//
// Dans l'ordre : relais non configuré → rien (la file est conservée, elle partira une fois les adresses renseignées) ;
// `prendre_urgences_relais` (reprise d'un envoi inachevé, sinon nouvel envoi sous le plafond de 6 par heure) ; un e-mail
// par adresse, en parallèle, chacun avec une clé d'envoi stable pour l'envoi et l'adresse (une reprise ne fait pas
// partir de second message chez le service) ; `terminer_urgences_relais` (nombres seulement). Trois tours au plus.
//
// NE LÈVE JAMAIS : une base indisponible, un service d'e-mail muet ou une erreur imprévue se terminent par un résultat,
// jamais par une exception qui ferait échouer la mission, le passage de 5 h ou le geste de la console.
//
// L'ARRÊT D'URGENCE NE COUPE PAS CET E-MAIL, comme celui de 5 h (même règle, justifiée dans `relais-alerte-envoi.ts`) :
// il part vers les seules adresses du dirigeant, ne contient ni nom ni montant et ne modifie rien chez les utilisateurs.
// Aucun `avantEnvoi`, aucun contrôle d'arrêt n'est consulté.

import "server-only";
import { createHash } from "node:crypto";
import { DELAI_MAX_FOURNISSEUR_MS, envoyerEmail } from "./email";
import { porteurDuSecret } from "./tache";
import { adresseDuSite } from "./site";
import { adressesRelaisDuServeur } from "./relais-alerte-reglage";
import type { AdressesRelais } from "./relais-alerte";
import { htmlUrgencesRelais, PLAFOND_URGENCES_PAR_HEURE, sujetUrgencesRelais, type UrgenceEnvoi } from "./relais-urgences";

type Reponse = { data: unknown; error: unknown };
export type ClientUrgences = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<Reponse> };

/** Le compte rendu d'un passage : des nombres et des états, jamais une adresse. */
export type ResultatUrgences = {
  /** Pourquoi le passage s'est arrêté (« delai » : l'échéance donnée par l'appelant est atteinte, la suite attend). */
  arret: "non_configure" | "rien" | "plafond" | "echec" | "indisponible" | "tours" | "delai";
  envois: { urgences: number; destinataires: number; envoyes: number; reprise: boolean; statut: string }[];
  /** Les urgences qui attendent encore (plafond atteint, ou plus de 50 d'un coup). */
  en_attente?: number;
};

const TOURS_MAX = 3;
/** En dessous de ce temps restant avant l'échéance, aucun nouveau tour n'est commencé (l'appel échouerait à coup sûr). */
const DELAI_TOUR_MIN_MS = 1_000;

/** Une clé d'envoi stable pour l'envoi et l'adresse, sans l'adresse elle-même. */
function cleEnvoi(envoi: string, adresse: string): string {
  return `relais-urgence-${envoi}-${createHash("sha256").update(adresse.toLowerCase()).digest("hex").slice(0, 16)}`;
}

type Prise = { pris?: unknown; motif?: unknown; envoi?: unknown; reprise?: unknown; urgences?: unknown; en_attente?: unknown };

function urgencesLues(v: unknown): UrgenceEnvoi[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((u): u is { nature: string; posee_le: string } => typeof u?.nature === "string" && typeof u?.posee_le === "string")
    .map((u) => ({ nature: u.nature, posee_le: u.posee_le }));
}

/** Vide la file des urgences du relais. Voir l'en-tête du fichier. */
export async function envoyerUrgencesRelais(options: {
  db: ClientUrgences | null;
  adresses?: AdressesRelais;
  site?: string | null;
  envoyer?: typeof envoyerEmail;
  /** Délai maximal d'un appel au service d'e-mail (15 s par défaut) ; réglable pour les tests. */
  delaiMaxMs?: number;
  plafond?: number;
  /**
   * Heure (sur `horloge`, en millisecondes) à laquelle les appels au service d'e-mail doivent être finis : le passage de
   * 5 h, coupé à 60 s, la fixe pour garder le temps de son propre e-mail. Chaque appel est borné au temps restant ; s'il
   * en reste trop peu, aucun nouveau tour n'est commencé (la file attend le passage suivant). Absente : aucune échéance.
   */
  echeance?: number;
  horloge?: () => number;
}): Promise<ResultatUrgences> {
  const envois: ResultatUrgences["envois"] = [];
  try {
    const adresses = options.adresses ?? adressesRelaisDuServeur();
    // Relais non configuré : rien ne part, rien n'est pris. La file reste telle quelle.
    if (!adresses.configure) return { arret: "non_configure", envois };
    const { db } = options;
    if (!db) return { arret: "indisponible", envois };
    const envoyer = options.envoyer ?? envoyerEmail;
    const site = (options.site !== undefined ? options.site : adresseDuSite()) ?? "https://www.gerimmo.app";

    const horloge = options.horloge ?? Date.now;
    for (let tour = 0; tour < TOURS_MAX; tour++) {
      // Le délai de ce tour, décidé AVANT de prendre un envoi (un envoi pris et non tenté resterait en cours).
      let delaiMaxMs = options.delaiMaxMs;
      if (options.echeance !== undefined) {
        const plafondAppel = options.delaiMaxMs ?? DELAI_MAX_FOURNISSEUR_MS;
        const restant = options.echeance - horloge();
        if (restant < Math.min(DELAI_TOUR_MIN_MS, plafondAppel)) return { arret: "delai", envois };
        delaiMaxMs = Math.min(plafondAppel, restant);
      }
      const prise = await db.rpc("prendre_urgences_relais", { p_plafond: options.plafond ?? PLAFOND_URGENCES_PAR_HEURE });
      const p = prise.data as Prise | null;
      if (prise.error || !p || typeof p !== "object") return { arret: "indisponible", envois };
      const enAttente = typeof p.en_attente === "number" ? p.en_attente : undefined;
      if (p.pris !== true || typeof p.envoi !== "string") {
        return { arret: p.motif === "plafond" ? "plafond" : "rien", envois, ...(enAttente ? { en_attente: enAttente } : {}) };
      }
      const envoi = p.envoi;
      const urgences = urgencesLues(p.urgences);
      if (urgences.length === 0) {
        // Un envoi sans urgence lisible (ses urgences ont disparu) : clos SANS e-mail, « abandonné », zéro destinataire
        // (`clore_envoi_urgences_vide`) — jamais consigné « envoyé » (relecture du 15/10). S'il porte encore des urgences
        // que ce passage n'a pas su lire, la base refuse de le clore : il reste à reprendre, puis est abandonné, et
        // l'e-mail de 5 h rappelle ses urgences en échec.
        const clos = await db.rpc("clore_envoi_urgences_vide", { p_envoi: envoi });
        if (clos.error || (clos.data as { termine?: unknown } | null)?.termine !== true) {
          console.error("[relais] Un envoi immédiat sans urgence lisible n’a pas pu être clos ; il sera repris.");
          return { arret: "indisponible", envois };
        }
        continue;
      }
      const html = htmlUrgencesRelais(urgences, `${site}/admin`);
      const sujet = sujetUrgencesRelais(urgences.length);
      // Les adresses en parallèle : le délai d'un service lent ne s'additionne pas d'une adresse à l'autre.
      const resultats = await Promise.all(adresses.valides.map((to) =>
        envoyer({ to, subject: sujet, html, cleIdempotence: cleEnvoi(envoi, to), ...(delaiMaxMs ? { delaiMaxMs } : {}) })
          .catch(() => ({ erreur: "envoi interrompu" }))
      ));
      const envoyes = resultats.filter((r) => !r.erreur).length;
      if (envoyes < adresses.valides.length) console.error("[relais] Un envoi immédiat d’urgence n’a pas abouti ; il sera repris.");
      const fin = await db.rpc("terminer_urgences_relais", { p_envoi: envoi, p_destinataires: adresses.valides.length, p_envoyes: envoyes });
      const f = fin.data as { statut?: unknown } | null;
      if (fin.error) console.error("[relais] Le résultat d’un envoi immédiat n’a pas pu être consigné.");
      envois.push({
        urgences: urgences.length, destinataires: adresses.valides.length, envoyes, reprise: p.reprise === true,
        statut: typeof f?.statut === "string" ? f.statut : "inconnu",
      });
      if (fin.error) return { arret: "indisponible", envois };
      // Un envoi incomplet se reprend au passage SUIVANT (jamais tout de suite : trois essais d'affilée contre un service
      // en panne l'abandonneraient en quelques secondes).
      if (envoyes < adresses.valides.length) return { arret: "echec", envois, ...(enAttente ? { en_attente: enAttente } : {}) };
      if (!enAttente) return { arret: "rien", envois };
    }
    return { arret: "tours", envois };
  } catch {
    console.error("[relais] L’envoi immédiat des urgences a été interrompu ; il sera repris au passage suivant.");
    return { arret: "indisponible", envois };
  }
}

// ── Le passage fréquent (relecture du 15/10/2026, migration 20261014812000) ─────────────────────────────────────────

/** Délai maximal d'un appel au service d'e-mail pendant le passage fréquent : un passage court, toutes les 10 minutes. */
export const DELAI_APPEL_PASSAGE_MS = 10_000;

/**
 * La requête porte-t-elle le jeton du passage des urgences ? Le jeton est généré en base et lu par le client de service
 * (`jeton_declencheur_relais_urgences`) ; la comparaison est à temps constant (`porteurDuSecret`). Il n'est jamais écrit
 * dans un journal ni renvoyé. Illisible ou absent en base (migration non appliquée) : « non_configure ».
 */
export async function accesPassageUrgences(request: Request, db: ClientUrgences): Promise<"autorise" | "refuse" | "non_configure"> {
  try {
    const { data, error } = await db.rpc("jeton_declencheur_relais_urgences");
    if (error || typeof data !== "string" || !/^[0-9a-f]{64}$/.test(data)) return "non_configure";
    return porteurDuSecret(request, data) ? "autorise" : "refuse";
  } catch {
    return "non_configure";
  }
}

/** Ce que rend le passage fréquent : des états et des nombres, jamais une adresse ni le jeton. */
export type ResultatPassageUrgences = { constat: "fait" | "indisponible"; envoi: ResultatUrgences };

/**
 * Le passage fréquent des urgences, et rien d'autre : (a) constater (`traiter_vacances`), (b) vider la file de l'e-mail
 * immédiat (`envoyerUrgencesRelais` : file vide, aucun appel au service d'e-mail). Les urgences déjà en file partent même
 * si le constat échoue. Le passage n'est consigné (`consigner_passage_urgences_relais`, lu par la sentinelle de 5 h) que
 * si le constat a eu lieu. Aucun contrôle d'arrêt d'urgence, comme les deux autres envois du relais. Ne lève jamais.
 */
export async function passerUrgencesRelais(options: {
  db: ClientUrgences;
  adresses?: AdressesRelais;
  site?: string | null;
  envoyer?: typeof envoyerEmail;
  delaiMaxMs?: number;
}): Promise<ResultatPassageUrgences> {
  const { db } = options;
  let constat: ResultatPassageUrgences["constat"] = "indisponible";
  try {
    const { error } = await db.rpc("traiter_vacances");
    if (!error) constat = "fait";
  } catch {
    // Rien de plus : la file est vidée quand même, et le passage n'est pas consigné.
  }
  if (constat !== "fait") console.error("[relais] Le passage des urgences n’a pas pu actualiser le relais ; la file est vidée quand même.");
  const envoi = await envoyerUrgencesRelais({ ...options, delaiMaxMs: options.delaiMaxMs ?? DELAI_APPEL_PASSAGE_MS });
  if (constat === "fait") {
    try {
      const { error } = await db.rpc("consigner_passage_urgences_relais");
      if (error) console.error("[relais] Le passage des urgences n’a pas pu être consigné.");
    } catch {
      console.error("[relais] Le passage des urgences n’a pas pu être consigné.");
    }
  }
  return { constat, envoi };
}
