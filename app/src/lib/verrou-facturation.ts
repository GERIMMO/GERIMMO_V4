import "server-only";
import { randomUUID } from "node:crypto";
import { protegerClientAutomatique } from "@/lib/client-automatique";
import { EcritureStripeHorsDelai } from "@/lib/stripe";

// UN GESTE DE FACTURATION À LA FOIS PAR ORGANISATION (défaut A02, relecture adverse du 23/10/2026).
//
// Une hausse libère l'échéancier Stripe (baisse ou périodicité programmée), applique la hausse, et — si la carte est
// refusée — recrée l'échéancier qu'elle avait retiré. Deux onglets qui confirmaient la même hausse se croisaient : le
// second « restaurait » l'ancien échéancier par-dessus la hausse que le premier venait de faire payer. Une demande de
// périodicité ou une résiliation, qui libèrent aussi l'échéancier, faisaient de même ; la tâche de nuit, qui le réécrit
// (seconde relecture), aussi. Ces gestes prennent désormais un verrou en base (`verrou_facturation_prendre`, migration
// 20261023162446) : le second est refusé, avec une phrase qui le dit, au lieu de défaire le premier.
//
// Le verrou est un BAIL : une fonction coupée net ne bloque pas l'organisation au-delà de DUREE_VERROU_FACTURATION_SECONDES.
// Seconde relecture adverse du 23/10 : le bail (120 s) pouvait expirer avant la fin du geste qu'il protège (un appel à
// Stripe pouvait durer 240 s), et un second onglet le reprenait pendant que la première hausse tournait encore. Le bail
// dépasse désormais chacune des bornes du geste (tests/verrou-facturation.test.ts) :
//  - la durée maximale de la fonction qui l'exécute (`maxDuration` de la page « Mon abonnement », dont les actions
//    serveur héritent, et de la route de la tâche de nuit) : l'hébergeur la coupe avant que le bail n'expire ;
//  - quel que soit l'hébergeur, le délai d'écriture : le client Stripe rendu par `proteger` refuse, SANS l'envoyer, toute
//    écriture demandée plus de DELAI_ECRITURES_SOUS_VERROU_SECONDES après la prise du verrou. Un appel est lui-même
//    borné (DELAI_APPEL_STRIPE_MS, deux nouvelles tentatives) : la dernière écriture lancée finit avant le bail.

/** Durée du bail : au-delà de toutes les bornes du geste (voir plus haut), assez courte pour qu'une coupure ne bloque pas longtemps. */
export const DUREE_VERROU_FACTURATION_SECONDES = 360;
/** Après ce délai (compté depuis la demande du verrou), plus aucune écriture chez Stripe n'est lancée sous ce verrou. */
export const DELAI_ECRITURES_SOUS_VERROU_SECONDES = 150;

export type OperationFacturation = "hausse" | "periodicite" | "resiliation" | "echeance";

export const MODIFICATION_EN_COURS =
  "Une autre modification de votre abonnement est en cours (autre onglet ?) : rien n'a été modifié. Réessayez dans quelques secondes.";
export const VERROU_INDISPONIBLE =
  "La modification de votre abonnement n'a pas pu être préparée : rien n'a été modifié. Réessayez dans un instant.";

type ClientRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type VerrouFacturation =
  | {
      ok: true;
      rendre: () => Promise<void>;
      /** Le client Stripe à employer sous ce verrou : ses écritures sont refusées une fois le délai d'écriture passé. */
      proteger: <T extends object>(client: T) => T;
    }
  | { ok: false; motif: "tenu" | "indisponible"; erreur: string };

/**
 * Prendre le verrou des gestes de facturation de l'organisation. À n'appeler qu'APRÈS la vérification des droits du
 * responsable (les fonctions SQL sont réservées à la clé de service). Le détenteur le rend dans tous les cas
 * (`finally`) ; un échec du rendu ne fait que laisser expirer le bail.
 */
export async function prendreVerrouFacturation(
  service: ClientRpc | null,
  org: string,
  operation: OperationFacturation
): Promise<VerrouFacturation> {
  if (!service) return { ok: false, motif: "indisponible", erreur: VERROU_INDISPONIBLE };
  const jeton = randomUUID();
  // Compté AVANT la demande : le bail, posé par la base au moment de l'insertion, commence après.
  const limiteEcritures = Date.now() + DELAI_ECRITURES_SOUS_VERROU_SECONDES * 1000;
  const { data, error } = await service.rpc("verrou_facturation_prendre", {
    p_org: org,
    p_jeton: jeton,
    p_operation: operation,
    p_duree_secondes: DUREE_VERROU_FACTURATION_SECONDES,
  });
  if (error) {
    console.error("[facturation] verrou non pris :", operation, error.message.slice(0, 200));
    return { ok: false, motif: "indisponible", erreur: VERROU_INDISPONIBLE };
  }
  if (data !== true) return { ok: false, motif: "tenu", erreur: MODIFICATION_EN_COURS };
  return {
    ok: true,
    rendre: async () => {
      try {
        const { error: e } = await service.rpc("verrou_facturation_rendre", { p_org: org, p_jeton: jeton });
        if (e) console.error("[facturation] verrou non rendu (il expirera) :", operation, e.message.slice(0, 200));
      } catch (e) {
        console.error("[facturation] verrou non rendu (il expirera) :", operation, e instanceof Error ? e.message.slice(0, 200) : "");
      }
    },
    proteger: (client) =>
      protegerClientAutomatique(client, async () => {
        if (Date.now() > limiteEcritures) {
          console.error("[facturation] écriture Stripe refusée : délai d'écriture du verrou dépassé :", operation);
          throw new EcritureStripeHorsDelai();
        }
      }),
  };
}
