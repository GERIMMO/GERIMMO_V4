import Link from "next/link";
import { TitreEcran, type RubriqueEcran } from "@/components/titre-ecran";
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
 *
 * DESIGN SYSTEM « MAISON » (20/11/2026) : ces primitives gardent leurs noms,
 * leurs props et leurs cibles de terrain, mais parlent la langue commune —
 * rayons `--rayon-bouton` / `--rayon-champ` / `--rayon-carte`, bouton
 * principal bleu nuit, contour des champs `--filet-champ` (3:1), survol
 * `--survol`. La classe `bouton-gerimmo` leur donne la forme, la graisse et le
 * retour au toucher des boutons des autres espaces (systeme.css) ; l'anneau de
 * focus est celui de la feuille commune. Au bureau (≥ 1000 px), la coquille
 * ramène les cibles à 44 px (portail-artisan.module.css).
 */

export const CLASSE_BOUTON_PRINCIPAL =
  "bouton-gerimmo flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--rayon-bouton)] border-2 border-[var(--marque)] bg-[var(--marque)] px-4 text-center text-[1.0625rem] font-semibold text-[var(--sur-marque)] hover:border-[var(--marque-sombre)] hover:bg-[var(--marque-sombre)] disabled:opacity-60";

export const CLASSE_BOUTON_SECONDAIRE =
  "bouton-gerimmo flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--rayon-bouton)] border-2 border-[var(--marque)] bg-[var(--ivoire)] px-4 text-center text-[1.0625rem] font-semibold text-[var(--encre)] hover:bg-[var(--survol)] disabled:opacity-60";

/**
 * Le bouton secondaire posé à côté d'un champ (« Rechercher », « Choisir »),
 * ou sous une phrase qui le précède : sa largeur est celle de son libellé,
 * pas toute la ligne — deux `w-full` côte à côte se partageraient la rangée.
 * Même hauteur de 56 px, même contour, même survol que le secondaire plein
 * largeur : un seul langage de boutons dans le portail.
 */
export const CLASSE_BOUTON_SECONDAIRE_EN_LIGNE =
  "bouton-gerimmo flex min-h-14 w-auto shrink-0 items-center justify-center gap-2 rounded-[var(--rayon-bouton)] border-2 border-[var(--marque)] bg-[var(--ivoire)] px-5 text-center text-[1.0625rem] font-semibold text-[var(--encre)] hover:bg-[var(--survol)] disabled:opacity-60";

export const CLASSE_BOUTON_SOBRE =
  "bouton-gerimmo flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--rayon-bouton)] border-2 border-[var(--filet-champ)] bg-[var(--ivoire)] px-4 text-center text-base font-semibold text-[var(--encre)] hover:border-[var(--marque)] hover:bg-[var(--survol)] disabled:opacity-60";

export const CLASSE_BOUTON_REFUS =
  "bouton-gerimmo flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--rayon-bouton)] border-2 border-[var(--destructive)] bg-[var(--ivoire)] px-4 text-center text-[1.0625rem] font-semibold text-[var(--destructive-soft-foreground)] hover:bg-[var(--destructive-soft)] disabled:opacity-60";

/** 16 px minimum : en dessous, iOS zoome à la mise au point du champ. */
export const CLASSE_CHAMP =
  "min-h-13 w-full rounded-[var(--rayon-champ)] border-2 border-[var(--filet-champ)] bg-[var(--ivoire)] px-3 py-2 text-base text-[var(--corps)] focus:border-[var(--marque)]";

export const CLASSE_ZONE_TEXTE =
  "w-full rounded-[var(--rayon-champ)] border-2 border-[var(--filet-champ)] bg-[var(--ivoire)] px-3 py-2.5 text-base leading-relaxed text-[var(--corps)] focus:border-[var(--marque)]";

export const CLASSE_LIBELLE = "block text-[0.9375rem] font-semibold text-[var(--encre)] min-[1000px]:text-xs";

/**
 * Une ligne d'aide sous un champ ou un bouton. 15 px, comme l'aide de
 * « Quelle attestation » : il en existait une seconde taille, à 13 px, trop
 * petite pour le plein soleil (tour du 24/09).
 */
export const CLASSE_AIDE = "text-[0.9375rem] text-[var(--texte-secondaire)]";

/**
 * L'en-tête d'une page de second niveau : le titre, une mention, une action
 * éventuelle, le filet dessous — l'en-tête standard des espaces (`.entete-page`).
 * Décision du 24/09 : un seul bandeau par écran, celui de l'accueil ; les
 * autres pages n'ont plus de grand aplat photographié pour un titre d'un ou
 * deux mots. `children` porte ce qui se lit avec le titre (le créneau d'une
 * mission, l'étiquette « Urgent »).
 */
export function EnteteSousPage({
  titre,
  rubrique = "incidents",
  mention,
  action,
  children,
}: {
  titre: React.ReactNode;
  rubrique?: RubriqueEcran;
  mention?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="entete-page">
      <div className="min-w-0">
        <TitreEcran rubrique={rubrique}>{titre}</TitreEcran>
        {mention && (
          <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">{mention}</p>
        )}
        {children}
      </div>
      {action}
    </div>
  );
}

