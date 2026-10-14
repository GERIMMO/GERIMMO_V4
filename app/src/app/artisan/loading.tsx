// Squelette de l'espace artisan (audit du 13/10, DES-B-03). Sans lui, sur un
// réseau de chantier (latence de plusieurs secondes), le clic sur un onglet ne
// produisait rien : la page « Aujourd'hui » restait seule à l'écran, l'onglet
// visé éteint, et l'artisan recliquait en croyant son geste perdu.
//
// Posé au niveau du gabarit, ce fichier couvre le segment et tous ses
// enfants : agenda, devis, mission, entreprise, clients externes… Le bandeau
// et la barre d'onglets (layout) restent en place ; seul le contenu s'annonce.
//
// Il est rendu DANS le <main class="artisan-corps"> du gabarit : pas de <main>
// ici (il y en aurait deux), et pas de gouttière propre — le gabarit pose déjà
// la sienne. Rayon 14 px des cartes et ! requis : .squelette est du CSS hors
// layer, comme dans l'espace locataire.
export default function ChargementArtisan() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Chargement de la page">
      <div>
        <div className="squelette h-3.5 w-40" />
        <div className="squelette mt-2.5 h-8 w-60" />
      </div>
      <div className="squelette h-24 w-full !rounded-[14px]" />
      <div className="squelette h-[132px] w-full !rounded-[14px]" />
      <div className="squelette h-[132px] w-full !rounded-[14px]" />
    </div>
  );
}
