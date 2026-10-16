// L'ALERTE E-MAIL DU RELAIS (D46-B, décisions du dirigeant du 15/10/2026) — le passage quotidien.
//
// Appelé par la route /api/cron/relais (Vercel, 03 h et 04 h UTC). Dans l'ordre :
//  1. il n'agit que s'il est 5 h à Paris (`estHeureDuRelais`) ;
//  2. il réserve le jour de Paris en base (`reserver_alerte_relais`) : appelé deux fois, il n'envoie qu'une fois ;
//  3. il actualise le relais du mode vacances (`traiter_vacances`, comme chaque passage de mission), envoie tout de
//     suite les urgences que cela vient de poser (e-mail immédiat, `envoyerUrgencesRelais`, décision du 15/10), puis
//     lit la sentinelle (`sentinelle_relais` : alertes non accusées, arrêts actifs, tâches pg_cron), l'état des tâches
//     de l'écran Santé — missions, suivi des dossiers, sauvegarde quotidienne (la même lecture, `chargerEtatTaches`) —
//     et les urgences des dernières 24 h (`urgences_relais_recentes`), rappelées même si leur e-mail immédiat est parti ;
//  4. rien à signaler ni à rappeler : aucun e-mail ; sinon un e-mail par adresse du réglage, en parallèle, chacun avec
//     une clé d'envoi stable pour le jour (une reprise après échec ne fait pas partir un second message chez le
//     fournisseur), et chaque appel borné pour que le passage finisse avant la coupure de la route (voir plus bas) ;
//     parti vers toutes les adresses, il reprend les urgences qui attendaient encore leur e-mail immédiat (plafond
//     atteint) : elles ne repartent plus (`urgences_relais_au_quotidien`) ;
//  5. il consigne le résultat (`terminer_alerte_relais`, nombres seulement).
//
// L'ARRÊT D'URGENCE NE COUPE PAS CETTE ALERTE (choix motivé, document « Équipes IA », § 4.2 et § 4.3).
//  - L'arrêt existe pour retenir les EFFETS des traitements sur les personnes et les tiers : e-mails aux locataires,
//    Facebook, Stripe, suppressions (§ 4.2, colonne « Couvert »). Cette alerte n'a aucun de ces effets : elle part
//    vers les seules adresses du dirigeant, ne contient ni nom ni montant, et ne modifie rien.
//  - Elle est le canal de supervision lui-même (§ 4.3, escalade : « N2 : alerte interne et e-mail au superviseur ») et
//    l'arrêt actif est l'un de ses sujets : coupée par l'arrêt, elle ne pourrait jamais dire qu'un arrêt oublié tient
//    tout le produit à l'arrêt. Tout arrêt actif étant signalé par elle, la couper « sauf quand l'arrêt est son sujet »
//    revient à ne jamais la couper : elle ne consulte donc aucun contrôle d'arrêt (`verifierAvantEffet` n'est pas appelé).
//  - Elle reste bornée : au plus un e-mail par jour, à 5 h, et seulement s'il y a quelque chose à signaler. L'e-mail
//    immédiat des urgences (décision du 15/10) suit la même règle, borné lui aussi : une fois par urgence, au plus 6 par
//    heure ; son passage toutes les 10 minutes (tâche pg_cron `relais-urgences`, migration 20261014812000) aussi : il est
//    recensé hors de la table des tâches qu'arrête l'arrêt (`supervision_taches_hors_arret`), et ne lit aucun arrêt.
//    Pour les faire taire, on vide la variable GERIMMO_RELAIS_EMAILS (l'écran dit alors « relais non configuré »).
//  L'écran « Relais et arrêts » le dit dans « Ce que l'arrêt ne couvre pas ».

