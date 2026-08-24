// Attente racine : couvre l'entrée dans un espace (le layout de l'espace
// interroge la base avant de pouvoir s'afficher) — un rond discret plutôt
// qu'un écran figé qui fait douter du clic (recette 24/08).
export default function Chargement() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3">
      <span className="rond-attente" aria-hidden />
      <p className="text-sm text-muted-foreground">Chargement…</p>
    </div>
  );
}
