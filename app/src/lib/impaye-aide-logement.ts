import { ajouterMois } from "@/lib/delai-conge-bailleur";

export const ENTREE_EN_VIGUEUR_IMPAYES = "2027-01-01";

type Solde = { jour: string; detteCentimes: number };

/** Soldes nets confirmés, ordonnés par date. Un solde nul clôt l'épisode. */
export function signalementAideLogement(jour: string, soldes: readonly Solde[], termeNetCentimes?: number) {
  const soldeAujourdhui = soldes.filter((s) => s.jour <= jour);
  const episode = soldeAujourdhui.slice(soldeAujourdhui.findLastIndex((s) => s.detteCentimes <= 0) + 1);
  if (!episode.length) return null;

  const nouveauRegime = jour >= ENTREE_EN_VIGUEUR_IMPAYES;
  const seuil = nouveauRegime
    ? 45001
    : termeNetCentimes !== undefined && termeNetCentimes > 0 ? 2 * termeNetCentimes : Infinity;
  const seuilAtteint = episode.find((s) => s.detteCentimes >= seuil)?.jour;
  const troisMois = nouveauRegime ? ajouterMois(episode[0].jour, 3) : undefined;
  const constitution = [seuilAtteint, troisMois].sort()[0];
  return constitution && constitution <= jour
    ? { constitution, limite: ajouterMois(constitution, 2) }
    : null;
}
