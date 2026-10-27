export type RegleConservation = {
  data_type: string; libelle: string; declencheur: string; duree_mois: number;
  duree_initiale_mois: number; minimum_mois: number; revision: number; actif: boolean; sort: string; updated_at: string;
};

export function dureeConservation(mois: number): string {
  if (mois === 0) return "Immédiate";
  return mois % 12 === 0 ? `${mois / 12} an${mois > 12 ? "s" : ""}` : `${mois} mois`;
}

export function effetConservation(regle: Pick<RegleConservation, "data_type" | "actif">): string {
  if (!regle.actif) return "Durée enregistrée au catalogue. Le nettoyage reste désactivé pour cette catégorie.";
  if (regle.data_type.startsWith("archive:")) return "Applicable aux prochaines archives de comptes. Les archives déjà constituées gardent leurs échéances.";
  if (regle.data_type === "compte:inactif") return "Les avertissements et fermetures pour inactivité suivront ce délai, sans passer avant une date déjà annoncée.";
  if (regle.data_type === "document:autre") return "Applicable aux documents hors bail. Un document rattaché à un bail garde le délai de 3 ans après sa fin.";
  if (regle.data_type === "document:quittance") return "Applicable aux quittances rattachées à un bail. Sans bail rattaché, le délai reste de 10 ans après émission.";
  return "Applicable aux données existantes lors du prochain nettoyage. Les protections liées aux baux en cours et aux litiges restent actives.";
}
