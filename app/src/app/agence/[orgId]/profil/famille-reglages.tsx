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
// 24/09 : la mention n'est passée QUE côté propriétaire. Côté agence, la barre
// latérale et la barre haute nomment déjà l'agence : une troisième fois, à
// droite du titre, n'apprenait plus rien à personne.
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

// Statut de l'ABONNEMENT, pas de l'organisation (24/09). La puce lisait
// `organizations.status` : une agence « active » s'y voyait en vert au-dessus
// d'un bouton « S'abonner » — elle n'avait jamais payé. Le libellé ressemblait
// en plus à une valeur brute (« active », minuscule, sans sujet). La puce dit
// désormais où en est le paiement, avec la même priorité que l'écran :
//   - fermé l'emporte sur tout (la pastille doit dire ce que le bandeau dit :
//     une puce verte au-dessus d'un bandeau rouge ferait douter des deux) ;
//   - un prélèvement en échec n'est ni « actif » ni « à souscrire » ;
//   - puis payé, essai, rien à régler, et enfin à souscrire.
// Les pages ne l'appellent que si les lectures ont abouti : sur un échec,
// « À souscrire » serait un mensonge pour qui paie.
export function statutAbonnement({
  paye,
  essai,
  ferme,
  enRetard = false,
  rienAPayer = false,
}: {
  paye: boolean;
  essai: boolean;
  ferme: boolean;
  enRetard?: boolean;
  rienAPayer?: boolean;
}): { libelle: string; puce: string } {
  if (ferme) return { libelle: "Lecture seule", puce: "puce-rouge" };
  if (enRetard) return { libelle: "Paiement en retard", puce: "puce-prep" };
  if (paye) return { libelle: "Abonnement actif", puce: "puce-loue" };
  if (essai) return { libelle: "Essai gratuit", puce: "puce-prep" };
  if (rienAPayer) return { libelle: "Rien à régler", puce: "puce-grise" };
  return { libelle: "À souscrire", puce: "puce-grise" };
}
