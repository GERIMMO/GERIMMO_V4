import Link from "next/link";
import { initialesAgence } from "./libelles";

/**
 * Les primitives visuelles du portail artisan.
 *
 * GABARIT DE RÉFÉRENCE : LE TÉLÉPHONE, 390 px (module 19). Trois contraintes
 * d'usage dictent tout ce fichier, et aucune n'est décorative :
 *
 *  · MAINS SALES OU GANTÉES → les cibles font 56 px de haut pour une action
 *    principale, 52 px pour un champ, 48 px minimum pour une ligne cliquable.
 *    Un doigt ganté ne vise pas un bouton de 32 px (la taille par défaut de
 *    `components/ui/button`, calibrée pour la souris d'un agent au bureau) —
 *    d'où ces classes plutôt que ce composant.
 *  · PLEIN SOLEIL → contrastes élevés : texte en `--corps` ou `--encre` sur
 *    `--ivoire`, jamais en `--libelle` pour une information qui compte ;
 *    filets à 2 px ; corps de texte à 16 px minimum (et jamais moins de 16 px
 *    sur un champ de saisie, sinon iOS zoome à la mise au point et l'écran
 *    part de travers).
 *  · RÉSEAU FAIBLE → des pages courtes, et la photo compressée à la prise.
 *
 * MODULE 17 (marque blanche) : aucune couleur en dur ici — que des jetons
 * `var(--…)` et les classes maison de globals.css. Le jour où l'agence
 * apporte sa charte, ces écrans la prennent sans être retouchés.
 */

export const CLASSE_BOUTON_PRINCIPAL =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--encre)] bg-[var(--encre)] px-4 text-center text-[1.0625rem] font-medium text-[var(--sur-encre)] transition-colors hover:bg-[var(--graphite)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)] disabled:opacity-60";

export const CLASSE_BOUTON_SECONDAIRE =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--encre)] bg-[var(--ivoire)] px-4 text-center text-[1.0625rem] font-medium text-[var(--encre)] transition-colors hover:bg-[var(--ardoise)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)] disabled:opacity-60";

export const CLASSE_BOUTON_SOBRE =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] px-4 text-center text-base font-medium text-[var(--texte-secondaire)] transition-colors hover:border-[var(--encre)] hover:text-[var(--encre)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)] disabled:opacity-60";

export const CLASSE_BOUTON_REFUS =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--destructive)] bg-[var(--ivoire)] px-4 text-center text-[1.0625rem] font-medium text-[var(--destructive)] transition-colors hover:bg-[var(--destructive-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)] disabled:opacity-60";

/** 16 px minimum : en dessous, iOS zoome à la mise au point du champ. */
export const CLASSE_CHAMP =
  "min-h-13 w-full rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] px-3 py-2 text-base text-[var(--corps)] focus:border-[var(--encre)] focus:outline-none";

export const CLASSE_ZONE_TEXTE =
  "w-full rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] px-3 py-2.5 text-base leading-relaxed text-[var(--corps)] focus:border-[var(--encre)] focus:outline-none";

export const CLASSE_LIBELLE = "block text-[0.9375rem] font-medium text-[var(--encre)]";

export function Carte({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-card p-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function TitreSection({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[1.0625rem] font-medium text-[var(--encre)]">
      {children}
    </h2>
  );
}

type Ton = "neutre" | "encre" | "attente" | "alerte" | "ok";

const TONS: Record<Ton, string> = {
  neutre: "bg-[var(--filet-leger)] text-[var(--texte-secondaire)]",
  encre: "bg-[var(--ardoise)] text-[var(--encre)]",
  attente: "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
  alerte: "bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]",
  ok: "bg-[var(--success-soft)] text-[var(--success-soft-foreground)]",
};

/** Étiquette d'état. 13 px et non 11,5 px (`.puce`) : elle se lit en plein soleil. */
export function Etiquette({
  ton = "neutre",
  children,
}: {
  ton?: Ton;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-medium ${TONS[ton]}`}
    >
      {children}
    </span>
  );
}

/**
 * La marque de l'agence, posée sur chaque intervention (RM-19.3.3).
 *
 * Monogramme, faute de logo : voir `initialesAgence` dans libelles.ts pour le
 * constat du 2026-09-11 qui l'impose. Elle compte autant que l'heure sur cet
 * écran — l'artisan enchaîne les agences dans la journée et doit savoir, d'un
 * coup d'œil, pour qui il travaille à 14 h.
 */
export function MarqueAgence({
  nom,
  taille = "normale",
}: {
  nom: string | null;
  taille?: "normale" | "grande";
}) {
  const cote = taille === "grande" ? "size-11 text-sm" : "size-9 text-[0.8125rem]";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--encre)] font-medium text-[var(--or)] ${cote}`}
      >
        {initialesAgence(nom)}
      </span>
      <span className="min-w-0 truncate text-[0.9375rem] font-medium text-[var(--encre)]">
        {nom ?? "Agence"}
      </span>
    </span>
  );
}

export function Vide({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[0.9375rem] text-[var(--texte-secondaire)]">
      {children}
    </p>
  );
}

export function Erreur({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border-l-4 border-[var(--destructive)] bg-[var(--destructive-soft)] px-3.5 py-3 text-[0.9375rem] text-[var(--destructive-soft-foreground)]"
    >
      {children}
    </p>
  );
}

export function Succes({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border-l-4 border-[var(--success)] bg-[var(--success-soft)] px-3.5 py-3 text-[0.9375rem] text-[var(--success-soft-foreground)]"
    >
      {children}
    </p>
  );
}

export function Avertissement({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] px-3.5 py-3 text-[0.9375rem] text-[var(--warning-soft-foreground)]"
    >
      {children}
    </p>
  );
}

/** Retour explicite : sur un téléphone, le geste système ne suffit pas toujours. */
export function Retour({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[0.9375rem] text-[var(--texte-secondaire)] hover:text-[var(--encre)]"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-current stroke-2">
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

/** Une ligne « libellé / valeur », empilée sous 390 px plutôt que rognée. */
export function LigneInfo({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-[var(--filet-leger)] py-2.5 last:border-b-0">
      <span className="text-[0.9375rem] text-[var(--texte-secondaire)]">{libelle}</span>
      <span className="min-w-0 text-right text-[0.9375rem] font-medium text-[var(--corps)]">
        {children}
      </span>
    </div>
  );
}