export function Carte({
  children,
  className = "",
  id,
  ton,
}: {
  children: React.ReactNode;
  className?: string;
  ton?: "bleu" | "or" | "vert" | "violet";
  /** Une ancre, quand un lien de la page y mène (« Déposer ma décennale »). */
  id?: string;
}) {
  return (
    <section
      id={id}
      data-ton={ton}
      // scroll-mt : le bandeau du haut est collant, l'ancre ne doit pas
      // s'arrêter dessous.
      className={`artisan-carte ${ton ? "carte-rubrique" : ""} min-w-0 space-y-3 ${id ? "scroll-mt-28" : ""} ${className}`}
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
        className={`pastille-marque flex shrink-0 items-center justify-center rounded-full ${cote}`}
      >
        {initialesAgence(nom)}
      </span>
      <span className="min-w-0 truncate text-[0.9375rem] font-medium text-[var(--encre)]">
        {nom ?? "Votre interlocuteur"}
      </span>
    </span>
  );
}

/**
 * Un état vide. Il dit ce qui manque ET, quand un geste le débloque, mène à
 * ce geste : un constat seul laissait l'artisan chercher la suite (tour du
 * 24/09). Une seule définition — trois copies à la main avaient trois hauteurs.
 *
 * C'est l'état vide du Design System (`.vide-guide` : titre, explication,
 * geste). `titre` est facultatif : les appels d'origine (une phrase, une
 * action) restent valables tels quels.
 */
export function Vide({
  children,
  action,
  titre,
}: {
  children: React.ReactNode;
  action?: { href: string; libelle: string };
  titre?: string;
}) {
  return (
    <div className="vide-guide artisan-vide">
      {titre && <p className="titre">{titre}</p>}
      <p className="explication">{children}</p>
      {action && (
        // Un bloc et non un paragraphe : la feuille commune souligne tout lien posé dans un <p>.
        <div className="geste">
          <Link href={action.href} className={`${CLASSE_BOUTON_SOBRE} sm:w-fit`}>
            {action.libelle}
          </Link>
        </div>
      )}
    </div>
  );
}

export function Erreur({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--rayon-champ)] border-l-4 border-[var(--destructive)] bg-[var(--destructive-soft)] px-3.5 py-3 text-[0.9375rem] text-[var(--destructive-soft-foreground)]"
    >
      {children}
    </p>
  );
}

export function Succes({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-[var(--rayon-champ)] border-l-4 border-[var(--success)] bg-[var(--success-soft)] px-3.5 py-3 text-[0.9375rem] text-[var(--success-soft-foreground)]"
    >
      {children}
    </p>
  );
}

export function Avertissement({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--rayon-champ)] border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] px-3.5 py-3 text-[0.9375rem] text-[var(--warning-soft-foreground)]"
    >
      {children}
    </p>
  );
}

/** Un repère neutre : rien n'est en défaut, l'artisan a fait un choix (relecture du 23/10, rester privé). */
export function Information({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-[var(--rayon-champ)] border border-[var(--filet)] bg-[var(--filet-leger)] px-3.5 py-3 text-[0.9375rem] text-[var(--corps)]"
    >
      {children}
    </p>
  );
}

/**
 * Retour explicite : sur un téléphone, le geste système ne suffit pas toujours.
 * Format du Design System : « ← Libellé de la page d'arrivée », posé AU-DESSUS
 * du titre. La flèche est décorative (`aria-hidden`) : le nom du lien reste le
 * libellé de la page d'arrivée.
 */
export function Retour({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="artisan-retour -ml-1 inline-flex min-h-11 w-fit items-center gap-1.5 px-1 text-[0.9375rem] font-medium text-[var(--texte-secondaire)] underline-offset-4 hover:text-[var(--encre)] hover:underline"
    >
      <span aria-hidden>←</span>
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

/**
 * Les explications secondaires se lisent à la demande, même sans JavaScript.
 * `ouvert` les déplie d'emblée quand la page n'a rien d'autre à montrer : on
 * ne fait pas cliquer pour lire la seule information utile (tour du 24/09).
 */
export function DetailsInformation({
  titre,
  ouvert = false,
  children,
}: {
  titre: string;
  ouvert?: boolean;
  children: React.ReactNode;
}) {
  return <details open={ouvert} className="artisan-carte information-depliable">
    <summary>{titre}<span aria-hidden className="information-chevron">⌄</span></summary>
    <div className="mt-4">{children}</div>
  </details>;
}

/** Une lecture échouée ne prouve jamais que le dossier est absent. */
export function LectureImpossibleArtisan({ href }: { href: string }) {
  return <div className="space-y-4"><Retour href="/artisan">Aujourd’hui</Retour><EnteteSousPage titre="Dossier indisponible" /><Erreur>Ce dossier n’a pas pu être chargé. Réessayez dans un instant.</Erreur><a href={href} className={`${CLASSE_BOUTON_SECONDAIRE} sm:w-fit`}>Réessayer</a></div>;
}
