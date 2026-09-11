// Squelette de l'espace locataire (recette 24/08 : fluidité de navigation) —
// le bandeau reste, le contenu s'annonce au lieu d'un écran figé.
//
// Il est rendu DANS <main class="loc-corps">, qui pose déjà sa gouttière et sa
// mesure : le p-4 sm:p-7 max-w-6xl qu'il portait doublait l'un et contredisait
// l'autre. Il reprend maintenant la forme de l'accueil — héros, trois tuiles,
// colonne de droite — et le rayon 14 px des cartes de la zone (le ! est requis,
// .squelette étant du CSS hors layer).
export default function ChargementLocataire() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Chargement de la page">
      <div>
        <div className="squelette h-3.5 w-40" />
        <div className="squelette mt-2.5 h-8 w-60" />
      </div>
      <div className="squelette h-[132px] w-full !rounded-[14px]" />
      <div className="loc-grille">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="squelette h-[150px] !rounded-[14px]" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="squelette h-[158px] !rounded-[14px]" />
          <div className="squelette h-[132px] !rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}
