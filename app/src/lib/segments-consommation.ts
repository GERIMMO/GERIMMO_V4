import { autorisationRegularisation, repartirCentimes, type ContratFourniture } from "./consommations";
import type { ChambreRepartition, OccupationRepartition, PartRepartition } from "./proposition-repartition";

/** Les périodes sont bornées par de vrais relevés. Aucun index ni date intermédiaire n'est inventé. */
export function segmentsConsommation(p: { lotId: string; compteurId: string; datesRelevees: string[]; debut: string; fin: string;
  baux: OccupationRepartition[]; partsFixes: PartRepartition[]; categorie: ContratFourniture["categorie"]; recuperable: boolean;
  colocation?: { mode: "egales" | "surfaces"; chambres: ChambreRepartition[] } }): PartRepartition[] {
  const dates = [...new Set(p.datesRelevees)].filter(d => d >= p.debut && d <= p.fin).sort();
  if (dates[0] !== p.debut || dates.at(-1) !== p.fin || dates.length < 2) throw new Error("Il manque un relevé à la date de début ou de fin de la facture.");
  const baux = p.baux.filter(b => b.lot_id === p.lotId && b.date_debut < p.fin && (!b.date_fin || b.date_fin > p.debut));
  const chambres = p.colocation?.chambres.filter(c => c.lot_id === p.lotId) ?? [];
  const individuelle = baux.some(b => b.chambre_id);
  if (individuelle && (!p.colocation || !chambres.length || baux.some(b => !b.chambre_id))) throw new Error("Confirmez la répartition entre les chambres avant de répartir les consommations.");
  const poidsChambres = individuelle ? repartirCentimes(10000, chambres.map(c => ({ id: c.id, poids: p.colocation!.mode === "egales" ? 1 : Math.round(Number(c.surface_m2) * 100) }))) : [];
  const segments: PartRepartition[] = [];
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i - 1], f = dates[i];
    if (baux.some(b => (b.date_debut > d && b.date_debut < f) || (b.date_fin && b.date_fin > d && b.date_fin < f))) throw new Error("Un occupant a changé entre deux relevés. Ajoutez le relevé d’entrée ou de sortie avant de répartir cette période.");
    const presents = baux.filter(b => b.date_debut <= d && (!b.date_fin || b.date_fin >= f));
    const affectations: { bail: OccupationRepartition | null; fraction: number }[] = [];
    if (individuelle) for (const chambre of chambres) {
      const occupants = presents.filter(b => b.chambre_id === chambre.id);
      if (occupants.length > 1) throw new Error("Plusieurs baux se chevauchent pour une même chambre.");
      affectations.push({ bail: occupants[0] ?? null, fraction: poidsChambres.find(c => c.id === chambre.id)!.cents });
    } else {
      if (presents.length > 1) throw new Error("Plusieurs baux se chevauchent : précisez les chambres du logement.");
      affectations.push({ bail: presents[0] ?? null, fraction: 10000 });
    }
    const groupe = new Map<string, typeof affectations[number]>();
    for (const a of affectations) { const key = a.bail?.id ?? "vacance"; const g = groupe.get(key); if (g) g.fraction += a.fraction; else groupe.set(key, { ...a }); }
    for (const a of groupe.values()) segments.push({ lot_id: p.lotId, bail_id: a.bail?.id ?? null, compteur_id: p.compteurId, periode_debut: d, periode_fin: f,
      fraction_numerateur: a.fraction, fraction_denominateur: 10000, poids: 1, poids_fixe: 0,
      recuperable: !!a.bail && p.recuperable && autorisationRegularisation(a.bail.charges_mode, p.categorie).autorisee });
  }
  // Ventile les frais fixes du bail au prorata des durées des segments qui lui appartiennent.
  // Le total de sa part reste celui calculé sur les jours d'occupation, indépendamment de sa consommation.
  for (const part of p.partsFixes.filter(x => x.lot_id === p.lotId)) {
    const indices = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.bail_id === part.bail_id);
    if (!indices.length && part.poids_fixe > 0) throw new Error("Les dates des relevés ne couvrent pas toute l’occupation. Vérifiez le relevé d’entrée ou de sortie.");
    if (indices.length) {
      const repartition = repartirCentimes(part.poids_fixe, indices.map(({ s, i }) => ({ id: String(i), poids: Math.round((Date.parse(s.periode_fin!) - Date.parse(s.periode_debut!)) / 86400000) })));
      for (const r of repartition) segments[Number(r.id)].poids_fixe = r.cents;
    }
  }
  return segments;
}
