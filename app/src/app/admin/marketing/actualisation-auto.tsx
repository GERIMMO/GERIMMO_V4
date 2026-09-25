"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formaterHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";

export function ActualisationAuto({ actualiseLe }: { actualiseLe: string }) {
  const routeur = useRouter();
  const [attente, demarrer] = useTransition();
  const actualiser = useCallback(() => demarrer(() => { routeur.refresh(); }), [routeur, demarrer]);
  useEffect(() => { const minuterie = window.setInterval(actualiser, 60_000); return () => window.clearInterval(minuterie); }, [actualiser]);
  // L'heure vient du dernier rendu serveur, y compris après actualisation.
  // Le fuseau explicite évite un affichage différent au chargement du
  // navigateur ; la mention vaut pour toutes les heures de la page (25/09).
  return <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--texte-secondaire)]"><span>Mis à jour à <time dateTime={actualiseLe}>{formaterHeureParis(actualiseLe)}</time> · {NOTE_FUSEAU}</span><button type="button" onClick={actualiser} disabled={attente} className="lien-discret">{attente ? "Actualisation…" : "Actualiser"}</button></div>;
}