import "server-only";
import { attendreRelais } from "./delai-relais";
import { createHash } from "node:crypto";
import { envoyerEmail } from "./email";
import { estTacheSuivie, TACHES_SUIVIES } from "./missions";
import { chargerEtatTaches, type ClientQuiLitLeJournal } from "./sante-service";
import { arretSansEffet, TACHES_SQL, TACHES_SQL_HORS_ARRET } from "./nom-arret-supervision";
import { composantesParis } from "./heure-paris-calcul";
import { adresseDuSite } from "./site";
import { adressesRelaisDuServeur } from "./relais-alerte-reglage";
import { envoyerUrgencesRelais } from "./relais-urgences-envoi";
import type { UrgenceRecente } from "./relais-urgences";
import {
  compteursDuRelais,
  estHeureDuRelais,
  htmlAlerteRelais,
  pointsDuRelais,
  sujetAlerteRelais,
  urgencesDuRelais,
  type AdressesRelais,
  type ConstatRelais,
  type EtatTacheSignalee,
} from "./relais-alerte";

/** Le libellé d'une tâche pg_cron : celui de l'écran d'arrêt (les dix tâches connues), sinon son nom brut. */
function libelleTacheBase(tache: string): string {
  return TACHES_SQL[tache]?.libelle ?? TACHES_SQL_HORS_ARRET[tache]?.libelle ?? `Tâche de la base « ${tache} »`;
}

type Sentinelle = {
  alertes?: { ouvertes?: unknown; escaladees?: unknown; non_acheminees?: unknown };
  arrets?: { cle?: unknown; depuis?: unknown }[];
  taches_base_lisibles?: unknown;
  taches_base?: { tache?: unknown; etat?: unknown }[];
};

const entier = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0);

/** Les urgences des dernières 24 h, telles que `urgences_relais_recentes` les rend ; null si illisibles. */
function urgencesRecentesLues(v: unknown): { liste: UrgenceRecente[]; total: number } | null {
  const r = v as { urgences?: unknown; total?: unknown } | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.urgences)) return null;
  const liste = r.urgences
    .filter((u): u is UrgenceRecente => typeof u?.alerte === "string" && typeof u?.nature === "string" && typeof u?.posee_le === "string" && typeof u?.email === "string")
    .map((u) => ({ alerte: u.alerte, nature: u.nature, posee_le: u.posee_le, email: u.email }));
  return { liste, total: Math.max(entier(r.total), liste.length) };
}

