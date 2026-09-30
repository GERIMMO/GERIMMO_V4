import type { ReactNode } from "react";
import { OUTILS, type Outil } from "@/lib/outils/catalogue";

// LES OUTILS GRATUITS, CÔTÉ VITRINE (30/09) : une icône au trait et une
// accroche courte par outil. Le catalogue (lib/outils/catalogue.ts) reste la
// seule liste des outils ; ce module n'y ajoute que la présentation.
// Icônes en SVG en ligne, au trait de 1,7, couleur héritée (currentColor) :
// aucune dépendance, et une agence en marque blanche les recolore d'office.

type CleIcone = "irl" | "quittance" | "garantie" | "meuble" | "rentabilite" | "outils";

const TRACES: Record<CleIcone, ReactNode> = {
  // Courbe qui monte : la révision du loyer
  irl: (
    <>
      <path d="M3.5 17.5 9 12l3.5 3.5 8-8" />
      <path d="M15 7.5h5.5V13" />
      <path d="M3.5 21h17" />
    </>
  ),
  // Reçu à bord dentelé
  quittance: (
    <>
      <path d="M6 2.8h12v18.4l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 19.6Z" />
      <path d="M9 7.5h6M9 11h6M9 14.5h3.5" />
    </>
  ),
  // Bouclier : la garantie des loyers
  garantie: (
    <>
      <path d="M12 2.8 19.5 5.6v5.8c0 4.6-3.2 8.4-7.5 9.8-4.3-1.4-7.5-5.2-7.5-9.8V5.6Z" />
      <path d="m8.8 12.2 2.3 2.3 4.3-4.6" />
    </>
  ),
  // Fauteuil : la location meublée
  meuble: (
    <>
      <path d="M5.5 11V8.2A2.7 2.7 0 0 1 8.2 5.5h7.6a2.7 2.7 0 0 1 2.7 2.7V11" />
      <path d="M3 12.8a1.8 1.8 0 0 1 3.6 0v1.9h10.8v-1.9a1.8 1.8 0 0 1 3.6 0v5H3Z" />
      <path d="M5.5 17.8v2.2M18.5 17.8v2.2" />
    </>
  ),
  // Secteur : la part qui revient
  rentabilite: (
    <>
      <path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8H12Z" />
      <path d="M15 3.6a8.8 8.8 0 0 1 5.4 5.4H15Z" />
    </>
  ),
  // Calculette : les outils en général
  outils: (
    <>
      <rect x="5" y="2.8" width="14" height="18.4" rx="2.4" />
      <path d="M8.5 6.8h7" />
      <path d="M8.6 11.2h.01M12 11.2h.01M15.4 11.2h.01M8.6 14.6h.01M12 14.6h.01M15.4 14.6h.01M8.6 18h.01M12 18h3.4" />
    </>
  ),
};

type Presentation = { icone: CleIcone; accroche: string; court: string };

const PRESENTATION: Record<string, Presentation> = {
  "/outils/calcul-irl": {
    icone: "irl",
    court: "Révision de loyer (IRL)",
    accroche: "Le nouveau loyer et la lettre au locataire, prêts à imprimer.",
  },
  "/outils/quittance-de-loyer": {
    icone: "quittance",
    court: "Quittance de loyer",
    accroche: "Une quittance en règle, à imprimer ou enregistrer en PDF.",
  },
  "/outils/comparateur-gli-visale": {
    icone: "garantie",
    court: "GLI ou Visale",
    accroche: "Visale ou assurance loyers impayés : le vrai coût, après impôt.",
  },
  "/outils/simulateur-lmnp": {
    icone: "meuble",
    court: "Simulateur LMNP",
    accroche: "Micro-BIC ou régime réel : l'impôt de l'année, côte à côte.",
  },
  "/outils/rentabilite-locative": {
    icone: "rentabilite",
    court: "Rentabilité locative",
    accroche: "Rentabilité brute, nette de charges et cash-flow mensuel.",
  },
};

export function presentationOutil(chemin: string): Presentation {
  return PRESENTATION[chemin] ?? { icone: "outils", court: chemin, accroche: "" };
}

/** Les outils du catalogue, avec leur présentation, sauf celui qu'on exclut. */
export function outilsPresentes(sauf?: string): (Outil & Presentation)[] {
  return OUTILS.filter((o) => o.chemin !== sauf).map((o) => ({ ...o, ...presentationOutil(o.chemin) }));
}

/** L'icône seule (24 px par défaut), décorative. */
export function IconeTrait({ nom, className = "size-6" }: { nom: CleIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={`${className} shrink-0 fill-none stroke-current`}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRACES[nom]}
    </svg>
  );
}

/** La tuile d'icône d'un outil : pastille bleu pâle, trait bleu de marque. */
export function TuileOutil({ chemin, taille = "md" }: { chemin: string; taille?: "sm" | "md" | "lg" }) {
  const { icone } = presentationOutil(chemin);
  return <TuileIcone nom={icone} taille={taille} />;
}

export function TuileIcone({ nom, taille = "md" }: { nom: CleIcone; taille?: "sm" | "md" | "lg" }) {
  const boite = taille === "lg" ? "size-14 rounded-2xl" : taille === "sm" ? "size-10 rounded-xl" : "size-12 rounded-[14px]";
  const trait = taille === "lg" ? "size-7" : taille === "sm" ? "size-5" : "size-6";
  return (
    <span className={`outil-tuile ${boite}`}>
      <IconeTrait nom={nom} className={trait} />
    </span>
  );
}

/** Les pastilles « Gratuit · Sans compte ». */
export function PucesGratuit({ claires = false }: { claires?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Conditions d'accès">
      {["Gratuit", "Sans compte"].map((p) => (
        <li key={p} className={claires ? "outil-puce outil-puce-claire" : "outil-puce"}>
          {p}
        </li>
      ))}
    </ul>
  );
}
