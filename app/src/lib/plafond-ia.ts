// LA GARDE DES APPELS PAYANTS À L'IA (décision X19, fiche SA-10, audit du 13 octobre 2026).
//
// Avant X19, seuls les appels des tâches planifiées (étude de la veille, rédaction et visuel des posts) consultaient
// l'arrêt d'urgence, et aucun appel n'était limité par Gerimmo : la seule limite était celle du compte chez le
// fournisseur. Le brief IA, la rédaction assistée d'un article, la proposition de devis d'un artisan et le lancement de
// l'atelier de corrections partaient même sous un arrêt d'urgence.
//
// Désormais, CHAQUE appel payant appelle `reserverAppelIA` juste avant de partir. La base (reserver_appel_ia,
// migration 20261014730000) consulte l'arrêt d'urgence, puis réserve une place sous la limite quotidienne, comptée au
// jour de Paris, de façon atomique : deux appels simultanés ne la dépassent pas. Refus = l'appel n'a pas lieu.
//
// Une réservation vaut un appel, qu'il réussisse ou non : un appel parti puis en échec a pu être facturé.
// Le vocabulaire des messages évite « plafond » et « crédit » : l'écran Santé lit ces mots dans le journal des tâches
// comme un refus du FOURNISSEUR (crédit épuisé) et demanderait à tort de recharger le compte.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "./controle-effets";
import { ErreurIA } from "./erreur-ia";
import { lireDecimal } from "./saisie-montant";

/** La limite posée par la migration : 50 appels par jour de Paris. Prudente : l'usage normal en fait une dizaine. */
export const PLAFOND_IA_PAR_DEFAUT = 50;
/** La plus haute limite que la base accepte. 0 coupe tous les appels payants à l'IA. */
export const PLAFOND_IA_MAXIMUM = 1000;

/**
 * Chaque appel payant à l'IA de l'application, et la clé d'arrêt d'urgence qui l'arrête EN PLUS de « Tous les
 * traitements contrôlés » (clé « global »), qui les arrête tous. Miroir de `reserver_appel_ia` : un test les compare.
 */
export const USAGES_IA = {
  veille: { libelle: "l’étude des actualités de la veille (tâche planifiée)", arret: "veille" },
  redaction_veille: { libelle: "la rédaction d’un post à partir d’une actualité (tâche planifiée)", arret: "marketing" },
  visuel_marketing: { libelle: "le visuel d’un post (tâche planifiée)", arret: "marketing" },
  article: { libelle: "la rédaction assistée d’un article (console)", arret: "marketing" },
  brief: { libelle: "l’analyse des signaux du brief (console)", arret: null },
  devis: { libelle: "la proposition de devis préparée pour un artisan", arret: null },
  conversation_privee: { libelle: "la conversation privée avec Gerimmo", arret: null },
  lecture_document: { libelle: "la lecture assistée d’une facture ou d’un compteur", arret: null },
  atelier: { libelle: "le lancement de l’atelier de corrections (console)", arret: null },
} as const satisfies Record<string, { libelle: string; arret: string | null }>;
export type UsageIA = keyof typeof USAGES_IA;

/** Ce qui est appelé juste avant un appel payant ; lève si l'appel ne doit pas avoir lieu. */
export type AvantAppelIA = () => Promise<void>;

export const MESSAGE_LIMITE_IA =
  "La limite quotidienne des appels à l’IA, réglée dans « Relais en mon absence », est atteinte : cet appel n’a pas eu lieu. Il pourra être refait demain, ou dès que la limite sera relevée.";
export const MESSAGE_ARRET_IA =
  "Un arrêt d’urgence en cours couvre cet appel à l’IA : il n’a pas eu lieu. Il sera de nouveau possible quand l’arrêt sera levé dans « Relais en mon absence ».";
export const MESSAGE_CONTROLE_IA_INDISPONIBLE =
  "Le contrôle des appels à l’IA est indisponible : par prudence, cet appel n’a pas eu lieu. Réessayez dans un instant.";

/** La limite du jour est atteinte : l'appel n'a pas eu lieu. Une ErreurIA, pour que les écrans de la veille l'affichent. */
export class PlafondIAAtteint extends ErreurIA {
  constructor() {
    super(MESSAGE_LIMITE_IA);
    this.name = "PlafondIAAtteint";
  }
}

/**
 * À appeler immédiatement avant chaque appel payant à l'IA. Rend la main si l'appel peut partir (il est alors compté).
 * Lève `ArretSupervision` sous arrêt d'urgence (ou si le contrôle est illisible : par prudence, aucun appel), et
 * `PlafondIAAtteint` au-delà de la limite du jour.
 */
export async function reserverAppelIA(db: SupabaseClient, usage: UsageIA): Promise<void> {
  let resultat;
  try {
    resultat = await db.rpc("reserver_appel_ia", { p_usage: usage });
  } catch {
    throw new ArretSupervision(MESSAGE_CONTROLE_IA_INDISPONIBLE, "indisponible");
  }
  if (resultat.error) throw new ArretSupervision(MESSAGE_CONTROLE_IA_INDISPONIBLE, "indisponible");
  if (resultat.data === "accorde") return;
  if (resultat.data === "arret") throw new ArretSupervision(MESSAGE_ARRET_IA);
  if (resultat.data === "plafond") throw new PlafondIAAtteint();
  throw new ArretSupervision(MESSAGE_CONTROLE_IA_INDISPONIBLE, "indisponible");
}

/** Le message à montrer quand la garde a empêché l'appel ; `null` pour toute autre erreur. */
export function messageGardeIA(e: unknown): string | null {
  if (e instanceof PlafondIAAtteint || e instanceof ArretSupervision) return e.message;
  return null;
}

/** La limite saisie dans la console : un nombre entier d'appels, de 0 à 1 000 (lecture stricte, jamais `Number()`). */
export function lirePlafondIA(brut: FormDataEntryValue | null): { plafond: number } | { erreur: string } {
  const erreur = `Indiquez un nombre entier d’appels par jour, de 0 à ${PLAFOND_IA_MAXIMUM.toLocaleString("fr-FR")}.`;
  const lu = lireDecimal(brut);
  if ("erreur" in lu || !Number.isInteger(lu.valeur) || lu.valeur < 0 || lu.valeur > PLAFOND_IA_MAXIMUM) return { erreur };
  return { plafond: lu.valeur };
}

/** Réservation d’un compte connecté : la base revérifie son adhésion et limite son usage individuel. */
export async function reserverAppelIAPrive(db: SupabaseClient, orgId: string, usage: "conversation_privee" | "lecture_document"): Promise<void> {
  let resultat;
  try { resultat = await db.rpc("reserver_appel_ia_prive", { p_org: orgId, p_usage: usage }); }
  catch { throw new ErreurIA("L’assistance est momentanément indisponible. Réessayez dans un instant."); }
  if (resultat.error) throw new ErreurIA("L’assistance est indisponible pour cet espace. Rechargez la page avant de réessayer.");
  if (resultat.data === "accorde") return;
  if (resultat.data === "patientez") throw new ErreurIA("Patientez quelques secondes avant une nouvelle demande.");
  if (resultat.data === "limite_compte") throw new ErreurIA("Vous avez atteint la limite de demandes du jour. Vous pourrez reprendre demain.");
  if (resultat.data === "plafond") throw new ErreurIA("L’assistance a atteint sa limite du jour. Réessayez demain.");
  throw new ErreurIA("L’assistance est momentanément indisponible. Aucun appel n’a été effectué.");
}
