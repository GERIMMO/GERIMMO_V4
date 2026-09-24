import type { ReactNode } from "react";
import Link from "next/link";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { afficherEcheance } from "@/lib/echeances";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";

// Le groupe de rangs du plan du jour, sorti de l'accueil (24/09) : la page
// Alertes affiche désormais les mêmes rangs « À débloquer sur les baux » et
// les rapports à valider que la tuile « À faire » compte — même rendu, même
// composant. Un fichier `page.tsx` ne peut pas exporter un composant : il vit
// ici, à côté des autres pièces de l'écran Alertes.

/** Un rang du plan avec son geste rendu (lien ou pop-up) par l'écran appelant. */
export type RangDuJour = ActionDuJour & { action: ReactNode };

// Le geste-lien d'un rang : « Résoudre » sur un bail, « Valider » un rapport,
// « Traiter » une alerte incident. Le rouge reste réservé au critique.
export function LienGeste({
  href,
  critique = false,
  children,
}: {
  href: string;
  critique?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={buttonVariants({
        size: "sm",
        variant: critique ? "destructive" : "outline",
        // Un <a> échappe au min-height tactile posé sur button/select
        className: "pointer-coarse:min-h-10",
      })}
    >
      {children}
      <IndicateurLien />
    </Link>
  );
}

export function GroupeActions({
  titre,
  actions,
  total,
  reste,
  ouvert = false,
}: {
  titre: string;
  actions: RangDuJour[];
  total: number;
  // Ce qui n'est pas affiché se dit : une liste tronquée en silence ment.
  reste?: ReactNode;
  // Ouvert à l'arrivée quand le plan tient à l'écran (voir SEUIL_PLAN_OUVERT)
  ouvert?: boolean;
}) {
  if (actions.length === 0) return null;
  // UNE ÉTIQUETTE IDENTIQUE SUR TOUTE UNE LISTE N'INFORME PAS, ELLE ALLONGE.
  // Même règle que l'écran Alertes (12/09) : ce qui ne distingue pas cette
  // rangée-là des autres ne s'affiche pas. Le groupe « À venir » alignait
  // quatre fois « ALERTE NORMALE » sous un en-tête qui disait déjà de quoi il
  // s'agissait — et depuis que l'étiquette est un aplat, c'était devenu
  // l'élément le plus voyant de l'écran. Deux natures différentes dans le même
  // groupe (« Bail bloqué » / « Sur un bail ») : là, elle distingue, on la
  // garde.
  const etiquetteUtile =
    actions.length === 1 || new Set(actions.map((a) => a.nature)).size > 1;
  return (
    /* REPLIÉS PAR DÉFAUT (demande de l'humain, 12/09). L'écran du matin
       ouvrait sur une colonne de quinze rangées : on ne choisit pas par où
       commencer devant un mur. Chaque groupe se réduit à sa ligne — son nom et
       son compte — et s'ouvre d'un clic sur celui qu'on décide de traiter.
       `<details>` natif : pas d'état à porter, l'ouverture marche au clavier
       comme au doigt, et le contenu replié n'est pas lu par un lecteur
       d'écran tant qu'il est fermé.
       … SAUF QUAND IL N'Y A PAS DE MUR (24/09) : deux actions annoncées deux
       fois, et cachées derrière un dépliage fermé, coûtaient un clic pour
       rien. Sous le seuil, les groupes arrivent ouverts. */
    <details className="groupe-plan" open={ouvert || undefined}>
      <summary className="tete-groupe">
        <span className="libelle-champ">{titre}</span>
        <span className="flex items-center gap-2.5">
          <span className="libelle-champ">{total}</span>
          <span className="chevron-groupe" aria-hidden>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </summary>
      {actions.map((a) => {
        const ech = afficherEcheance(a.echeance);
        return (
          <div key={a.cle} className={`rang-alerte flex-wrap gap-y-2 ${a.criticite}`}>
            <div className="min-w-0 flex-1">
              {/* MÊME LANGAGE QUE L'ÉCRAN ALERTES (gabarit « plan du jour » du
                  12/09). Le plan du jour était resté au dessin d'avant : la
                  nature en mono gris, au même poids que le titre, et à
                  l'identique sur chaque rangée — la seule chose qui
                  distinguait deux actions était la plus discrète de la ligne.
                  Elle devient une étiquette en aplat, et le titre reprend son
                  poids. */}
              {etiquetteUtile && (
                <span className="etiquette-alerte">{a.nature}</span>
              )}
              <div
                className={`${etiquetteUtile ? "mt-1.5" : ""} text-[14.5px] font-semibold leading-snug`}
              >
                {a.titre}
              </div>
              {/* Deux lignes plutôt qu'une coupe nette : sur un téléphone,
                  `truncate` réduisait « Doublon possible : un incident du même
                  type… » à « Doublon possible : un i… », qui n'apprend rien. */}
              {a.detail && !a.titre.includes(a.detail) && (
                <div className="line-clamp-2 text-[13px] text-muted-foreground">
                  {a.detail}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {/* « SANS ÉCHÉANCE » NE S'AFFICHE PLUS. Il s'écrivait sur chaque
                  rangée qui n'en a pas — six fois le même mot sur l'écran du
                  matin. Une mention identique partout n'informe pas, elle
                  allonge ; l'échéance ne se dit que lorsqu'elle distingue
                  cette action-là des autres. */}
              {ech && (
                <span className={`text-[length:var(--pas-appui)] ${ech.classe}`}>
                  {ech.texte}
                </span>
              )}
              {a.action}
            </div>
          </div>
        );
      })}
      {reste}
    </details>
  );
}
