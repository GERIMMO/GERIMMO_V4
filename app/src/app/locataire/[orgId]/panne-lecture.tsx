// Une lecture qui échoue ne doit JAMAIS ressembler à un espace vide.
//
// Relevé du 11/09 : partout dans le produit, le champ `error` des lectures
// Supabase n'était pas consulté et tout retombait sur un `?? []` silencieux.
// Dans l'espace locataire c'est le pire des cas : le locataire y vient pour se
// rassurer. Une requête tombée lui montrait un logement sans bail, des
// quittances jamais émises, une assurance « jamais déposée » — et le grondait
// même pour une pièce qu'il avait bel et bien fournie.
//
// Ces deux blocs disent la différence : « il n'y a rien » n'est pas « je n'ai
// pas pu lire ». Ils s'appuient sur .err (le seul encadré destructive-soft de
// la charte) et sur les jetons — aucune couleur en dur.

/** Vrai dès qu'une des lectures passées a échoué. */
export function aEchoue(...erreurs: unknown[]): boolean {
  return erreurs.some((e) => e != null);
}

/**
 * Bandeau de tête de page.
 * @param quoi groupe nominal au singulier ou au pluriel : « vos documents ».
 */
export function PanneLecture({ quoi }: { quoi: string }) {
  return (
    <div className="err !mb-0" role="alert">
      <b className="font-semibold">Impossible d&apos;afficher {quoi}.</b> Ce
      n&apos;est pas que vous n&apos;avez rien : la connexion à votre espace a
      échoué. Rechargez la page dans un instant — si cela dure, prévenez votre
      gestionnaire.
    </div>
  );
}

/**
 * Même message, à la place d'un état vide, à l'intérieur d'une carte.
 * @param quoi groupe nominal : « vos quittances », « votre bail ».
 */
export function LectureImpossible({ quoi }: { quoi: string }) {
  return (
    <p className="text-sm text-destructive-soft-foreground" role="alert">
      Impossible d&apos;afficher {quoi} : la connexion a échoué. Cet espace
      n&apos;est pas vide — réessayez dans un instant.
    </p>
  );
}
