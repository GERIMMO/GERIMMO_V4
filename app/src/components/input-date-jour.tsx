"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { aujourdhuiParis } from "@/lib/ged";

// Champ date d'un événement qui vient d'avoir lieu (encaissement, réception
// d'un appel, remise des clés, envoi d'une relance…) : pré-rempli à
// aujourd'hui. L'agent corrige si la date est autre, mais le cas courant ne
// demande plus aucune saisie.
//
// La date est posée APRÈS l'hydratation : calculée au rendu serveur, elle
// provoquerait une divergence serveur/client si minuit tombe entre les deux.
export function InputDateJour({
  name,
  id,
  className,
  required,
  valeurSoumise,
}: {
  name: string;
  id?: string;
  className?: string;
  required?: boolean;
  // Date renvoyée par une action REFUSÉE (lib/formulaires.ts). Elle prime sur
  // « aujourd'hui » : sans elle, le champ repart vide et la base date
  // l'encaissement du jour (encaissements.date_paiement vaut CURRENT_DATE par
  // défaut). Une date ressaisie de mémoire est une date fausse, alors que « la
  // banque fait foi sur les montants et les dates » (RM-A6.7).
  valeurSoumise?: string;
}) {
  const [valeur, setValeur] = useState(valeurSoumise ?? "");
  const [derniereSoumise, setDerniereSoumise] = useState(valeurSoumise);

  // Reposer la saisie refusée pendant le rendu, pas dans un effet : le champ ne
  // doit jamais s'afficher vide, même une image, avant de se remplir.
  if (valeurSoumise !== undefined && valeurSoumise !== derniereSoumise) {
    setDerniereSoumise(valeurSoumise);
    setValeur(valeurSoumise);
  }

  useEffect(() => {
    // Différé d'un tick : poser l'état dans le corps de l'effet déclenche un
    // rendu en cascade (même motif que le dépôt de diagnostic).
    const minuterie = setTimeout(() => {
      setValeur((v) =>
        v || aujourdhuiParis()
      );
    }, 0);
    return () => clearTimeout(minuterie);
  }, []);

  return (
    <Input
      id={id}
      name={name}
      type="date"
      required={required}
      className={className}
      value={valeur}
      onChange={(e) => setValeur(e.target.value)}
    />
  );
}
