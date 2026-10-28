import type { SupabaseClient } from "@supabase/supabase-js";

export type EcritureFinances = {
  id: string; categorie: string; sens: string; montant: number | string;
  date_imputation: string; libelle: string | null; lot_id: string | null;
  contre_ecriture_de: string | null;
};

/** Lire toutes les pages : un total ne doit pas dépendre de la limite API. */
export async function lireLivreFinances(supabase: SupabaseClient, orgId: string) {
  const lignes: EcritureFinances[] = [];
  for (let debut = 0; ; debut += 500) {
    const { data, error } = await supabase.from("ecritures")
      .select("id, categorie, sens, montant, date_imputation, libelle, lot_id, contre_ecriture_de")
      .eq("organization_id", orgId).order("date_imputation", { ascending: false }).order("id")
      .range(debut, debut + 499);
    if (error) return { lignes: [], error };
    lignes.push(...(data ?? []) as EcritureFinances[]);
    if ((data ?? []).length < 500) return { lignes, error: null };
  }
}

/** Même exclusion des paires annulées que totaux_ecritures, même hors exercice. */
export function resumerLivre(ecritures: EcritureFinances[], annee: number, lots: Set<string> | null) {
  const annulees = new Set(ecritures.map(e => e.contre_ecriture_de).filter(Boolean));
  const lignes = ecritures.filter(e => e.date_imputation.startsWith(`${annee}-`) &&
    (!lots || (e.lot_id != null && lots.has(e.lot_id))) &&
    e.categorie !== "depot_garantie" && !e.contre_ecriture_de && !annulees.has(e.id));
  return {
    lignes,
    recettes: lignes.reduce((s,e) => s + (e.sens === "recette" ? Number(e.montant) : 0),0),
    depenses: lignes.reduce((s,e) => s + (e.sens === "depense" ? Number(e.montant) : 0),0),
  };
}

/**
 * Une ligne de quittancement_mois : ce qui compte ici, le montant demandé, le montant couvert, le statut et, lue à part
 * (`avecEcheances`), la date d'échéance de l'appel.
 */
export type EcheanceDuMois = { montant_du: number | string; montant_couvert: number | string; statut: string; date_echeance?: string | null };

/** Le reste d'un mois de dette antérieure, tel que `quittancement_mois` le détaille (du plus ancien au plus récent). */
export type DetteDuMois = { periode: string; reste: number | string };

/**
 * Où ira l'argent d'un encaissement, selon l'imputation du plus ancien au plus récent (RM-3.3.2, « Quittancement des
 * loyers ») : chaque mois de dette antérieure reçoit au plus son propre reste, puis le terme cliqué. Au centime.
 */
export function repartitionEncaissement(montant: number, detail: DetteDuMois[] | null | undefined) {
  let disponible = Math.round(montant * 100);
  const parts: { periode: string; montant: number }[] = [];
  for (const m of [...(detail ?? [])].sort((a, b) => a.periode.localeCompare(b.periode))) {
    if (disponible <= 0) break;
    const part = Math.min(disponible, Math.max(0, Math.round(Number(m.reste) * 100)));
    if (part > 0) { parts.push({ periode: m.periode, montant: part / 100 }); disponible -= part; }
  }
  return { anterieur: parts, terme: disponible / 100 };
}

/**
 * Le libellé du bouton « Encaisser » d'un terme : le montant (le reste de CE terme, que la base contrôle), puis où il ira
 * d'abord quand une dette antérieure existe (quatrième relecture : « dont 700,00 € pour août » était faux avec une dette
 * sur deux mois). Un ou deux mois servis : chaque part est dite ; au-delà, le total et le premier mois.
 * `moisEnLettres` : « 2026-08-01 » → « août 2026 ». Sans détail (fonction de base antérieure), le mois le plus ancien seul.
 */
export function libelleEncaisser(reste: number, detail: DetteDuMois[] | null | undefined, premierMois: string | null,
  eurFr: (n: number) => string, moisEnLettres: (periode: string) => string): string {
  const base = `Encaisser ${eurFr(reste)}`;
  if (!detail?.length) return premierMois ? `${base} (${moisEnLettres(premierMois)} d’abord)` : base;
  const { anterieur } = repartitionEncaissement(reste, detail);
  if (!anterieur.length) return base;
  if (anterieur.length === 1) return `${base} (dont ${eurFr(anterieur[0].montant)} pour ${moisEnLettres(anterieur[0].periode)})`;
  if (anterieur.length === 2) {
    const [a, b] = anterieur;
    const memeAnnee = a.periode.slice(0, 4) === b.periode.slice(0, 4);
    const premier = memeAnnee ? moisEnLettres(a.periode).replace(/ \d{4}$/, "") : moisEnLettres(a.periode);
    return `${base} (dont ${eurFr(a.montant)} pour ${premier} et ${eurFr(b.montant)} pour ${moisEnLettres(b.periode)})`;
  }
  const total = anterieur.reduce((t, p) => t + Math.round(p.montant * 100), 0) / 100;
  return `${base} (dont ${eurFr(total)} de dette antérieure, ${moisEnLettres(anterieur[0].periode)} d’abord)`;
}

