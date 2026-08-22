// Conservation des saisies (recette 22/08) — React 19 réinitialise les champs
// non contrôlés d'un <form action> après CHAQUE action, y compris en erreur :
// un refus de validation vidait tout ce que l'utilisateur avait tapé.
// Le remède documenté : l'action renvoie les valeurs soumises, le formulaire
// les repose en defaultValue — le reset retombe alors sur la saisie, pas sur
// du vide. À utiliser dans toute action dont le formulaire doit « tenir ».

export function valeursDuFormulaire(formData: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }
  return valeurs;
}
