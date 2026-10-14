"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Le message d'erreur d'un formulaire d'authentification, annoncé ET atteint.
 *
 * Relevé du 13/10/2026 (DES-A-12) : après « Identifiants invalides. » ou « Les deux saisies ne correspondent pas. »,
 * `role="alert"` annonçait bien le message, mais le focus retombait sur <body> : un clavier ou une loupe d'écran
 * repartait du haut de la page, loin du message et du bouton. L'alerte reçoit donc le focus (`tabIndex={-1}` : atteinte
 * par le code, pas par la touche Tab) dès qu'elle apparaît.
 *
 * `signal` change à chaque échec (l'objet d'état d'une action serveur, par exemple) : un second refus avec le MÊME
 * texte ramène aussi le focus, alors que l'alerte était restée affichée.
 */
export function AlerteFormulaire({
  children,
  signal,
  className = "text-sm text-destructive",
}: {
  children: ReactNode;
  signal?: unknown;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [signal]);
  return (
    <p ref={ref} role="alert" tabIndex={-1} className={className}>
      {children}
    </p>
  );
}
