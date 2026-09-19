import type { ReactNode } from "react";

/**
 * Une puce de statut, par TON et non par couleur (design system v4).
 *
 * Les écrans choisissaient jusqu'ici entre `.puce-loue`, `.puce-prep`,
 * `.puce-rouge`, `.puce-grise` — des noms d'un cas d'usage, réemployés ailleurs
 * par analogie. Ici on nomme ce que la couleur VEUT DIRE :
 *   ok → validé, terminé, à jour · attention → en attente, à confirmer ·
 *   probleme → retard, impayé, urgence · accent → action, mise en avant ·
 *   neutre → une information.
 * Le rendu reste celui de la charte (mêmes classes `.puce-*`), donc identique
 * partout où la puce existait déjà.
 */
export type TonStatut = "ok" | "attention" | "probleme" | "accent" | "neutre";

const CLASSE: Record<TonStatut, string> = {
  ok: "puce-loue",
  attention: "puce-prep",
  probleme: "puce-rouge",
  accent: "puce-encre",
  neutre: "puce-grise",
};

export function Statut({
  ton = "neutre",
  children,
  className = "",
}: {
  ton?: TonStatut;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`puce ${CLASSE[ton]} ${className}`.trim()}>{children}</span>;
}
