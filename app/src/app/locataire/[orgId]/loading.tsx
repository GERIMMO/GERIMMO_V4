// Squelette de l'espace locataire (recette 24/08 : fluidité de navigation) —
// même rôle que celui de l'espace agence : le bandeau reste, le contenu
// s'annonce au lieu d'un écran figé.
export default function ChargementLocataire() {
  return (
    <main
      className="mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7"
      aria-busy="true"
      aria-label="Chargement de la page"
    >
      <div>
        <div className="squelette h-3.5 w-40" />
        <div className="squelette mt-3 h-8 w-60" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="squelette h-40" />
        <div className="squelette h-40" />
      </div>
      <div className="border border-border bg-card p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3">
            <div className="squelette h-4 w-1/2" />
            <div className="squelette h-4 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
