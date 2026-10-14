"use client";

import { useEffect, useState } from "react";
import { cleLiberee, nouvelleCleEnvoi } from "@/lib/cle-envoi";

/**
 * Le champ caché `cle_envoi` d'un formulaire d'encaissement (D05, PR178-B-06).
 *
 * LA CLÉ EST PRODUITE UNE FOIS PAR INSTANCE DE FORMULAIRE et rejouée telle quelle à chaque nouvel envoi du même
 * formulaire : après une réponse perdue, le second clic envoie la même clé, la base la reconnaît et l'écran dit
 * « déjà enregistré » au lieu de doubler l'écriture, le reçu et la quittance.
 *
 * Elle ne change qu'APRÈS UN SUCCÈS CONFIRMÉ par le serveur (y compris « déjà enregistré ») : l'encaissement suivant,
 * saisi dans le même formulaire, est un autre envoi. Un refus de validation, une demande de confirmation ou une réponse
 * perdue la laissent en place.
 *
 * Elle est tirée dans le navigateur, après l'affichage : tirée au rendu, elle différerait entre le HTML du serveur et
 * celui du navigateur, et le champ garderait la valeur du serveur. Avant ce tirage le champ est vide, et l'action
 * refuse un envoi sans clé (« Rechargez la page ») au lieu d'encaisser sans protection.
 */
export function CleEnvoi({ etat }: { etat: { succes?: string; erreur?: string } }) {
  const [cle, setCle] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tirage aléatoire : impossible au rendu serveur
    setCle(nouvelleCleEnvoi());
  }, []);

  useEffect(() => {
    // Un succès confirmé par le serveur libère la clé ; tout le reste la garde.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réaction à la réponse du serveur, tirage aléatoire
    if (cleLiberee(etat)) setCle(nouvelleCleEnvoi());
  }, [etat]);

  return <input type="hidden" name="cle_envoi" value={cle} data-cle-envoi />;
}
