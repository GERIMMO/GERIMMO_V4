import { jourAParis, jourValide } from "./presentation-document";

export type TypeDiagnosticConditionnel = "electricite" | "gaz";
export type SituationDiagnostic = "plus_15_ans" | "date_connue" | "annee_connue" | "absente" | "inconnue";

export type QualificationDiagnostic = {
  type: TypeDiagnosticConditionnel;
  situation: SituationDiagnostic;
  date_installation: string | null;
  annee_installation?: number | null;
};

export type ObligationDiagnostic = "necessaire" | "non_concerne" | "a_preciser";

/** Compare aussi la précision de la réponse, sans assimiler une année à une date. */
export function qualificationsDiagnosticsIdentiques(
  premiere: QualificationDiagnostic | undefined,
  seconde: QualificationDiagnostic | undefined,
): boolean {
  if (!premiere || !seconde) return premiere === seconde;
  return premiere.type === seconde.type && premiere.situation === seconde.situation
    && premiere.date_installation === seconde.date_installation
    && (premiere.annee_installation ?? null) === (seconde.annee_installation ?? null);
}

/** Une qualification porte sur l’installation, jamais sur l’âge du bâtiment. */
export function evaluerQualificationDiagnostic(
  type: string,
  qualification?: QualificationDiagnostic,
  aujourdhui = jourAParis(),
): ObligationDiagnostic {
  if (!qualification || qualification.type !== type || !["electricite", "gaz"].includes(type)) {
    return "a_preciser";
  }
  if (qualification.situation === "absente") return type === "gaz" ? "non_concerne" : "a_preciser";
  if (qualification.situation === "plus_15_ans") return "necessaire";
  if (qualification.situation === "annee_connue") {
    const annee = qualification.annee_installation;
    if (!jourValide(aujourdhui) || typeof annee !== "number" || !Number.isInteger(annee)
      || annee < 1800 || annee > Number(aujourdhui.slice(0, 4)) || qualification.date_installation != null) {
      return "a_preciser";
    }
    const difference = Number(aujourdhui.slice(0, 4)) - annee;
    // Avec seulement une année, on ignore le mois et le jour. L’année du
    // quinzième anniversaire reste donc à préciser, sans inventer une date.
    return difference > 15 ? "necessaire" : difference < 15 ? "non_concerne" : "a_preciser";
  }
  if (qualification.situation !== "date_connue") return "a_preciser";

  const installation = qualification.date_installation;
  if (!jourValide(installation) || !jourValide(aujourdhui) || installation > aujourdhui) {
    return "a_preciser";
  }
  // Le quinzième anniversaire ne signifie pas encore « plus de quinze ans ».
  // Un 29 février atteint son anniversaire le dernier jour de février quand
  // l’année cible n’est pas bissextile, sans dépendre du fuseau du navigateur.
  const [annee, mois, jour] = installation.split("-").map(Number);
  const anneeAnniversaire = annee + 15;
  const dernierJour = new Date(Date.UTC(anneeAnniversaire, mois, 0)).getUTCDate();
  const anniversaire = `${String(anneeAnniversaire).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(Math.min(jour, dernierJour)).padStart(2, "0")}`;
  return aujourdhui > anniversaire ? "necessaire" : "non_concerne";
}
