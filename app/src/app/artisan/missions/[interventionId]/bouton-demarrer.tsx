"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  demarrerMonIntervention,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { CLASSE_AIDE, CLASSE_BOUTON_PRINCIPAL, CLASSE_BOUTON_SOBRE, Erreur } from "../../ui";

// « Je suis sur place » : le geste qui ouvre le compte rendu. La base accepte
// le démarrage depuis « acceptée » comme depuis « planifiée » — un dépannage
// urgent se fait parfois avant qu'un créneau ait été calé. On le propose donc
// aussi sans rendez-vous, mais en second rôle : le chemin normal reste de
// caler le rendez-vous d'abord.
function Bouton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Démarrage…" : "Je démarre l'intervention"}
    </button>
  );
}

export function BoutonDemarrer({
  interventionId,
  sansRendezVous = false,
  discret = false,
}: {
  interventionId: string;
  sansRendezVous?: boolean;
  /** En lien texte, quand l'écran dit déjà qu'il n'y a rien à faire (25/09, A10). */
  discret?: boolean;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    demarrerMonIntervention.bind(null, interventionId),
    {}
  );

  if (discret) {
    return (
      <form action={action} className="inline">
        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
        <Bouton className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4 disabled:opacity-60" />
      </form>
    );
  }
  return (
    <form action={action} className="space-y-2">
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
      <Bouton className={sansRendezVous ? CLASSE_BOUTON_SOBRE : CLASSE_BOUTON_PRINCIPAL} />
      {sansRendezVous && (
        <p className={CLASSE_AIDE}>
          Si vous intervenez sans attendre le rendez-vous.
        </p>
      )}
    </form>
  );
}