/** Le constat, à partir de la sentinelle de la base et de l'état des missions. Pur, vérifiable. */
export function constaterRelais(
  sentinelle: Sentinelle | null,
  missions: { nom: string; etat: string }[] | null,
  relaisNonActualise: boolean,
  /** Le rappel des urgences des dernières 24 h ; null : illisible ; absent : non demandé. */
  urgences?: { liste: UrgenceRecente[]; total: number } | null
): ConstatRelais {
  const lecturesImpossibles: string[] = [];
  const arrets = sentinelle
    ? (Array.isArray(sentinelle.arrets) ? sentinelle.arrets : [])
        .filter((a) => typeof a?.cle === "string")
        .map((a) => ({ cle: a.cle as string, depuis: typeof a.depuis === "string" ? a.depuis : null }))
    : [];
  const alertes = sentinelle?.alertes
    ? { ouvertes: entier(sentinelle.alertes.ouvertes), escaladees: entier(sentinelle.alertes.escaladees), non_acheminees: entier(sentinelle.alertes.non_acheminees) }
    : null;
  if (!sentinelle) lecturesImpossibles.push("Les alertes du mode vacances, les arrêts d’urgence et les tâches de la base n’ont pas pu être lus.");

  const taches: { libelle: string; etat: EtatTacheSignalee }[] = [];
  // Toutes les tâches de l'écran Santé (`chargerEtatTaches`) : les missions de l'entrée unique /api/cron/equipes, le
  // suivi des dossiers et la sauvegarde quotidienne (relecture du 15/10 : l'écran annonce « les tâches en échec ou
  // absentes », la sauvegarde comprise). Une mission en pause n'est pas comptée. L'absence d'une tâche que retient un
  // arrêt d'urgence (signalé à part) n'est pas comptée non plus ; la sauvegarde ne lit aucun arrêt (ni « global », ni
  // sa clé, `arretSansEffet`) : son absence est toujours signalée.
  const arretees = new Set(arrets.map((a) => a.cle));
  if (missions === null) {
    lecturesImpossibles.push("Le suivi des missions planifiées n’a pas pu être lu.");
  } else {
    for (const t of missions) {
      if (!estTacheSuivie(t.nom)) continue;
      const libelle = TACHES_SUIVIES[t.nom].nom;
      const retenueParUnArret = !arretSansEffet(t.nom) && (arretees.has("global") || arretees.has(t.nom));
      if (t.etat === "echec") taches.push({ libelle, etat: "echec" });
      else if ((t.etat === "retard" || t.etat === "jamais") && !retenueParUnArret) taches.push({ libelle, etat: "absente" });
    }
  }
  // Les tâches pg_cron (la sentinelle de la base).
  if (sentinelle) {
    if (sentinelle.taches_base_lisibles !== true) {
      lecturesImpossibles.push("Les exécutions des tâches de la base (pg_cron) n’ont pas pu être lues.");
    } else {
      for (const t of Array.isArray(sentinelle.taches_base) ? sentinelle.taches_base : []) {
        if (typeof t?.tache !== "string") continue;
        // « sans_passage » : le passage des urgences, appelé à l'heure par pg_cron, n'a été reçu par aucun serveur depuis
        // 30 minutes (pg_net, adresse du site ou jeton : migration 20261014812000).
        if (t.etat === "echec" || t.etat === "absente" || t.etat === "non_programmee" || t.etat === "sans_passage") taches.push({ libelle: libelleTacheBase(t.tache), etat: t.etat });
      }
    }
  }
  if (urgences === null) lecturesImpossibles.push("Les urgences des dernières 24 h n’ont pas pu être lues.");
  return { arrets, alertes, taches, lecturesImpossibles, relaisNonActualise, ...(urgences !== undefined ? { urgences } : {}) };
}

/** Une clé d'envoi stable pour le jour et l'adresse, sans l'adresse elle-même. */
function cleEnvoi(jour: string, adresse: string): string {
  return `relais-${jour}-${createHash("sha256").update(adresse.toLowerCase()).digest("hex").slice(0, 16)}`;
}

type Reponse = { data: unknown; error: unknown };
export type ClientRelais = ClientQuiLitLeJournal & {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<Reponse>;
};

export type ResultatRelais =
  | { ignore: true; motif: "hors_creneau"; heure_paris: number }
  | { ignore: true; motif: "deja_traite"; jour: string; statut: string }
  | { erreur: string; status: 503 | 500 }
  | { jour: string; statut: "envoye" | "envoi_partiel" | "echec" | "rien_a_signaler" | "non_configure"; destinataires: number; envoyes: number; points: number };

/**
 * LA DURÉE DU PASSAGE (tour final de vérification du 16/10/2026). La route /api/cron/relais est coupée à 60 s
 * (`maxDuration`). Coupée avant `terminer_alerte_relais`, la ligne du jour resterait « en_cours » et l'alerte du jour
 * serait perdue sans bruit (l'autre appel de Vercel tombe hors créneau). Les appels au service d'e-mail doivent donc
 * être finis aux trois quarts de cette durée (45 s) ; le dernier quart reste aux lectures et à l'écriture en base.
 * L'e-mail immédiat des urgences passe d'abord, borné à cette échéance moins un appel : l'e-mail de 5 h garde toujours
 * son créneau. Celui-ci part vers les adresses en parallèle, chaque appel borné au temps restant (10 s au plus).
 * Les lectures et mutations partagent aussi une échéance absolue (55 s depuis la route, 57 s par défaut).
 * Un budget épuisé ne déclenche plus d’e-mail ; une réservation interrompue suit la reprise existante en base.
 */
