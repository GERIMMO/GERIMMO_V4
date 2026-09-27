import Link from "next/link";

// Les réflexes d'urgence de la maquette v10. Ils ne vivaient que sur la page
// « Mes demandes » ; depuis la revue du 11/09, l'entrée de menu et la carte
// « Mon logement » mènent droit au formulaire de déclaration. La consigne
// devait suivre : sans elle, celui qui a une fuite n'a plus l'écran qui lui
// dit de fermer le robinet d'arrêt avant de décrire son problème.
//
// 24/09 : c'est désormais LA carte d'urgence de l'espace (accueil et « Mon
// gestionnaire » avaient une seconde carte, au 112 non souligné). Hors du
// formulaire, « signalez ici » annonçait un lien qui n'existait pas :
// `hrefSignalement` en fait un vrai lien. Sur /incident, sans la prop, « ici »
// désigne la page elle-même.
// 27/09 (audit propriétaire et locataire) :
//  - les deux numéros sont des BOUTONS d'appel de 44 px : ce sont les cibles
//    les plus critiques de l'espace, et elles mesuraient 96×17 et 20×17 px ;
//  - « votre gestionnaire est prévenu immédiatement » était faux pour un
//    signalement ordinaire : l'e-mail ne part que pour une urgence déclarée
//    comme telle (« Est-ce urgent ? » → oui).
export function ReflexesUrgence({ hrefSignalement }: { hrefSignalement?: string } = {}) {
  const suite =
    " — répondez « oui » à « Est-ce urgent ? » : votre gestionnaire est alors prévenu par e-mail.";
  return (
    <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
      <h3 className="text-base font-medium">En cas d&apos;urgence</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Fuite importante : fermez d&apos;abord le robinet d&apos;arrêt d&apos;eau.
        Odeur de gaz : aérez, ne touchez aucun interrupteur, appelez Urgence
        Sécurité Gaz. Danger pour les personnes : appelez le 112.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {/* Espaces insécables : dans la colonne de 300 px, le numéro se
            coupait après le « 0 ». */}
        <a
          href="tel:0800473333"
          className="inline-flex min-h-11 items-center rounded-md border border-destructive px-3 text-sm font-medium whitespace-nowrap text-destructive"
          aria-label="Appeler Urgence Sécurité Gaz, 0 800 47 33 33"
        >
          Gaz&nbsp;: 0&nbsp;800&nbsp;47&nbsp;33&nbsp;33
        </a>
        <a
          href="tel:112"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-destructive px-3 text-sm font-medium text-destructive"
          aria-label="Appeler le 112, numéro d'urgence européen"
        >
          Appeler le 112
        </a>
      </div>
      <p className="mt-2.5 text-sm text-muted-foreground">
        {hrefSignalement ? (
          <>
            Puis{" "}
            <Link
              href={hrefSignalement}
              className="inline-flex min-h-11 items-center font-medium text-[var(--bleu)] underline underline-offset-2"
            >
              signalez-le ici
            </Link>
            {suite}
          </>
        ) : (
          `Puis signalez-le ici${suite}`
        )}
      </p>
    </div>
  );
}
