import { normaliserQualiteBailleur } from "./qualite-bailleur";
import { neutraliserFormule } from "./csv-sur";

export type ImpositionDetenteur = "ir" | "is" | "a_confirmer";
export type RegimeLocation = "micro" | "reel" | "non_concerne" | "a_confirmer";
export type ProfilFiscalDetenteur = {
  id: string; person_id: string; organization_id: string; annee: number; version: number;
  qualite: string; imposition: ImpositionDetenteur; location_nue: RegimeLocation;
  location_meublee: RegimeLocation; justification: string; cree_le: string;
};
export type DetenteurFiscal = { id: string; nom: string; prenom: string | null; qualite: string | null };
export type OrientationFiscale = { formulaires: string[]; aVerifier: string[]; aide2044: boolean; libelle: string };

export const estSci = (qualite: string | null) => ["SCI", "SCI familiale"].includes(normaliserQualiteBailleur(qualite) ?? "");
export const estSociete = (qualite: string | null) => estSci(qualite) || normaliserQualiteBailleur(qualite) === "Personne morale";

/** Orientation seulement. Ni éligibilité au micro, ni statut LMNP/LMP, ni résultat fiscal n'est déduit d'un montant. */
export function orientationFiscale(profil: Pick<ProfilFiscalDetenteur, "qualite" | "imposition" | "location_nue" | "location_meublee"> | null, avecMeuble = false): OrientationFiscale {
  if (!profil || profil.imposition === "a_confirmer") return { formulaires: [], aVerifier: ["Confirmez le régime fiscal du propriétaire pour cette année."], aide2044: false, libelle: "Situation à confirmer" };
  const societe = estSociete(profil.qualite), sci = estSci(profil.qualite);
  if (profil.imposition === "is") return { formulaires: ["2065 et liasse fiscale"], aVerifier: ["Le journal de gestion doit être complété par la comptabilité de la société : amortissements, bilan et clôture de l’exercice. Si la clôture n’est pas au 31 décembre, le journal de l’année civile ne couvre pas tout cet exercice."], aide2044: false, libelle: "Impôt sur les sociétés" };
  if (sci) return { formulaires: ["2072", "Quotes-parts des associés à déclarer séparément"], aVerifier: ["Les associés et leurs parts dans la SCI sont à vérifier avec le comptable ; les parts de détention des lots ne sont pas les parts sociales. Toute activité meublée doit aussi être examinée avant de retenir l’IR.", ...(avecMeuble ? ["Location meublée détectée : faites vérifier le maintien de la SCI à l’IR avant de préparer la déclaration."] : [])], aide2044: false, libelle: "SCI à l’impôt sur le revenu" };
  if (societe) return { formulaires: [], aVerifier: ["Le régime de cette personne morale doit être confirmé avec son comptable."], aide2044: false, libelle: "Situation particulière" };
  const formulaires: string[] = [], aVerifier: string[] = [];
  if (profil.location_nue === "micro") formulaires.push("2042 — micro-foncier");
  if (profil.location_nue === "reel") formulaires.push("2044 puis 2042 — revenus fonciers");
  if (profil.location_meublee === "micro") formulaires.push("2042-C-PRO — micro-BIC");
  if (profil.location_meublee === "reel") formulaires.push("2031 et liasse fiscale, puis 2042-C-PRO");
  if (profil.location_nue === "a_confirmer") aVerifier.push("Le régime des locations nues reste à confirmer.");
  if (profil.location_meublee === "a_confirmer") aVerifier.push("Le régime des locations meublées reste à confirmer.");
  if (profil.location_nue === "micro" || profil.location_meublee === "micro") aVerifier.push("L’éligibilité au micro s’apprécie avec l’ensemble des revenus concernés, y compris ceux gérés hors Gerimmo.");
  if (profil.location_meublee === "reel") aVerifier.push("Amortissements et résultat BIC restent à établir avec la comptabilité de l’activité.");
  if (avecMeuble && profil.location_meublee === "non_concerne") aVerifier.push("Une location meublée est enregistrée : vérifiez le choix « non concerné ».");
  return { formulaires, aVerifier, aide2044: profil.location_nue === "reel", libelle: "Impôt sur le revenu" };
}

export function dernierProfilFiscal(profils: ProfilFiscalDetenteur[], personne: string, annee: number) {
  return profils.filter(p => p.person_id === personne && p.annee === annee).sort((a, b) => b.version - a.version)[0] ?? null;
}

/** Le tableau historique 2044 n'est pas un tableau de résultats de SCI ou de BIC. */
export function gardeAide2044(detenteurs: DetenteurFiscal[], profils: ProfilFiscalDetenteur[], annee: number): string | null {
  if (!detenteurs.length) return "Renseignez d’abord le propriétaire du bien pour préparer sa fiscalité.";
  for (const personne of detenteurs) {
    const profil = dernierProfilFiscal(profils, personne.id, annee);
    if (!profil) return "Confirmez la situation fiscale de chaque propriétaire concerné avant d’utiliser l’aide 2044.";
    if (normaliserQualiteBailleur(personne.qualite) !== profil.qualite) return "La qualité d’un propriétaire a changé. Confirmez à nouveau sa situation fiscale avant de préparer la déclaration.";
    if (!orientationFiscale(profil).aide2044) return "Ce périmètre comprend un régime qui ne relève pas de l’aide 2044. Consultez les déclarations adaptées ci-dessous et exportez le dossier de préparation.";
  }
  return null;
}

/** Export de préparation : régimes et écritures brutes, sans faux résultat taxable ni partage inventé entre associés. */
export function csvPreparationFiscale(annee: number, detenteurs: DetenteurFiscal[], profils: ProfilFiscalDetenteur[], ecritures: { id: string; date_piece: string; lot_id: string | null; categorie: string; sens: string; montant: number | string; libelle: string | null; contre_ecriture_de: string | null }[]) {
  const lignes: unknown[][] = [
    ["Dossier de préparation fiscale", annee],
    ["Portée", "Journal de gestion de cet espace. Montants bruts, avant affectation fiscale et répartition entre propriétaires ou associés."],
    ["À compléter", "Ce fichier n’est ni une déclaration, ni une liasse fiscale, ni un FEC. Vérifiez les pièces, les périodes de détention, les opérations externes et les écritures de clôture."],
    ["Propriétaire", "Qualité", "Année", "Version du profil", "Déclarations à préparer", "Points à vérifier"],
    ...detenteurs.map(p => { const profil = dernierProfilFiscal(profils, p.id, annee), orientation = orientationFiscale(profil); return [[p.prenom, p.nom].filter(Boolean).join(" "), profil?.qualite ?? p.qualite, annee, profil?.version ?? "À confirmer", orientation.formulaires.join(" ; "), orientation.aVerifier.join(" ")]; }),
    [], ["Écriture", "Date", "Lot", "Catégorie", "Sens", "Montant brut EUR", "Libellé", "Contre-écriture de"],
    ...ecritures.map(e => [e.id, e.date_piece, e.lot_id ?? "À attribuer", e.categorie, e.sens, Number(e.montant).toFixed(2).replace(".", ","), e.libelle, e.contre_ecriture_de]),
  ];
  return "\uFEFF" + lignes.map(ligne => ligne.map(v => `"${neutraliserFormule(String(v ?? "")).replaceAll('"', '""')}"`).join(";")).join("\r\n");
}
