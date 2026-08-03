"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

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
}: {
  name: string;
  id?: string;
  className?: string;
  required?: boolean;
}) {
  const [valeur, setValeur] = useState("");

  useEffect(() => {
    setValeur((v) =>
      v || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
    );
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
