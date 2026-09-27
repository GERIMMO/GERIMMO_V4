/** Catalogue commercial versionné. Toutes les sommes sont des centimes entiers.
 * Les contrats historiques utilisent leur propre catalogue jusqu'à migration consentie.
 * Aucun taux de TVA n'est présumé ici : le total fiscal vient du prestataire configuré.
 */
export const VERSION_TARIFICATION = "2026-09-v2" as const;
export type PublicTarif = "agence" | "proprietaire_direct";
export type Periodicite = "mensuel" | "annuel";
export type Formule = "solo" | "bailleur" | "investisseur" | "patrimoine" | "agence";
export const GRILLE_PARTICULIERS = [
  { formule: "solo", libelle: "Solo", capacite: 1, mensuelCentimes: 599, annuelCentimes: 5990 },
  { formule: "bailleur", libelle: "Bailleur", capacite: 3, mensuelCentimes: 999, annuelCentimes: 9990 },
  { formule: "investisseur", libelle: "Investisseur", capacite: 10, mensuelCentimes: 1999, annuelCentimes: 19990 },
  { formule: "patrimoine", libelle: "Patrimoine", capacite: 20, mensuelCentimes: 2999, annuelCentimes: 29990 },
] as const;
export const TRANCHES_AGENCE = [
  { jusqua: 10, unitaireCentimes: 0, forfaitCentimes: 3900 },
  { jusqua: 50, unitaireCentimes: 200, forfaitCentimes: 0 },
  { jusqua: 200, unitaireCentimes: 150, forfaitCentimes: 0 },
  { jusqua: null, unitaireCentimes: 100, forfaitCentimes: 0 },
] as const;
export type LigneTarif = {
  libelle: string; quantite: number; unitaireCentimes: number;
  forfaitCentimes: number; totalCentimes: number;
};
export type Tarif = {
  version: typeof VERSION_TARIFICATION; publicTarif: PublicTarif; formule: Formule;
  libelle: string; periodicite: Periodicite; volume: number; capacite: number;
  montantCentimes: number; baseCentimes: number; supplementCentimes: number;
  biensSupplementaires: number; taxeIncluse: boolean; lignes: LigneTarif[];
  economieAnnuelleCentimes: number;
};

export function calculerTarif(publicTarif: PublicTarif, volume: number, periodicite: Periodicite = "mensuel"): Tarif {
  if (!Number.isSafeInteger(volume) || volume < 0 || volume > Math.floor(Number.MAX_SAFE_INTEGER / 1200)) {
    throw new Error("Le nombre de biens doit être un entier positif ou nul.");
  }
  if (periodicite !== "mensuel" && periodicite !== "annuel") throw new Error("Choisissez un paiement mensuel ou annuel.");
  if (publicTarif !== "agence" && publicTarif !== "proprietaire_direct") throw new Error("Le type de gestion n’est pas reconnu.");
  if (publicTarif === "agence") {
    if (periodicite !== "mensuel") throw new Error("Les agences sont facturées chaque mois.");
    let debut = 0;
    const lignes: LigneTarif[] = [];
    for (const tranche of TRANCHES_AGENCE) {
      const quantite = Math.max(0, Math.min(volume, tranche.jusqua ?? volume) - debut);
      const totalCentimes = tranche.forfaitCentimes + quantite * tranche.unitaireCentimes;
      if (tranche.forfaitCentimes || quantite > 0) lignes.push({
        libelle: debut === 0 ? "Socle incluant jusqu’à 10 lots" : tranche.jusqua ? `Du ${debut + 1}ᵉ au ${tranche.jusqua}ᵉ lot` : `À partir du ${debut + 1}ᵉ lot`,
        quantite, unitaireCentimes: tranche.unitaireCentimes, forfaitCentimes: tranche.forfaitCentimes, totalCentimes,
      });
      debut = tranche.jusqua ?? volume;
    }
    const montantCentimes = lignes.reduce((total, ligne) => total + ligne.totalCentimes, 0);
    return { version: VERSION_TARIFICATION, publicTarif, formule: "agence", libelle: "Agence", periodicite, volume,
      capacite: Math.max(10, volume), montantCentimes, baseCentimes: 3900, supplementCentimes: montantCentimes - 3900,
      biensSupplementaires: Math.max(0, volume - 10), taxeIncluse: false, lignes, economieAnnuelleCentimes: 0 };
  }
  const formule = GRILLE_PARTICULIERS.find((offre) => offre.capacite >= volume) ?? GRILLE_PARTICULIERS[3];
  const biensSupplementaires = Math.max(0, volume - 20);
  const baseCentimes = periodicite === "annuel" ? formule.annuelCentimes : formule.mensuelCentimes;
  const prixSupplement = periodicite === "annuel" ? 1000 : 100;
  const supplementCentimes = biensSupplementaires * prixSupplement;
  const lignes: LigneTarif[] = [{ libelle: `${formule.libelle} — jusqu’à ${formule.capacite} bien${formule.capacite > 1 ? "s" : ""}`,
    quantite: 1, unitaireCentimes: baseCentimes, forfaitCentimes: 0, totalCentimes: baseCentimes }];
  if (biensSupplementaires) lignes.push({ libelle: "Biens au-delà de 20", quantite: biensSupplementaires,
    unitaireCentimes: prixSupplement, forfaitCentimes: 0, totalCentimes: supplementCentimes });
  return { version: VERSION_TARIFICATION, publicTarif, formule: formule.formule, libelle: formule.libelle, periodicite, volume,
    capacite: Math.max(formule.capacite, volume), montantCentimes: baseCentimes + supplementCentimes, baseCentimes,
    supplementCentimes, biensSupplementaires, taxeIncluse: true, lignes,
    economieAnnuelleCentimes: periodicite === "annuel" ? 2 * (formule.mensuelCentimes + biensSupplementaires * 100) : 0 };
}

export function formaterCentimes(centimes: number): string {
  if (!Number.isSafeInteger(centimes)) throw new Error("Montant invalide.");
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}

export function libellePeriodicite(periodicite: Periodicite): string {
  return periodicite === "annuel" ? "par an, prélevé en une fois" : "par mois";
}
