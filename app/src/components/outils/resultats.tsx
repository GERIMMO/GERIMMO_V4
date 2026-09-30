import type { ReactNode } from "react";
import { policeDocument } from "./police-document";

// LE RÉSULTAT D'UN OUTIL GRATUIT (30/09). Deux colonnes sur ordinateur : la
// saisie à gauche, le panneau de résultat à droite, collé en haut de l'écran
// pendant qu'on fait défiler les champs ; une colonne au téléphone, le
// résultat juste après les champs. Le panneau s'ouvre sur UN chiffre
// (le chiffre héros), puis le détail en liste ; les états passent par des
// pastilles (succès, attention, erreur), les comparaisons par des barres.
// Aucune bibliothèque : du HTML et des jetons de la charte.

/** La saisie et le résultat, côte à côte au-delà de 1024 px. */
export function DispositionOutil({ saisie, resultat }: { saisie: ReactNode; resultat: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,1fr)] lg:items-start lg:gap-7 print:hidden">
      {saisie}
      <div className="min-w-0 lg:sticky lg:top-[88px]">{resultat}</div>
    </div>
  );
}

/** Le panneau de résultat : filet de marque en tête, lu par les lecteurs d'écran à chaque changement. */
export function PanneauResultat({
  id,
  titre = "Résultat",
  pastille,
  children,
}: {
  id: string;
  titre?: string;
  pastille?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="outil-resultat" aria-labelledby={id} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="outil-panneau-titre">
          {titre}
        </h2>
        {pastille}
      </div>
      <div className="mt-3 space-y-5">{children}</div>
    </section>
  );
}

/** Le chiffre héros : grand, en Manrope, avec son libellé au-dessus. */
export function ChiffreHero({
  libelle,
  valeur,
  testId,
  sous,
  ton = "marque",
}: {
  libelle: string;
  valeur: string;
  testId?: string;
  sous?: ReactNode;
  ton?: "marque" | "encre" | "succes" | "erreur";
}) {
  const couleur =
    ton === "succes"
      ? "text-[var(--success)]"
      : ton === "erreur"
        ? "text-[var(--destructive-soft-foreground)]"
        : ton === "encre"
          ? "text-[var(--encre)]"
          : "text-[var(--marque-sombre)]";
  return (
    <div className="min-w-0">
      <p className="text-[13.5px] font-medium text-[var(--texte-secondaire)]">{libelle}</p>
      <p data-testid={testId} className={`outil-hero montant ${couleur}`}>
        {valeur}
      </p>
      {sous && <div className="mt-1.5 text-[13.5px] text-[var(--texte-secondaire)]">{sous}</div>}
    </div>
  );
}

/** Un chiffre secondaire (tuile). */
export function Chiffre({
  libelle,
  valeur,
  testId,
  accent = false,
}: {
  libelle: string;
  valeur: string;
  testId?: string;
  accent?: boolean;
}) {
  return (
    <div className="outil-chiffre min-w-0">
      <p className="text-[12.5px] font-medium text-[var(--texte-secondaire)]">{libelle}</p>
      <p
        data-testid={testId}
        className={`montant mt-0.5 font-heading text-[20px] font-bold leading-tight tracking-[-0.01em] ${
          accent ? "text-[var(--marque-sombre)]" : "text-[var(--encre)]"
        }`}
      >
        {valeur}
      </p>
    </div>
  );
}

export type Ton = "succes" | "attention" | "erreur" | "info" | "neutre";

/** Une pastille d'état. */
export function Pastille({ ton, children, testId }: { ton: Ton; children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className={`outil-pastille outil-pastille-${ton}`}>
      <span aria-hidden className="outil-pastille-point" />
      {children}
    </span>
  );
}

/** Le détail d'un résultat : libellé à gauche, montant à droite. */
export function ListeDetail({ children, libelle }: { children: ReactNode; libelle?: string }) {
  return (
    <dl className="outil-detail" aria-label={libelle}>
      {children}
    </dl>
  );
}

export function LigneDetail({
  libelle,
  valeur,
  fort = false,
  testId,
}: {
  libelle: ReactNode;
  valeur: ReactNode;
  fort?: boolean;
  testId?: string;
}) {
  return (
    <div className={fort ? "outil-detail-ligne outil-detail-total" : "outil-detail-ligne"}>
      <dt>{libelle}</dt>
      <dd data-testid={testId} className="montant">
        {valeur}
      </dd>
    </div>
  );
}

export type Barre = {
  libelle: string;
  valeur: number;
  texte: string;
  ton?: "marque" | "encre" | "succes" | "attention" | "pale";
  testId?: string;
  note?: string;
};

/**
 * Des barres horizontales comparées (même échelle). `max` fixe l'échelle ;
 * par défaut la plus grande valeur. Les valeurs négatives comptent pour 0.
 */
export function Barres({ barres, max, libelle }: { barres: Barre[]; max?: number; libelle: string }) {
  const plafond = Math.max(max ?? 0, ...barres.map((b) => Math.max(0, b.valeur)), 0);
  return (
    <figure className="space-y-3" aria-label={libelle}>
      {barres.map((b) => {
        const part = plafond > 0 ? Math.min(100, (Math.max(0, b.valeur) / plafond) * 100) : 0;
        return (
          <div key={b.libelle} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="min-w-0 text-[var(--corps)]">{b.libelle}</span>
              <span data-testid={b.testId} className="montant shrink-0 font-semibold text-[var(--encre)]">
                {b.texte}
              </span>
            </div>
            <div className="outil-piste mt-1.5" aria-hidden>
              <span className={`outil-barre outil-barre-${b.ton ?? "marque"}`} style={{ width: `${part}%` }} />
            </div>
            {b.note && <p className="mt-1 text-[12.5px] text-[var(--texte-secondaire)]">{b.note}</p>}
          </div>
        );
      })}
    </figure>
  );
}

/**
 * Le document à imprimer, présenté comme une feuille : papier blanc, ombre
 * douce, marges de page, police des documents de l'application (Caladea,
 * celle des PDF). À l'impression, la feuille perd son cadre.
 */
export function FeuillePapier({
  id,
  libelle,
  children,
  legende,
}: {
  id: string;
  libelle: string;
  children: ReactNode;
  legende?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {legende && (
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">{legende}</div>
      )}
      <div className="outil-bureau">
        <article id={id} aria-label={libelle} className={`outil-papier ${policeDocument.className}`}>
          {children}
        </article>
      </div>
    </div>
  );
}

/** L'icône d'impression, pour les boutons « Imprimer ». */
export function IconeImprimer() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px] fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 8V3.5h10V8M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 13.5h10v7H7Z" />
    </svg>
  );
}
