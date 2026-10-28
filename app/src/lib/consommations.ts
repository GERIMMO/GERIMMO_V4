/** Suivi des consommations : aucun calcul ne produit une créance locative. */
export const TYPES_COMPTEUR = {
  eau_froide: "Eau froide", eau_chaude: "Eau chaude", electricite: "Électricité",
  gaz: "Gaz", chauffage: "Chauffage",
} as const;
export type TypeCompteur = keyof typeof TYPES_COMPTEUR;
export type CompteurConsommation = {
  id: string; organization_id: string; bien_id: string; lot_id: string | null;
  type: TypeCompteur; unite: "m3" | "kwh"; libelle: string; numero: string | null;
  emplacement: string | null; index_initial: number | string; date_index_initial: string;
  periodicite_mois: number; prochaine_demande: string; bail_referent: string | null;
  personne_referente: string | null; actif: boolean; created_at: string;
};
export type DemandeReleve = {
  id: string; organization_id: string; compteur_id: string; bail_id: string;
  personne_id: string; echeance: string; statut: "attendue" | "recu" | "annulee";
  created_at: string;
};
export type ReleveConsommation = {
  id: string; organization_id: string; compteur_id: string; demande_id: string | null;
  date_releve: string; index_releve: number | string; photo_document_id: string | null;
  created_at: string;
};
export type MonReleveConsommation = {
  demande_id: string; compteur_id: string; libelle: string; type: TypeCompteur;
  unite: "m3" | "kwh"; numero: string | null; emplacement: string | null;
  lot_nom: string; echeance: string; statut: DemandeReleve["statut"];
  index_precedent: number | string; date_precedente: string;
  index_releve: number | string | null; date_releve: string | null;
  photo_document_id: string | null; peut_repondre: boolean;
};
export const CATEGORIES_FOURNITURE = {
  eau: "Eau", electricite_commune: "Électricité des parties communes",
  electricite_privative: "Électricité du logement", gaz: "Gaz", chauffage: "Chauffage",
  internet: "Internet", assurance: "Assurance", entretien: "Entretien", teom: "Ordures ménagères (TEOM)", autre: "Autre abonnement",
} as const;
export type ContratFourniture = {
  id: string; organization_id: string; bien_id: string; lot_id: string | null;
  fournisseur: string; categorie: keyof typeof CATEGORIES_FOURNITURE; reference: string | null;
  montant_cents: number | null; periodicite_mois: number; echeance: string | null;
  preavis_jours: number; actif: boolean; created_at: string;
};
export type FactureFourniture = {
  id: string; organization_id: string; contrat_id: string; document_id: string;
  reference: string; periode_debut: string; periode_fin: string;
  total_cents: number; frais_fixes_cents: number; frais_gestion_cents: number; consommation: number | string | null;
  unite_consommation?: "m3" | "kwh" | null;
  date_echeance: string | null; payee_le: string | null; created_at: string;
};
export type RepartitionFourniture = {
  id: string; organization_id: string; facture_id: string; statut: "brouillon" | "validee";
  motif: string; lignes: { lot_id: string; bail_id: string | null; poids: number; poids_fixe?: number; compteur_id?: string | null; variable_cents?: number; fixe_cents?: number; montant_cents: number; recuperable: boolean }[];
  total_recuperable_cents: number; total_proprietaire_cents: number; source: Record<string, unknown>;
  created_at: string; validee_le: string | null;
};

