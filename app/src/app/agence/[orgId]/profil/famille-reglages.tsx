import type { ReactNode } from "react";

// Les quatre écrans de compte de l'espace — administration, profil, abonnement,
// questions fréquentes — étaient quatre pages isolées (relevé du 11/09) : deux
// primitives de carte incompatibles, trois niveaux de titre, aucun en-tête
// commun, et deux façons de dire le statut d'une organisation. Ce module leur
// donne ce qui en fait une FAMILLE : un en-tête, un encadré d'échec de lecture,
// une seule lecture du statut. Les pages, elles, gardent .loc-carte + h3.
//
// Sa place serait src/components ; cette couche est transverse et gelée pour ce
// chantier — le module vit donc dans la zone, au plus près de ses usages.

// En-tête commun : titre de page, mention mono à droite (l'organisation où l'on
// se trouve — la barre haute du propriétaire ne la nomme pas), et une phrase
// qui dit à quoi sert l'écran, à la mesure de lecture.
export function EnteteReglages({
  titre,
  mention,
  children,
}: {
  titre: string;
  mention?: string;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-2">
      <div className="entete-page">
        <h1>{titre}</h1>
        {mention && (
          <span className="mono-discret sans-majuscules">{mention}</span>
        )}
      </div>
      {children && (
        <p className="mesure-lecture text-sm text-muted-foreground">{children}</p>
      )}
    </header>
  );
}

// L'échec le plus répandu du produit est celui qui ressemble à du vide : une
// lecture qui échoue retombe sur `?? []`, et l'écran affiche une agence sans
// membre, un parc sans bien — vide et rassurant. Cet encadré dit l'inverse :
// la donnée existe, c'est la lecture qui n'a pas abouti.
export function EncadreLectureImpossible({
  titre = "Lecture impossible",
  children,
}: {
  titre?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="border-l-[3px] border-l-destructive bg-destructive-soft p-3"
    >
      <p className="text-sm font-medium text-destructive-soft-foreground">
        {titre}
      </p>
      <p className="mt-1 text-sm text-destructive-soft-foreground">{children}</p>
    </div>
  );
}

// Statut de l'organisation — quatre valeurs en base (essai, active, suspendue,
// archivee). L'abonnement n'en lisait que deux et repeignait en vert « actif »
// une organisation SUSPENDUE ou ARCHIVÉE : l'écran mentait sur l'état du compte
// de celui qui le regardait. Une seule lecture, rendue avec la puce de la
// charte (l'écran d'administration en avait sa propre copie, en .loc-tag).
const STATUTS: Record<string, { libelle: string; puce: string }> = {
  essai: { libelle: "essai gratuit", puce: "puce-prep" },
  active: { libelle: "active", puce: "puce-loue" },
  suspendue: { libelle: "suspendue", puce: "puce-rouge" },
  archivee: { libelle: "archivée", puce: "puce-grise" },
};

export function statutOrganisation(status: string): {
  libelle: string;
  puce: string;
} {
  return STATUTS[status] ?? { libelle: status, puce: "puce-grise" };
}
