// Squelette de la console d'administration — même gabarit que celui de
// l'espace agence : sans lui, un clic dans la barre resterait figé jusqu'à la
// réponse du serveur. La barre et l'en-tête (layout) restent en place.
export default function ChargementAdmin() {
  return (
    <main
      className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7"
      aria-busy="true"
      aria-label="Chargement de la page"
    >
      <p role="status" className="mb-4 text-sm text-muted-foreground">Chargement de la page…</p>
      <div className="entete-page mb-6">
        <div>
          <div aria-hidden="true" className="squelette h-3.5 w-44" />
          <div aria-hidden="true" className="squelette mt-3 h-8 w-64" />
        </div>
        <div aria-hidden="true" className="squelette h-9 w-36" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden="true" className="squelette h-28" />
        ))}
      </div>
      <div className="mt-5 border border-border bg-card p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3">
            <div aria-hidden="true" className="squelette h-4 w-1/2" />
            <div aria-hidden="true" className="squelette h-4 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
