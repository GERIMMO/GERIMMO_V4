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
export function ReflexesUrgence({ hrefSignalement }: { hrefSignalement?: string } = {}) {
  return (
    <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
      <h3 className="text-base font-medium">En cas d&apos;urgence</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Fuite importante : fermez d&apos;abord le robinet d&apos;arrêt d&apos;eau.
        Odeur de gaz : aérez, ne touchez aucun interrupteur, appelez Urgence
        Sécurité Gaz au{" "}
        {/* Espaces insécables : dans la colonne de 300 px, le numéro se
            coupait après le « 0 ». */}
        <a
          href="tel:0800473333"
          className="whitespace-nowrap font-medium text-destructive underline underline-offset-2"
        >
          0 800 47 33 33
        </a>
        . Danger pour les personnes : le{" "}
        <a href="tel:112" className="font-medium text-destructive underline underline-offset-2">
          112
        </a>
        .{" "}
        {hrefSignalement ? (
          <>
            Puis{" "}
            <Link
              href={hrefSignalement}
              className="font-medium text-[var(--bleu)] underline underline-offset-2"
            >
              signalez-le ici
            </Link>{" "}
            — votre gestionnaire est prévenu immédiatement.
          </>
        ) : (
          "Puis signalez ici — votre gestionnaire est prévenu immédiatement."
        )}
      </p>
    </div>
  );
}