/** Trois décimales d'index, converties sans flottants (m³ → litres, kWh → Wh). */
export function indexEnMillUnites(valeur: string | number): bigint {
  const texte = String(valeur).trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(texte)) throw new Error("Saisissez un index positif avec trois décimales au maximum.");
  const [entier, decimal = ""] = texte.split(".");
  return BigInt(entier) * BigInt(1000) + BigInt(decimal.padEnd(3, "0"));
}
export function consommationEntre(debut: string | number, fin: string | number): number {
  const delta = indexEnMillUnites(fin) - indexEnMillUnites(debut);
  if (delta < BigInt(0)) throw new Error("L’index est inférieur au précédent : vérifiez le compteur ou signalez son remplacement.");
  return Number(delta) / 1000;
}
const jourMs = 86_400_000;
function jour(iso: string): number {
  const n = Date.parse(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== iso) throw new Error("Date invalide.");
  return n / jourMs;
}
export function prorataOccupation(debut: string, fin: string, entree: string, sortie?: string | null): { joursOccupes: number; joursPeriode: number } {
  const d = jour(debut), f = jour(fin), e = jour(entree), s = sortie ? jour(sortie) : f;
  if (f < d || (sortie && s < e)) throw new Error("La fin de période précède son début.");
  return { joursOccupes: Math.max(0, Math.min(f, s) - Math.max(d, e) + 1), joursPeriode: f - d + 1 };
}
/** Plus fort reste déterministe : la somme des centimes reste exactement celle de la facture. */
export function repartirCentimes(total: number, parts: { id: string; poids: number }[]): { id: string; cents: number }[] {
  if (!Number.isSafeInteger(total) || total < 0 || new Set(parts.map(p => p.id)).size !== parts.length || parts.some(p => !Number.isSafeInteger(p.poids) || p.poids < 0)) throw new Error("Montant ou clé de répartition invalide.");
  const somme = parts.reduce((s, p) => s + BigInt(p.poids), BigInt(0));
  if (somme === BigInt(0)) throw new Error("La clé de répartition est vide.");
  const lignes = parts.map(p => ({ id: p.id, cents: Number(BigInt(total) * BigInt(p.poids) / somme), reste: BigInt(total) * BigInt(p.poids) % somme }));
  let restant = total - lignes.reduce((s, p) => s + p.cents, 0);
  for (const ligne of [...lignes].sort((a, b) => a.reste === b.reste ? a.id.localeCompare(b.id) : a.reste > b.reste ? -1 : 1)) {
    if (restant-- <= 0) break;
    ligne.cents++;
  }
  return lignes.map(({ id, cents }) => ({ id, cents }));
}
export type EntreeRapprochement = {
  consommationFacturee: string | number; periodeDebut: string; periodeFin: string;
  logements: { id: string; indexDebut: string | number; indexFin: string | number; dateDebut: string; dateFin: string; estimation?: boolean }[];
};
/** L'écart général reste un écart à expliquer, jamais une consommation facturée aux habitants. */
export function rapprocherConsommations(p: EntreeRapprochement) {
  if (jour(p.periodeFin) <= jour(p.periodeDebut)) throw new Error("Période de consommation invalide.");
  const facturee = indexEnMillUnites(p.consommationFacturee);
  const avertissements: string[] = [];
  let total = BigInt(0);
  let exacte = p.logements.length > 0;
  for (const l of p.logements) {
    if (jour(l.dateFin) <= jour(l.dateDebut)) throw new Error("Les deux relevés doivent être datés dans l’ordre.");
    const quantite = indexEnMillUnites(l.indexFin) - indexEnMillUnites(l.indexDebut);
    if (quantite < BigInt(0)) throw new Error("Un index diminue : vérification nécessaire.");
    if (l.dateDebut !== p.periodeDebut || l.dateFin !== p.periodeFin || l.estimation) exacte = false;
    total += quantite;
  }
  if (!p.logements.length) avertissements.push("Aucun couple de relevés disponible.");
  else if (!exacte) avertissements.push("Périodes différentes ou relevé estimé : comparaison indicative, à vérifier.");
  if (facturee !== total) avertissements.push("L’écart avec le compteur général reste à expliquer et n’est pas réparti.");
  return { consommationFacturee: Number(facturee) / 1000, consommationRelevee: Number(total) / 1000,
    ecart: Number(facturee - total) / 1000, exacte, avertissements };
}
export function autorisationRegularisation(modeCharges: string | null, categorie: ContratFourniture["categorie"]): { autorisee: boolean; motif?: string } {
  if (modeCharges === "forfait") return { autorisee: false, motif: "Charges au forfait : aucune régularisation supplémentaire." };
  if (modeCharges !== "provisions" && modeCharges !== "provision") return { autorisee: false, motif: "Le mode de charges du bail doit être confirmé." };
  if (["electricite_privative", "assurance", "internet", "autre"].includes(categorie)) return { autorisee: false, motif: "Cette dépense reste au propriétaire : aucune refacturation automatique." };
  return { autorisee: true };
}
export function alertesContrats(contrats: ContratFourniture[], factures: FactureFourniture[], aujourdHui: string) {
  const maintenant = jour(aujourdHui);
  return [
    ...contrats.filter(c => c.actif && c.echeance && jour(c.echeance) - c.preavis_jours <= maintenant + 30).map(c => ({ id: `contrat:${c.id}`, titre: `${c.fournisseur} : échéance à examiner`, date: c.echeance!, type: "contrat" as const })),
    ...factures.filter(f => !f.payee_le && f.date_echeance && jour(f.date_echeance) <= maintenant + 7).map(f => ({ id: `facture:${f.id}`, titre: "Paiement d’une facture à vérifier", date: f.date_echeance!, type: "facture" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
