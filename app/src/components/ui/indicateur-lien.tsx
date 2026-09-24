"use client";

import { useLinkStatus } from "next/link";

// Retour immédiat au clic sur un lien (recette 24/08 : « rien ne se passe
// tant qu'on n'a pas la réponse »). À poser DANS un <Link> — le hook lit le
// Link ancêtre. Espace réservé pour éviter tout décalage ; le CSS retarde
// l'apparition (~150 ms) pour que les navigations instantanées ne clignotent
// pas. Une forme : un anneau qui tourne, dans la couleur du texte.
export function IndicateurLien({
  variante = "rond",
  className,
}: {
  variante?: "rond";
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`indic-lien indic-${variante}${pending ? " attente" : ""}${className ? ` ${className}` : ""}`}
    />
  );
}
