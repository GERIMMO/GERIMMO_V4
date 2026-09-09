"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Bouton de soumission commun (recette Tahir 09/09) : posé dans un
// <form action={…}>, il se désactive et affiche la roue pendant l'envoi —
// useFormStatus lit le pending du formulaire englobant, aucun fil d'état à
// tirer dans chaque formulaire. `enCoursTexte` remplace le libellé pendant
// l'envoi (« Enregistrement… ») ; sans lui, le libellé reste et la roue
// suffit.
export function BoutonEnvoi({
  enCoursTexte,
  disabled,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { enCoursTexte?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Spinner />}
      {pending && enCoursTexte ? enCoursTexte : children}
    </Button>
  );
}
