"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AIDE_BOUTON_EN_ATTENTE, useHydrate } from "@/lib/use-hydrate";
import { cn } from "@/lib/utils";

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
//
// PAS D'ANIMATION D'OPACITÉ. Le bouton de base transitionne « toutes » ses
// propriétés (transition-all) : le passage de « grisé » à « actif » de
// l'hydratation lançait alors une transition d'opacité de 150 ms sur chaque
// bouton d'envoi. Sur une page longue (supervision, /admin/relais), ceux qui
// sont hors écran ne reçoivent aucune image du navigateur : la transition
// restait « en cours » et l'attente de rendu stable du parcours
// d'accessibilité échouait (constaté au navigateur, base verte, lot rouge).
// L'activation est donc instantanée ; le survol et la pression gardent leur
// transition (couleurs, filet, ombre, léger enfoncement).
const TRANSITION_SANS_OPACITE = "transition-[color,background-color,border-color,box-shadow,transform]";

export function BoutonEnvoi({
  enCoursTexte,
  enCours,
  disabled,
  envoiNatif = false,
  title,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { enCoursTexte?: string; enCours?: boolean; envoiNatif?: boolean }) {
  const statut = useFormStatus();
  const pret = useHydrate() || envoiNatif;
  const pending = enCours ?? statut.pending;
  return (
    <Button
      type="submit"
      disabled={pending || disabled || !pret}
      title={pret ? title : (title ?? AIDE_BOUTON_EN_ATTENTE)}
      className={cn(TRANSITION_SANS_OPACITE, className)}
      {...props}
    >
      {pending && <Spinner />}
      {pending && enCoursTexte ? enCoursTexte : children}
    </Button>
  );
}
