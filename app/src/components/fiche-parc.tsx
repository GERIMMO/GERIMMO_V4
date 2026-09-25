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
        className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
      >
        ← {retour.libelle}
      </Link>
      {/* LE FILET SOUS TOUTE LA RANGÉE (24/09). Il était posé sur le seul
          titre, dans la colonne de gauche : il s'arrêtait après le badge et
          laissait les faits de droite (« Loyer charges comprises », « Surface »)
          sans trait, quand les pages liste de l'espace tirent le leur d'un
          bord à l'autre (`.coquille-corps .entete-page`). Même filet, même
          retrait (16 px), même écart avant la suite (24 px, le `mb-6` des
          listes) : un seul style d'en-tête dans l'espace. */}
      <div className="entete-page mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          {surtitre && <p className="eyebrow mt-1">{surtitre}</p>}
          {/* PAS `.entete-page` ICI. Cette classe est celle de la barre de
              titre d'une PAGE, et l'espace agence la transforme en carte
              blanche ombrée (`.portail-ecrans .entete-page`, sélecteur
              descendant). Posée sur ce titre-ci, qui vit dans une rangée flex,
              elle produisait une boîte blanche ajustée au mot — « Lot unique »
              flottant dans un cadre qui s'arrêtait après son badge (capture du
              19/09). Le titre n'a besoin que d'une rangée. */}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1>{titre}</h1>
            {badge}
          </div>
          {sousTitre && (
            <p className="mt-1 text-sm text-muted-foreground">{sousTitre}</p>
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
 *
 * TOUTE LA RANGÉE EST LE LIEN (24/09). Seul le petit « Régler » souligné
 * l'était : la phrase, qui dit pourtant quoi régler, restait une zone morte,
 * et sur téléphone « Régler » partait seul à la ligne en cible de 20 px de
 * haut. La rangée entière mène désormais à la section, 44 px de haut au
 * doigt ; un point sans section où se régler reste une simple phrase.
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
      <ul>
        {points.map((p) => (
          <li key={p.cle}>
            {p.ancre ? (
              <a
                href={`#${p.ancre}`}
                className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-warning/10 sm:min-h-9 pointer-coarse:min-h-11"
              >
                <span>{p.texte}</span>{" "}
                <span className="shrink-0 font-medium">
                  <span className="underline underline-offset-2">Régler</span>{" "}
                  <span aria-hidden="true">→</span>
                </span>
              </a>
            ) : (
              <p className="flex min-h-9 items-center py-1">{p.texte}</p>
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
          {/* Seule l'initiale passe en minuscule (24/09) : `toLowerCase()` sur
              tout le libellé écrivait « surface carrez », or Carrez est un nom
              propre (la loi Carrez). */}
          Non renseigné :{" "}
          {vides
            .map((f) => f.libelle.charAt(0).toLowerCase() + f.libelle.slice(1))
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}
