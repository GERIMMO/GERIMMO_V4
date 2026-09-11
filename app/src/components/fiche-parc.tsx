// Les briques communes aux fiches du parc (bien, lot).
//
// CE QU'ELLES CORRIGENT, RELEVÉ AU NAVIGATEUR LE 11/09. Les deux fiches
// empilaient tout à plat, au même poids : un diagnostic manquant s'y lisait
// comme « Découpage en lots : non découpable ». Le geste (« Modifier »)
// s'affichait à neuf cents pixels de son libellé sur un écran large. Les
// caractéristiques vides (« Étage — », « Tantième — », « Identifiant fiscal — »)
// occupaient un tiers de l'écran d'un téléphone pour ne rien dire. Et l'objet le
// plus important de chaque fiche — le lot sur la fiche bien, le bail sur la
// fiche lot — arrivait en dernier.
//
// Ces trois primitives posent l'ordre inverse : ce qui appelle un geste en
// haut, l'action AU CONTACT de son libellé, et rien d'affiché pour dire vide.

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * L'en-tête d'une fiche : d'où l'on vient, ce qu'on regarde, et les deux ou
 * trois chiffres qui évitent d'avoir à lire la suite.
 *
 * Les `faits` sont à DROITE sur un écran large et SOUS le titre sur un
 * téléphone — jamais en colonne étroite à côté du titre, où ils se coupent.
 */
export function EnteteFiche({
  retour,
  surtitre,
  titre,
  badge,
  sousTitre,
  faits,
}: {
  retour: { href: string; libelle: string };
  surtitre?: string;
  titre: string;
  badge?: ReactNode;
  sousTitre?: ReactNode;
  faits?: { libelle: string; valeur: string }[];
}) {
  return (
    <div>
      <Link
        href={retour.href}
        className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:underline"
      >
        ← {retour.libelle}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          {surtitre && <p className="eyebrow mt-1">{surtitre}</p>}
          <div className="entete-page">
            <div className="flex flex-wrap items-center gap-3">
              <h1>{titre}</h1>
              {badge}
            </div>
          </div>
          {sousTitre && (
            <p className="text-sm text-muted-foreground">{sousTitre}</p>
          )}
        </div>
        {faits && faits.length > 0 && (
          <dl className="flex shrink-0 flex-wrap gap-x-7 gap-y-2">
            {faits.map((f) => (
              <div key={f.libelle}>
                <dt className="text-xs text-muted-foreground">{f.libelle}</dt>
                <dd className="montant text-lg font-semibold leading-tight">{f.valeur}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/**
 * Ce qui attend un geste, dit UNE fois, en haut.
 *
 * Chaque point porte son lien vers la section qui le règle : lire « il manque
 * le DPE » sans savoir où le déposer ne fait gagner personne. Rien à signaler =
 * rien d'affiché — un bandeau vert « tout va bien » sur chaque fiche apprend à
 * ne plus regarder le bandeau.
 */
export function AttentionFiche({
  points,
}: {
  points: { cle: string; texte: string; ancre?: string }[];
}) {
  if (points.length === 0) return null;
  return (
    <section
      aria-label="Ce qui attend un geste"
      className="border-l-[3px] border-l-warning bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground"
    >
      <ul className="space-y-1">
        {points.map((p) => (
          <li key={p.cle} className="flex flex-wrap items-baseline gap-x-2">
            <span>{p.texte}</span>
            {p.ancre && (
              <a
                href={`#${p.ancre}`}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                Régler
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export type Fait = { libelle: string; valeur: string | null };

/**
 * Les caractéristiques, SANS les lignes vides.
 *
 * Une ligne « Étage — » n'apprend rien et coûte une ligne. Les champs non
 * renseignés sont donc réunis en une seule phrase en fin de bloc, qui dit à la
 * fois qu'ils manquent et lesquels — plus court ET plus informatif que la
 * colonne de tirets qu'elle remplace.
 */
export function FaitsFiche({ faits }: { faits: Fait[] }) {
  const remplis = faits.filter((f) => f.valeur !== null && f.valeur !== "");
  const vides = faits.filter((f) => f.valeur === null || f.valeur === "");
  return (
    <div className="space-y-2">
      {remplis.length > 0 && (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {remplis.map((f) => (
            <div key={f.libelle} className="ligne-info">
              <dt className="text-muted-foreground">{f.libelle}</dt>
              <dd className="text-right font-medium">{f.valeur}</dd>
            </div>
          ))}
        </dl>
      )}
      {vides.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Non renseigné : {vides.map((f) => f.libelle.toLowerCase()).join(", ")}.
        </p>
      )}
    </div>
  );
}