/**
 * Un terme est-il encore à échoir ? L'exigibilité se juge sur la DATE d'échéance, comparée au jour de Paris, avec la règle de
 * la base (etat_loyers_bail_brut : un terme est impayé à partir du lendemain de son échéance). Le statut ne suffit pas :
 * un terme à échoir déjà réglé en partie (acompte, APL versée avant l'échéance) a le statut « partiel » (troisième relecture
 * de LOY-07). Sans date lue, on retombe sur le statut « attendu ».
 */
export function estAEchoir(l: EcheanceDuMois, aujourdHui: string): boolean {
  // Un terme postérieur à la fin du bail n'est pas dû (statut « non_du », 20261028100100) : ni exigible, ni à échoir.
  if (l.statut === "non_du") return false;
  return l.date_echeance ? l.date_echeance.slice(0, 10) >= aujourdHui : l.statut === "attendu";
}

/**
 * Les dates d'échéance manquent-elles ? `quittancement_mois` les rend depuis 20261028100200 ; sans elles, l'exigibilité ne
 * se juge plus que sur le statut, et un acompte sur un terme à échoir passerait pour exigible. Les écrans le disent et ne
 * proposent alors aucune relance (relecture de LOY-07 : plus de repli silencieux).
 */
export function echeancesNonVerifiees(lignes: EcheanceDuMois[]): boolean {
  return lignes.some((l) => !l.date_echeance);
}

/**
 * Les chiffres des échéances d'un mois, au centime. « Reste dû » ne compte que les termes échus : un terme dont l'échéance
 * n'est pas passée (bail payé à terme échu le 5 du mois suivant, y compris s'il est déjà réglé en partie) se dit « à échoir »
 * à part (audit final du 27/10, LOY-07 : « Reste dû 3 110 € » dont 710 € pas encore exigibles).
 */
export function totauxEcheances(lignes: EcheanceDuMois[], aujourdHui: string) {
  const centimes = (v: number | string) => Math.round(Number(v) * 100);
  const totaux = { demande: 0, regle: 0, resteDu: 0, aEchoir: 0 };
  for (const l of lignes) {
    // « non_du » : ni demandé, ni à échoir, ni dans le reste dû, même si une ligne portait un montant (intégration du 28/10).
    if (l.statut === "non_du") continue;
    const du = centimes(l.montant_du), couvert = Math.min(du, centimes(l.montant_couvert));
    totaux.demande += du; totaux.regle += couvert;
    if (estAEchoir(l, aujourdHui)) totaux.aEchoir += Math.max(0, du - couvert); else totaux.resteDu += Math.max(0, du - couvert);
  }
  return { demande: totaux.demande / 100, regle: totaux.regle / 100, resteDu: totaux.resteDu / 100, aEchoir: totaux.aEchoir / 100 };
}

/** Une ligne de quittancement_mois vue par la carte « Impayés à relancer » de l'agence. */
export type EcheanceARelancer = EcheanceDuMois & { dette_anterieure_reste?: number | string | null };

/**
 * Ce que la page Loyers de l'agence présente à relancer, au centime (relectures de LOY-07). Un terme à échoir (`estAEchoir`)
 * ne se relance pas pour lui-même : sa ligne n'est à relancer que si elle porte une dette antérieure échue, et son reste se
 * dit alors « à échoir ». La tuile et la carte comptent la même liste. `exigible` = reste des termes échus + dettes des mois
 * précédents portées par les lignes : le montant à relancer, chiffre principal de la tuile.
 */
export function relancesDuMois<T extends EcheanceARelancer>(lignes: T[], aujourdHui: string) {
  const centimes = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);
  const aRelancer = lignes
    .map((l) => {
      // Un terme « non_du » ne se relance jamais pour lui-même ; une dette antérieure échue portée par sa ligne reste due.
      const reste = l.statut === "non_du" ? 0 : Math.max(0, centimes(l.montant_du) - centimes(l.montant_couvert));
      const aEchoir = estAEchoir(l, aujourdHui);
      return { ligne: l, resteExigible: aEchoir ? 0 : reste, aEchoir: aEchoir ? reste : 0, detteAnterieure: Math.max(0, centimes(l.dette_anterieure_reste)) };
    })
    .filter((r) => r.resteExigible > 0 || r.detteAnterieure > 0)
    .map((r) => ({ ...r, resteExigible: r.resteExigible / 100, aEchoir: r.aEchoir / 100, detteAnterieure: r.detteAnterieure / 100 }));
  const somme = (cle: "resteExigible" | "detteAnterieure") => aRelancer.reduce((s, r) => s + Math.round(r[cle] * 100), 0);
  return { aRelancer, detteAnterieure: somme("detteAnterieure") / 100, exigible: (somme("resteExigible") + somme("detteAnterieure")) / 100 };
}

/** L'accord d'un participe ou d'un verbe après un montant : singulier en dessous de 2 (« 1,50 € reste », « 2,00 € restent »). */
export function accordMontant(montant: number, singulier: string, pluriel: string): string {
  return Math.abs(montant) < 2 ? singulier : pluriel;
}
