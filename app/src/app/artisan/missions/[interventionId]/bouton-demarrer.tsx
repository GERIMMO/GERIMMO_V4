"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  demarrerMonIntervention,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { CLASSE_BOUTON_PRINCIPAL, CLASSE_BOUTON_SOBRE, Erreur } from "../../ui";

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
}: {
  interventionId: string;
  sansRendezVous?: boolean;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    demarrerMonIntervention.bind(null, interventionId),
    {}
  );

  return (
    <form action={action} className="space-y-2">
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
      <Bouton className={sansRendezVous ? CLASSE_BOUTON_SOBRE : CLASSE_BOUTON_PRINCIPAL} />
      {sansRendezVous && (
        <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
          Si vous intervenez sans attendre le rendez-vous.
        </p>
      )}
    </form>
  );
}
