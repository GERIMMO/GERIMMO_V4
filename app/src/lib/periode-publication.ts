// LA PÉRIODE D'UN ARTICLE, EN FRANÇAIS (24/09).
//
// La colonne `publications.periode` est une clé d'idempotence du moteur de
// propositions (« 2026-T3 », « 2026-S2 », « 2026 ») ou, pour un article écrit
// à la main ou par l'agent marketing, une date (« 2026-09-24 »,
// « marketing-auto-2026-09-24 »). Elle s'affichait telle quelle, en capitales
// à chasse fixe, dans la liste des articles et dans l'éditeur. Ce qui n'est
// pas une période reconnue ne s'affiche pas : mieux vaut rien qu'un code.

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const rang = (n: number) => (n === 1 ? "1er" : `${n}e`);

export function libellePeriode(periode: string | null | undefined): string | null {
  const valeur = (periode ?? "").trim();
  let m = valeur.match(/^(\d{4})$/);
  if (m) return `Année ${m[1]}`;
  m = valeur.match(/^(\d{4})-S([12])$/);
  if (m) return `${rang(Number(m[2]))} semestre ${m[1]}`;
  m = valeur.match(/^(\d{4})-T([1-4])$/);
  if (m) return `${rang(Number(m[2]))} trimestre ${m[1]}`;
  m = valeur.match(/^(?:marketing-auto-)?(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (m) {
    const mois = Number(m[2]);
    if (mois >= 1 && mois <= 12) return `${MOIS[mois - 1]} ${m[1]}`;
  }
  return null;
}
