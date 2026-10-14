"use client";

import { useEffect, useState } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { eur } from "@/lib/ged";
import { CHAMP_CONFIRMATION_MONTANT, type ConfirmationEncaissement } from "@/lib/garde-encaissement";

/**
 * La demande de confirmation d'un encaissement très supérieur au dû (D04 (2), VER-TS-02).
 *
 * Le serveur n'a RIEN enregistré. Deux gestes : « Oui, encaisser … » ressoumet le formulaire avec le drapeau
 * `confirmation_montant`, qui porte le montant confirmé (un drapeau qui ne porte pas le montant saisi ne confirme
 * rien, côté serveur) ; « Corriger le montant » referme la demande et ramène au champ. Retaper le montant referme
 * aussi la demande : le bouton ne doit jamais annoncer une somme qui n'est plus celle du champ.
 *
 * À poser DANS le `<form>` : le bouton de confirmation est un bouton d'envoi de ce formulaire.
 */
export function ConfirmationEncaissement({
  confirmation,
  idChampMontant,
}: {
  confirmation?: ConfirmationEncaissement;
  /** L'identifiant du champ « Montant » du formulaire, pour y ramener le focus et suivre ses modifications. */
  idChampMontant: string;
}) {
  // La demande refermée est mémorisée par son objet : un nouvel envoi apporte une nouvelle demande, affichée de nouveau.
  const [refermee, setRefermee] = useState<ConfirmationEncaissement | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    const champ = document.getElementById(idChampMontant);
    const refermer = () => setRefermee(confirmation);
    champ?.addEventListener("input", refermer);
    return () => champ?.removeEventListener("input", refermer);
  }, [confirmation, idChampMontant]);

  if (!confirmation || refermee === confirmation) return null;
  return (
    <div role="alert" className="w-full space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
      <p className="font-medium">Vérifiez ce montant avant de l&apos;enregistrer</p>
      <p>{confirmation.message}</p>
      <div className="flex flex-wrap gap-2">
        <BoutonEnvoi
          size="sm"
          variant="outline"
          name={CHAMP_CONFIRMATION_MONTANT}
          value={confirmation.montant.toFixed(2)}
          enCoursTexte="Enregistrement…"
        >
          Oui, encaisser {eur(confirmation.montant)}
        </BoutonEnvoi>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setRefermee(confirmation);
            document.getElementById(idChampMontant)?.focus();
          }}
        >
          Corriger le montant
        </Button>
      </div>
    </div>
  );
}
