import Link from "next/link";
import { cibleBlocage } from "@/lib/parc";
import { etiqueterNiveau } from "@/lib/diagnostics";
import { buttonVariants } from "@/components/ui/button";

// Ce qui empêche la mise en location d'un lot — UN SEUL rendu.
//
// Relevé du 11/09 : la même information, issue du même RPC
// `lot_blocages_location`, était rendue de TROIS façons selon l'écran — encart
// ambre sur le panneau du parc, encart ambre plus serré sur la fiche bien,
// bloc GRIS neutre sur la fiche lot (là où c'est pourtant le plus bloquant).
// Un blocage se reconnaît maintenant à la même forme partout : liseré et fond
// d'avertissement, un motif par ligne, et l'action qui le lève à droite.

export type CibleLot = { orgId: string; bienId: string; lotId: string };

function Motifs({
  motifs,
  ctx,
  pageCourante,
}: {
  motifs: string[];
  // null : on ne sait pas à quel lot rattacher l'action (bien introuvable)
  ctx: CibleLot | null;
  // Chemin de la page qui affiche la liste, sans ancre. Deux usages : une cible
  // qui tombe sur cette page même doit être une ancre NATIVE (un <Link> passe
  // par pushState, qui ne déclenche pas le `hashchange` qu'écoute SectionLot —
  // la section restait fermée) ; et `cibleBlocage` s'en sert pour garder sur
  // place ce qui peut se régler ici (l'ERP, déposable des deux fiches).
  pageCourante?: string;
}) {
  const classe = `shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`;
  return (
    <ul className="mt-1.5 space-y-1.5">
      {motifs.map((motif) => {
        const cible = ctx ? cibleBlocage(motif, ctx, pageCourante) : null;
        const memePage = Boolean(
          cible && pageCourante && cible.href.split("#")[0] === pageCourante
        );
        return (
          <li key={motif} className="flex flex-wrap items-center gap-2 text-sm">
            {/* Un diagnostic porte son niveau (« au lot » / « à l'immeuble ») */}
            <span className="min-w-0 flex-1">{etiqueterNiveau(motif, motif)}</span>
            {cible &&
              (memePage ? (
                <a href={cible.href} className={classe}>
                  {cible.libelle} →
                </a>
              ) : (
                <Link href={cible.href} className={classe}>
                  {cible.libelle} →
                </Link>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

export function BlocagesLocation({
  motifs,
  ctx,
  pageCourante,
  titre,
}: {
  motifs: string[];
  ctx: CibleLot | null;
  pageCourante?: string;
  titre?: string;
}) {
  if (motifs.length === 0) return null;
  return (
    <div className="border-l-[3px] border-l-warning bg-warning-soft p-3">
      <p className="text-sm font-medium text-warning-soft-foreground">
        {titre ??
          `${motifs.length} élément${motifs.length > 1 ? "s" : ""} à régler avant la mise en location`}
      </p>
      <Motifs motifs={motifs} ctx={ctx} pageCourante={pageCourante} />
    </div>
  );
}

// Variante sans encadré : la liste seule, quand elle vit déjà dans un bloc qui
// porte l'alerte (repli « ce qui bloque ce lot » de la fiche bien).
export function ListeBlocages({
  motifs,
  ctx,
  pageCourante,
}: {
  motifs: string[];
  ctx: CibleLot | null;
  pageCourante?: string;
}) {
  return <Motifs motifs={motifs} ctx={ctx} pageCourante={pageCourante} />;
}