export const DUREE_MAX_PASSAGE_RELAIS_MS = 60_000;
/** Délai maximal d'un appel au service d'e-mail pendant le passage de 5 h. */
export const DELAI_APPEL_RELAIS_MS = 10_000;
/** La part de la durée du passage laissée aux appels au service d'e-mail. */
const PART_DES_ENVOIS = 0.75;
/** Un appel n'est jamais borné en dessous de ce délai (ou du délai d'un appel, s'il est plus court). */
const DELAI_APPEL_MIN_MS = 1_000;

/** Le passage quotidien du relais. Voir l'en-tête du fichier. */
export async function passerAlerteRelais(options: {
  db: ClientRelais;
  maintenant?: Date;
  adresses?: AdressesRelais;
  site?: string | null;
  envoyer?: typeof envoyerEmail;
  /** Délai maximal d'un appel au service d'e-mail (10 s par défaut) ; réglable pour les tests. */
  delaiMaxMs?: number;
  /** La durée dont dispose le passage avant la coupure de la route (60 s par défaut). */
  dureeMaxMs?: number;
  /** Échéance reçue de la route : compte aussi le temps passé avant cet appel. */
  echeance?: number;
  /** L'horloge qui mesure cette durée, en millisecondes (`Date.now` par défaut) ; réglable pour les tests. */
  horloge?: () => number;
}): Promise<ResultatRelais> {
  const horloge = options.horloge ?? Date.now;
  const debut = horloge();
  const maintenant = options.maintenant ?? new Date();
  if (!estHeureDuRelais(maintenant)) return { ignore: true, motif: "hors_creneau", heure_paris: composantesParis(maintenant).heure };
  const { db } = options;
  const adresses = options.adresses ?? adressesRelaisDuServeur();
  const envoyer = options.envoyer ?? envoyerEmail;
  const delaiAppel = options.delaiMaxMs ?? DELAI_APPEL_RELAIS_MS;
  const duree = options.dureeMaxMs ?? DUREE_MAX_PASSAGE_RELAIS_MS;
  const finPassage = Math.min(options.echeance ?? Infinity, debut + Math.floor(duree * 0.95));
  const finDesEnvois = Math.min(debut + Math.floor(duree * PART_DES_ENVOIS), finPassage - Math.min(1_000, duree * 0.05));
  const appeler = (nom: string, args?: Record<string, unknown>) => attendreRelais(() => db.rpc(nom, args), finPassage, horloge);

  let reservation: Reponse;
  try { reservation = await appeler("reserver_alerte_relais"); }
  catch { return { erreur: "Le contrôle du relais est indisponible.", status: 503 }; }
  const r = reservation.data as { reserve?: unknown; jour?: unknown; statut?: unknown } | null;
  if (reservation.error || !r || typeof r.jour !== "string") return { erreur: "Le contrôle du relais est indisponible.", status: 503 };
  const jour = r.jour;
  if (r.reserve !== true) return { ignore: true, motif: "deja_traite", jour, statut: typeof r.statut === "string" ? r.statut : "inconnu" };

  const terminer = async (statut: Exclude<ResultatRelais, { ignore: true } | { erreur: string }>["statut"], envoyes: number, constat: ConstatRelais) => {
    const points = pointsDuRelais(constat);
    const { error } = await appeler("terminer_alerte_relais", {
      p_jour: jour, p_statut: statut, p_destinataires: adresses.valides.length, p_envoyes: envoyes, p_points: points,
      p_compteurs: compteursDuRelais(constat, adresses.invalides),
    });
    if (error) console.error("[relais] Le résultat du passage n’a pas pu être consigné.");
    return { jour, statut, destinataires: adresses.valides.length, envoyes, points };
  };

  try {
    // Le relais du mode vacances d'abord : ses urgences et escalades sont ainsi à jour.
    const vacances = await attendreRelais(() => db.rpc("traiter_vacances"), finPassage, horloge);
    // Les urgences que ce passage vient de poser partent tout de suite, comme après chaque passage de mission ; l'e-mail
    // de 5 h les rappelle ensuite (décision du 15/10). Ne lève jamais.
    // Bornées pour laisser à l'e-mail de 5 h un appel entier avant la fin des envois (voir la durée du passage).
    await envoyerUrgencesRelais({ db, adresses, site: options.site, envoyer, delaiMaxMs: delaiAppel, echeance: finDesEnvois - delaiAppel, horloge });
    const sentinelle = await appeler("sentinelle_relais");
    const missions = await attendreRelais(() => chargerEtatTaches(db, maintenant), finPassage, horloge);
    const recentes = await appeler("urgences_relais_recentes");
    const constat = constaterRelais(
      sentinelle.error || !sentinelle.data || typeof sentinelle.data !== "object" ? null : (sentinelle.data as Sentinelle),
      missions,
      Boolean(vacances.error),
      recentes.error ? null : urgencesRecentesLues(recentes.data)
    );
    const points = pointsDuRelais(constat);
    const urgences = urgencesDuRelais(constat);
    if (!adresses.configure) return await terminer("non_configure", 0, constat);
    if (points === 0 && urgences === 0) return await terminer("rien_a_signaler", 0, constat);

    const site = (options.site !== undefined ? options.site : adresseDuSite()) ?? "https://www.gerimmo.app";
    const html = htmlAlerteRelais(constat, maintenant, `${site}/admin`);
    const sujet = sujetAlerteRelais(points, urgences);
    // Les adresses en parallèle, chaque appel borné au temps restant avant la fin des envois : le délai d'un service lent
    // ne s'additionne pas d'une adresse à l'autre, et le résultat est consigné avant la coupure de la route.
    const restant = finDesEnvois - horloge();
    if (restant < Math.min(DELAI_APPEL_MIN_MS, delaiAppel)) return await terminer("echec", 0, constat);
    const delai = Math.min(delaiAppel, restant);
    const resultats = await Promise.all(adresses.valides.map((to) =>
      // Aucun `avantEnvoi` : l'arrêt d'urgence ne retient pas cette alerte (voir l'en-tête).
      envoyer({ to, subject: sujet, html, cleIdempotence: cleEnvoi(jour, to), delaiMaxMs: delai })
        .catch(() => ({ erreur: "envoi interrompu" }))
    ));
    const envoyes = resultats.filter((resultat) => !resultat.erreur).length;
    if (envoyes < adresses.valides.length) console.error("[relais] Un envoi de l’alerte n’a pas abouti.");
    const statut = envoyes === adresses.valides.length ? "envoye" : envoyes === 0 ? "echec" : "envoi_partiel";
    // Parti vers toutes les adresses : les urgences qu'il rappelle alors qu'elles attendaient encore leur e-mail immédiat
    // (plafond atteint) ne repartiront pas en e-mail immédiat. Une erreur ici ne change rien au résultat du passage.
    const reprises = statut === "envoye" ? (constat.urgences?.liste ?? []).filter((u) => u.email === "en_attente").map((u) => u.alerte) : [];
    if (reprises.length) {
      const { error } = await appeler("urgences_relais_au_quotidien", { p_alertes: reprises });
      if (error) console.error("[relais] Les urgences reprises par l’e-mail de 5 h n’ont pas pu être marquées.");
    }
    return await terminer(statut, envoyes, constat);
  } catch {
    // La passe reste « en cours » : une reprise est permise au bout de 10 minutes (réservation en base).
    console.error("[relais] Le passage a été interrompu.");
    return { erreur: "Le passage du relais a été interrompu.", status: 500 };
  }
}

