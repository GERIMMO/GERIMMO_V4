"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ActualisationAuto() {
  const routeur = useRouter();
  const [attente, demarrer] = useTransition();
  const [derniere, setDerniere] = useState(() => new Date());
  const actualiser = () => demarrer(() => { routeur.refresh(); setDerniere(new Date()); });
  useEffect(() => { const minuterie = window.setInterval(actualiser, 60_000); return () => window.clearInterval(minuterie); });
  return <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--texte-secondaire)]"><span>Mis à jour à {derniere.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span><button type="button" onClick={actualiser} disabled={attente} className="lien-discret">{attente ? "Actualisation…" : "Actualiser"}</button></div>;
}
