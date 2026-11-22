// L'avenant signé d'un bail (audit palier 1 du 22/11/2026, P1-14) : ce que l'écran calcule avant de demander à la base.
//
// La base fait autorité (enregistrer_avenant_bail, migration 20261122190000) : ces fonctions ne font que proposer des
// dates qu'elle acceptera et dire l'état d'un avenant avec des mots. Aucune ne décide d'un droit.

export type AvenantBail = {
  id: string;
  objet: string;
  signe_le: string;
  date_effet: string;
  ancien_loyer_hc: number | string;
  nouveau_loyer_hc: number | string;
  anciennes_charges: number | string;
  nouvelles_charges: number | string;
  document_id: string;
  enregistre_le: string;
  applique_le: string | null;
  annule_le: string | null;
  annulation_motif: string | null;
};

export type EtatAvenantBail = "en_attente" | "applique" | "annule";

export function etatAvenantBail(a: Pick<AvenantBail, "applique_le" | "annule_le">): EtatAvenantBail {
  if (a.annule_le) return "annule";
  return a.applique_le ? "applique" : "en_attente";
}

export const LIBELLE_ETAT_AVENANT: Record<EtatAvenantBail, string> = {
  en_attente: "En attente de sa date d’effet",
  applique: "Appliqué au bail",
  annule: "Annulé",
};

/** « AAAA-MM-01 » du mois de cette date. */
const premierDuMois = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Le 1er du mois décalé de n mois. Calcul sur l'année et le mois seuls : aucun fuseau n'entre en jeu. */
export function decalerMois(premier: string, n: number): string {
  const [a, m] = premier.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 1er décembre 2026 » pour « 2026-12-01 ». */
export function libellePremierDuMois(premier: string): string {
  const [a, m] = premier.split("-").map(Number);
  return `1er ${MOIS[m - 1]} ${a}`;
}

/** « décembre 2026 » pour « 2026-12-01 ». */
export function libelleMois(premier: string): string {
  const [a, m] = premier.split("-").map(Number);
  return `${MOIS[m - 1]} ${a}`;
}

/**
 * La première date d'effet que la base acceptera : le 1er du mois qui suit le dernier loyer appelé — un avenant ne
 * réécrit jamais un loyer déjà appelé — et jamais avant le mois d'entrée du bail.
 */
export function premiereDateEffetPossible(o: { dernierAppel: string | null; dateDebut: string | null; aujourdhui: string }): string {
  const entree = premierDuMois(o.dateDebut ?? o.aujourdhui);
  if (!o.dernierAppel) return entree;
  const apresAppel = decalerMois(premierDuMois(o.dernierAppel), 1);
  return apresAppel > entree ? apresAppel : entree;
}

/**
 * Les dates d'effet proposées : douze mois à partir de la première possible, sans dépasser ni la fin du bail ni la
 * limite de deux ans que pose la base. Liste vide : aucun avenant ne peut plus prendre effet (bail qui se termine).
 */
export function datesEffetProposees(o: { dernierAppel: string | null; dateDebut: string | null; dateFin: string | null; aujourdhui: string }, combien = 12): { valeur: string; libelle: string }[] {
  const premiere = premiereDateEffetPossible(o);
  const limite = decalerMois(premierDuMois(o.aujourdhui), 24);
  const dates: { valeur: string; libelle: string }[] = [];
  for (let i = 0; i < combien; i++) {
    const d = decalerMois(premiere, i);
    if (d > limite || (o.dateFin && d > o.dateFin)) break;
    dates.push({ valeur: d, libelle: libellePremierDuMois(d) });
  }
  return dates;
}

const nombre = (v: number | string) => Number(v);

/** Ce que l'avenant change, en une phrase : le loyer, les charges, ou les deux. */
export function changementsAvenant(a: Pick<AvenantBail, "ancien_loyer_hc" | "nouveau_loyer_hc" | "anciennes_charges" | "nouvelles_charges">, euros: (n: number) => string, libelleCharges = "Charges"): string[] {
  const lignes: string[] = [];
  if (nombre(a.ancien_loyer_hc) !== nombre(a.nouveau_loyer_hc))
    lignes.push(`Loyer hors charges : ${euros(nombre(a.ancien_loyer_hc))} → ${euros(nombre(a.nouveau_loyer_hc))}`);
  if (nombre(a.anciennes_charges) !== nombre(a.nouvelles_charges))
    lignes.push(`${libelleCharges} : ${euros(nombre(a.anciennes_charges))} → ${euros(nombre(a.nouvelles_charges))}`);
  return lignes;
}
