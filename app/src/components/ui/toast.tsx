"use client";

import { useEffect, useRef, useState } from "react";

// Toast de confirmation (maquette, recette 24/08) : la pop-up de traitement se
// referme sur le geste abouti et la ligne disparaît de la liste — le toast dit
// ce qui vient de se passer. Le composant qui déclenche est souvent démonté
// dans le MÊME commit React que le succès (la revalidation retire sa ligne) :
// le toast vit donc dans le layout, au-dessus de tout, et s'appelle via
// `afficherToast()` au moment où l'action aboutit.
let auditeur: ((message: string) => void) | null = null;

export function afficherToast(message: string) {
  auditeur?.(message);
}

export function Toasteur() {
  const [toast, setToast] = useState<{ message: string; cle: number } | null>(
    null
  );
  const compteur = useRef(0);
  const minuterie = useRef<number | undefined>(undefined);

  useEffect(() => {
    auditeur = (message) => {
      compteur.current += 1;
      setToast({ message, cle: compteur.current });
    };
    return () => {
      auditeur = null;
    };
  }, []);

  // Fermeture auto à la fin de l'animation CSS (entrée → plateau → sortie)
  useEffect(() => {
    if (!toast) return;
    clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(minuterie.current);
  }, [toast]);

  if (!toast) return null;
  return (
    <div key={toast.cle} className="toast" role="status" aria-live="polite">
      <span aria-hidden>◇</span>
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-base text-[var(--sur-encre)]/70 hover:text-[var(--sur-encre)]"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
