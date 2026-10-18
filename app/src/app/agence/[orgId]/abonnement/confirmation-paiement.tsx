"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";

/** Le retour du navigateur peut précéder le webhook : seule la base confirme les droits. */
export function ConfirmationPaiement({ confirme }: { confirme: boolean }) {
  const router = useRouter();
  const [attenteLongue, setAttenteLongue] = useState(false);

  useEffect(() => {
    if (confirme) return;
    let lectures = 0;
    const minuterie = window.setInterval(() => {
      lectures += 1;
      router.refresh();
      if (lectures >= 15) {
        window.clearInterval(minuterie);
        setAttenteLongue(true);
      }
    }, 3000);
    return () => window.clearInterval(minuterie);
  }, [confirme, router]);

  return (
    <div role="status" className={`loc-carte border-l-4 ${confirme ? "border-l-[var(--success)]" : "border-l-[var(--or-texte)]"}`}>
      <div className="flex items-start gap-3">
        {confirme ? <CheckCircle2 size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--success)]" />
          : <LoaderCircle size={20} aria-hidden="true" className={`mt-0.5 shrink-0 text-[var(--or-texte)] ${attenteLongue ? "" : "motion-safe:animate-spin"}`} />}
        <p className="mesure-lecture text-sm">
          <b className="font-semibold">{confirme ? "Votre abonnement est confirmé." : "Confirmation de votre abonnement en cours…"}</b>{" "}
          <span className="text-muted-foreground">{confirme
            ? "Votre formule et votre prochaine échéance sont affichées ci-dessous."
            : attenteLongue
              ? "La confirmation prend plus de temps que prévu. Ne recommencez pas le paiement : actualisez son état dans un instant."
              : "Nous attendons la confirmation de Stripe. Cette page se met à jour automatiquement ; vous n’avez rien à refaire."}</span>
        </p>
      </div>
      {!confirme && attenteLongue && <button type="button" className="btn-secondaire mt-3" onClick={() => router.refresh()}>Actualiser l’état</button>}
    </div>
  );
}
