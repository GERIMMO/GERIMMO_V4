// Les réflexes d'urgence de la maquette v10. Ils ne vivaient que sur la page
// « Mes demandes » ; depuis la revue du 11/09, l'entrée de menu et la carte
// « Mon logement » mènent droit au formulaire de déclaration. La consigne
// devait suivre : sans elle, celui qui a une fuite n'a plus l'écran qui lui
// dit de fermer le robinet d'arrêt avant de décrire son problème.
export function ReflexesUrgence() {
  return (
    <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
      <h3 className="text-base font-medium">En cas d&apos;urgence</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Fuite importante : fermez d&apos;abord le robinet d&apos;arrêt d&apos;eau.
        Odeur de gaz : aérez, ne touchez aucun interrupteur, appelez Urgence
        Sécurité Gaz au 0 800 47 33 33. Danger pour les personnes : le 112.
        Puis signalez ici — votre gestionnaire est prévenu immédiatement.
      </p>
    </div>
  );
}
