"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AIDE_BOUTON_EN_ATTENTE, useHydrate } from "@/lib/use-hydrate";

// Bouton de soumission commun (recette Tahir 09/09) : posé dans un
// <form action={…}>, il se désactive et affiche la roue pendant l'envoi —
// useFormStatus lit le pending du formulaire englobant, aucun fil d'état à
// tirer dans chaque formulaire. `enCoursTexte` remplace le libellé pendant
// l'envoi (« Enregistrement… ») ; sans lui, le libellé reste et la roue
// suffit.
//
// DÉSACTIVÉ TANT QUE LA PAGE N'EST PAS PRÊTE (décision D30 B, audit du 13/10,
// PR178-B-04). Les formulaires protégés envoient par une fonction du
// navigateur : avant la fin du chargement du script, un clic ne faisait rien,
// sans message. Le bouton est donc inerte dans le HTML du serveur et s'active
// à l'hydratation (lib/use-hydrate.ts) ; sur un réseau normal, c'est
// imperceptible. `envoiNatif` est réservé aux formulaires dont l'action est
// une action serveur passée telle quelle (inscription, mots de passe…) : le
// navigateur sait les envoyer sans script, leur bouton n'attend pas.
export function BoutonEnvoi({
  enCoursTexte,
  enCours,
  disabled,
  envoiNatif = false,
  title,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { enCoursTexte?: string; enCours?: boolean; envoiNatif?: boolean }) {
  const statut = useFormStatus();
  const pret = useHydrate() || envoiNatif;
  const pending = enCours ?? statut.pending;
  return (
    <Button type="submit" disabled={pending || disabled || !pret} title={pret ? title : (title ?? AIDE_BOUTON_EN_ATTENTE)} {...props}>
      {pending && <Spinner />}
      {pending && enCoursTexte ? enCoursTexte : children}
    </Button>
  );
}
