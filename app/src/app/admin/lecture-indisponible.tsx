/** Une erreur de lecture n'est ni une absence de données ni une fiche supprimée. */
export function LectureIndisponible({ sujet, retour }: { sujet: string; retour: string }) {
  return <div role="alert" className="my-3 rounded-[var(--rayon-bouton)] border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning-soft-foreground)]">
    <p><strong>{sujet} : lecture indisponible.</strong> Les informations n’ont pas pu être vérifiées.</p>
    <a href={retour} className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Réessayer</a>
  </div>;
}
