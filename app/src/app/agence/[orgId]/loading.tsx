// Squelette de l'espace agence (recette 24/08 : fluidité de navigation).
// Toutes les pages de l'espace sont dynamiques : sans lui, un clic d'onglet
// resterait figé jusqu'à la réponse du serveur. Le bandeau et les onglets
// (layout) restent en place ; ce gabarit neutre — en-tête, rangée de tuiles,
// carte à rangs — évoque n'importe lequel des écrans le temps qu'il arrive.
export default function ChargementAgence() {
  return (
    <main
      className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7"
      aria-busy="true"
      aria-label="Chargement de la page"
    >
      <div className="entete-page mb-6">
        <div>
          <div className="squelette h-3.5 w-44" />
          <div className="squelette mt-3 h-8 w-64" />
        </div>
        <div className="squelette h-9 w-36" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="squelette h-28" />
        ))}
      </div>
      <div className="mt-5 border border-border bg-card p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3">
            <div className="squelette h-4 w-1/2" />
            <div className="squelette h-4 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
