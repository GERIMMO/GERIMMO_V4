import { autorisationRegularisation, prorataOccupation, repartirCentimes, type ContratFourniture } from "./consommations";
export type LotRepartition = { id: string; nom: string; poids: number };
export type OccupationRepartition = { id: string; lot_id: string; chambre_id?: string | null; date_debut: string; date_fin: string | null; charges_mode: string };
export type ChambreRepartition = { id: string; lot_id: string; surface_m2: number | string };
export type PartRepartition = { lot_id: string; bail_id: string | null; poids: number; poids_fixe: number; recuperable: boolean; compteur_id?: string; periode_debut?: string; periode_fin?: string; fraction_numerateur?: number; fraction_denominateur?: number };

/** La vacance reste au bailleur. Des baux simultanés nécessitent une clé explicite : ne pas les compter deux fois. */
export function proposerPartsOccupation(lots: LotRepartition[], baux: OccupationRepartition[], debut: string, fin: string, categorie: ContratFourniture["categorie"], recuperable: boolean, colocation?: { mode: "egales" | "surfaces"; chambres: ChambreRepartition[] }): PartRepartition[] {
  const parts: PartRepartition[] = [];
  for (const lot of lots) {
    if (!Number.isSafeInteger(lot.poids) || lot.poids <= 0) throw new Error(`La clé de répartition de ${lot.nom} doit être renseignée.`);
    const occupations = baux.filter(b => b.lot_id === lot.id && b.date_debut <= fin && (!b.date_fin || b.date_fin >= debut)).sort((a, b) => a.date_debut.localeCompare(b.date_debut));
    if (occupations.some(b => b.chambre_id)) {
      if (!colocation || occupations.some(b => !b.chambre_id)) throw new Error(`Choisissez la clé entre les chambres de ${lot.nom} pour éviter de reporter une chambre vide sur les occupants.`);
      const chambres = colocation.chambres.filter(c => c.lot_id === lot.id);
      if (!chambres.length || occupations.some(b => !chambres.some(c => c.id === b.chambre_id))) throw new Error(`Les chambres de ${lot.nom} doivent être renseignées.`);
      const poidsChambres = repartirCentimes(10000, chambres.map(c => ({ id: c.id, poids: colocation.mode === "egales" ? 1 : Math.round(Number(c.surface_m2) * 100) })));
      for (const chambre of chambres) {
        const poidsChambre = poidsChambres.find(p => p.id === chambre.id)!.cents;
        // Même algorithme temporel par chambre : sa vacance reste au propriétaire.
        const lignes = proposerPartsOccupation([{ ...lot, poids: 1 }], occupations.filter(b => b.chambre_id === chambre.id).map(b => ({ ...b, chambre_id: null })), debut, fin, categorie, recuperable);
        for (const p of lignes) parts.push({ ...p, poids: p.poids * lot.poids * poidsChambre, poids_fixe: p.poids_fixe * lot.poids * poidsChambre });
      }
      continue;
    }
    for (let i = 1; i < occupations.length; i++) if (!occupations[i - 1].date_fin || occupations[i].date_debut <= occupations[i - 1].date_fin!) throw new Error(`Plusieurs baux se chevauchent pour ${lot.nom}. Précisez la répartition entre colocataires avant de valider cette facture.`);
    const total = prorataOccupation(debut, fin, debut).joursPeriode;
    let occupes = 0;
    for (const b of occupations) {
      const jours = prorataOccupation(debut, fin, b.date_debut, b.date_fin).joursOccupes;
      if (!jours) continue;
      occupes += jours;
      const poids = lot.poids * jours;
      if (!Number.isSafeInteger(poids) || poids > 1_000_000_000) throw new Error("Cette période est trop longue pour la clé choisie. Ventilez la facture en périodes plus courtes.");
      parts.push({ lot_id: lot.id, bail_id: b.id, poids: poids * (colocation ? 10000 : 1), poids_fixe: poids * (colocation ? 10000 : 1), recuperable: recuperable && autorisationRegularisation(b.charges_mode, categorie).autorisee });
    }
    if (occupes < total) parts.push({ lot_id: lot.id, bail_id: null, poids: lot.poids * (total - occupes) * (colocation ? 10000 : 1), poids_fixe: lot.poids * (total - occupes) * (colocation ? 10000 : 1), recuperable: false });
  }
  if (!colocation) return parts;
  // Les parts vacantes de plusieurs chambres sont une seule part propriétaire du logement.
  const groupes = new Map<string, PartRepartition>();
  for (const p of parts) { const k = `${p.lot_id}:${p.bail_id ?? "vacant"}`; const g = groupes.get(k); if (g) { g.poids += p.poids; g.poids_fixe += p.poids_fixe; } else groupes.set(k, { ...p }); }
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const diviseur = [...groupes.values()].reduce((g, p) => gcd(g, p.poids), 0) || 1;
  return [...groupes.values()].map(p => { const poids = p.poids / diviseur; if (!Number.isSafeInteger(poids) || poids > 1_000_000_000) throw new Error("La clé exige une période plus courte."); return { ...p, poids, poids_fixe: poids }; });
}
export type RepartitionFourniture = { id: string; facture_id: string; empreinte: string; statut: "brouillon" | "validee"; motif: string;
  lignes: { lot_id: string; bail_id: string | null; poids: number; poids_fixe?: number; variable_cents?: number; fixe_cents?: number; periode_debut?: string; periode_fin?: string; montant_cents: number; recuperable: boolean }[];
  source?: { facture?: { reference?: string; periode_debut?: string; periode_fin?: string; total_cents?: number }; contrat?: { fournisseur?: string }; ecart_non_reparti_cents?: number; frais_gestion_cents?: number; mode?: string; reglages?: { mode_interface?: string; colocation?: string | null } };
  total_recuperable_cents: number; total_proprietaire_cents: number; validee_le: string | null };
