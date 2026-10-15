// L'E-MAIL IMMÉDIAT DES URGENCES DU RELAIS (D46-B, décision du dirigeant du 15/10/2026) — l'envoi.
//
// La file vit en base (migration 20261014811000) : chaque alerte interne nouvelle du mode vacances y entre « à envoyer »,
// par déclencheur, dans la transaction qui la pose — sans rien attendre et sans pouvoir la faire échouer. Ce module la
// vide. Il est appelé JUSTE APRÈS chaque endroit qui peut poser une urgence, une fois cette transaction validée :
//  · chaque passage de mission (/api/cron/equipes → `executerMission`, après `traiter_vacances`), y compris les appels
//    de la mission marketing par pg_cron (toutes les 5 minutes de 05 h à 19 h UTC, quand une publication est due) et
//    « Lancer maintenant » de l'écran Santé ;
//  · le passage de 5 h (/api/cron/relais, après `traiter_vacances`) ;
//  · les deux gestes de la console qui en posent (« Actualiser », « Signaler une urgence interne »), après la réponse.
// Aucune tâche planifiée n'est ajoutée : une urgence ne naît que dans l'un de ces passages, l'e-mail part du même.
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
import { envoyerEmail } from "./email";
import { adresseDuSite } from "./site";
import { adressesRelaisDuServeur } from "./relais-alerte-reglage";
import type { AdressesRelais } from "./relais-alerte";
import { htmlUrgencesRelais, PLAFOND_URGENCES_PAR_HEURE, sujetUrgencesRelais, type UrgenceEnvoi } from "./relais-urgences";

type Reponse = { data: unknown; error: unknown };
export type ClientUrgences = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<Reponse> };

/** Le compte rendu d'un passage : des nombres et des états, jamais une adresse. */
export type ResultatUrgences = {
  /** Pourquoi le passage s'est arrêté. */
  arret: "non_configure" | "rien" | "plafond" | "echec" | "indisponible" | "tours";
  envois: { urgences: number; destinataires: number; envoyes: number; reprise: boolean; statut: string }[];
  /** Les urgences qui attendent encore (plafond atteint, ou plus de 50 d'un coup). */
  en_attente?: number;
};

const TOURS_MAX = 3;

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

    for (let tour = 0; tour < TOURS_MAX; tour++) {
      const prise = await db.rpc("prendre_urgences_relais", { p_plafond: options.plafond ?? PLAFOND_URGENCES_PAR_HEURE });
      const p = prise.data as Prise | null;
      if (prise.error || !p || typeof p !== "object") return { arret: "indisponible", envois };
      const enAttente = typeof p.en_attente === "number" ? p.en_attente : undefined;
      if (p.pris !== true || typeof p.envoi !== "string") {
        return { arret: p.motif === "plafond" ? "plafond" : "rien", envois, ...(enAttente ? { en_attente: enAttente } : {}) };
      }
      const envoi = p.envoi;
      const urgences = urgencesLues(p.urgences);
      const html = htmlUrgencesRelais(urgences, `${site}/admin`);
      const sujet = sujetUrgencesRelais(urgences.length);
      // Les adresses en parallèle : le délai d'un service lent ne s'additionne pas d'une adresse à l'autre.
      const resultats = await Promise.all(adresses.valides.map((to) =>
        envoyer({ to, subject: sujet, html, cleIdempotence: cleEnvoi(envoi, to), ...(options.delaiMaxMs ? { delaiMaxMs: options.delaiMaxMs } : {}) })
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
