import { eur } from "./ged";
import { lireMontantFacultatif } from "./saisie-montant";

export type AvertissementLoyer = { code: string; message: string };
export type DonneesCoherenceLoyer = {
  encadrement_loyer?: unknown;
  loyer_hc?: unknown;
  loyer_reference?: unknown;
  loyer_reference_majore?: unknown;
  complement_loyer?: unknown;
  complement_justification?: unknown;
  chambre_id?: unknown;
  type?: unknown;
};

function montant(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const lu = lireMontantFacultatif(String(v));
  return "montant" in lu ? lu.montant : null;
}
const centimes = (v: number) => Math.round((v + Number.EPSILON) * 100);

/** X08 : aide de cohérence, jamais une validation bloquante ni une correction de montant.
 * Source et limites : wiki/regles-metier/Cohérence des loyers de référence.md (16/10/2026).
 * `loyer_hc` comprend le complément. Le second argument est la surface HABITABLE du lot. */
export function avertissementsCoherenceLoyer(bail: DonneesCoherenceLoyer, surfaceHabitable: unknown): AvertissementLoyer[] {
  if (bail.encadrement_loyer !== true) return [];
  const avertissements: AvertissementLoyer[] = [];
  const ajouter = (code: string, message: string) => avertissements.push({ code, message });
  const reference = montant(bail.loyer_reference);
  const majore = montant(bail.loyer_reference_majore);
  const loyer = montant(bail.loyer_hc);
  const complement = bail.complement_loyer == null || bail.complement_loyer === "" ? 0 : montant(bail.complement_loyer);
  if (reference == null || reference <= 0 || majore == null || majore <= 0) {
    ajouter("references_manquantes", "Renseignez les loyers de référence et majoré de l’arrêté applicable, en €/m² de surface habitable.");
  // Les arrêtés peuvent publier au dixième d’euro : tolérance de la moitié d’un dixième.
  } else if (Math.abs(centimes(majore) - centimes(reference * 1.2)) > 5) {
    ajouter("reference_majoree", `Le loyer majoré saisi (${eur(majore)}/m²) ne correspond pas à la référence augmentée de 20 % (${eur(reference * 1.2)}/m²). Vérifiez les valeurs de l’arrêté.`);
  }
  if (loyer == null || complement == null) {
    ajouter("loyer_incomplet", "Complétez le loyer hors charges et vérifiez le complément pour comparer le loyer de base au plafond.");
  }
  if (complement != null && complement > 0 && !String(bail.complement_justification ?? "").trim()) {
    ajouter("complement_sans_justification", "Le complément de loyer doit être justifié dans le bail par les caractéristiques du logement. Vérifiez aussi qu’aucune caractéristique n’interdit ce complément.");
  }
  if (loyer != null && complement != null && complement > loyer) {
    ajouter("complement_superieur", "Le complément dépasse le loyer hors charges saisi. Le loyer hors charges comprend déjà ce complément : vérifiez les deux montants.");
  }
  if (String(bail.chambre_id ?? "").trim() || bail.type === "colocation_individuelle") {
    ajouter("colocation_individuelle", "Contrat individuel : vérifiez l’ensemble des loyers des chambres par rapport au montant applicable au logement. Le plafond du logement entier n’est pas comparé à ce seul contrat.");
    return avertissements;
  }
  const brutSurface = String(surfaceHabitable ?? "").trim().replace(",", ".");
  const surface = /^\d+(\.\d+)?$/.test(brutSurface) ? Number(brutSurface) : NaN;
  if (!Number.isFinite(surface) || surface <= 0) {
    ajouter("surface_manquante", "Renseignez la surface habitable du lot pour comparer le loyer au plafond. La surface Carrez n’est pas utilisée.");
    return avertissements;
  }
  if (loyer == null || complement == null || complement > loyer || majore == null || majore <= 0) return avertissements;
  const base = centimes(loyer) - centimes(complement);
  const plafond = centimes(majore * surface);
  if (base > plafond) {
    ajouter("base_superieure", `Le loyer de base (${eur(base / 100)}, hors charges et hors complément) dépasse le plafond calculé (${eur(plafond / 100)} pour ${surface.toLocaleString("fr-FR")} m² habitables). Vérifiez les montants et l’arrêté applicable.`);
  } else if (complement > 0 && base < plafond) {
    ajouter("base_inferieure_avec_complement", `Un complément est saisi alors que le loyer de base (${eur(base / 100)}) est inférieur au plafond (${eur(plafond / 100)}). Vérifiez le loyer hors charges, qui comprend déjà le complément.`);
  }
  return avertissements;
}
