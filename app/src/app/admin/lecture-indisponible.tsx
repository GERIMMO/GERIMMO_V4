/** Une erreur de lecture n'est ni une absence de données ni une fiche supprimée. */
export function LectureIndisponible({ sujet, retour }: { sujet: string; retour: string }) {
  return <div role="alert" className="my-3 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning-soft-foreground)]">
    <p><strong>{sujet} : lecture indisponible.</strong> Les informations n’ont pas pu être vérifiées.</p>
    <a href={retour} className="mt-2 inline-flex min-h-9 items-center font-semibold underline">Réessayer</a>
  </div>;
}
