import { rapprocherConsommations, type FactureFourniture, type ContratFourniture, type CompteurConsommation, type ReleveConsommation } from "./consommations";
import { compteursPourFacture } from "./compteurs-facture";

const ENERGIES = ["eau", "electricite_commune", "electricite_privative", "gaz", "chauffage"];
/** Deux périodes de consommation partagent le même index de frontière. */
export function debutFactureSuivante(categorie: string, derniereFin?: string) {
  if (!derniereFin) return "";
  if (ENERGIES.includes(categorie)) return derniereFin;
  const d = new Date(`${derniereFin}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function comparerFactureReleves(f: FactureFourniture, c: ContratFourniture, compteurs: CompteurConsommation[], releves: ReleveConsommation[], idsLots: string[]): {
  bilan: ReturnType<typeof rapprocherConsommations> | null; erreur?: string; unite?: string;
} {
  const manque = (erreur: string) => ({ bilan: null, erreur });
  if (f.consommation == null) return manque("La consommation facturée doit être renseignée avant la comparaison.");
  if (!ENERGIES.includes(c.categorie)) return manque("Cette dépense ne se compare pas à des index de compteur.");
  const unite = f.unite_consommation ?? (c.categorie === "eau" ? "m3" : c.categorie === "gaz" ? null : "kwh");
  if (!unite) return manque("Vérifiez l’unité indiquée sur la facture de gaz. Les m³ ne sont pas des kWh.");
  const lots = c.lot_id ? [c.lot_id] : [...new Set(idsLots)];
  if (!lots.length) return manque("Aucun logement n’est rattaché à cette facture.");
  const couples = [];
  for (const lot of lots) {
    const possibles = compteursPourFacture(compteurs, releves, f, c.categorie, lot);
    if (!possibles.length) return manque("Il manque un compteur ou un relevé aux dates exactes de la facture. Aucun total partiel n’est présenté comme une comparaison complète.");
    if (possibles.length !== 1) return manque("Plusieurs compteurs correspondent à un logement. Précisez les compteurs concernés par cette facture avant de comparer ; leurs consommations ne sont pas additionnées automatiquement.");
    const m = possibles[0];
    if (m.unite !== unite) return manque("Les unités de la facture et des compteurs diffèrent. Aucune conversion entre m³ et kWh n’est appliquée automatiquement.");
    const debut = releves.find(r => r.compteur_id === m.id && r.date_releve === f.periode_debut)?.index_releve ?? (m.date_index_initial === f.periode_debut ? m.index_initial : null);
    const fin = releves.find(r => r.compteur_id === m.id && r.date_releve === f.periode_fin)?.index_releve;
    if (debut == null || fin == null) return manque("Il manque des relevés aux dates exactes de la facture. Aucun total partiel n’est présenté comme une comparaison complète.");
    couples.push({ id: m.id, indexDebut: debut, indexFin: fin, dateDebut: f.periode_debut, dateFin: f.periode_fin });
  }
  try { return { bilan: rapprocherConsommations({ consommationFacturee: f.consommation, periodeDebut: f.periode_debut, periodeFin: f.periode_fin, logements: couples }), unite: unite === "m3" ? "m³" : "kWh" }; }
  catch { return manque("Les index de cette période doivent être vérifiés avant de comparer les consommations."); }
}
