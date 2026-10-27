import { diagnosticsExigibles } from "@/lib/diagnostics";
import { statutPieceDiagnostic, type DiagnosticBail } from "@/lib/documents-bail";
import { TYPES_BIEN, TYPES_DIAGNOSTIC } from "@/lib/parc";
import { jourValide } from "@/lib/presentation-document";
import { evaluerQualificationDiagnostic, type QualificationDiagnostic } from "@/lib/qualification-diagnostics";

export type ContexteDiagnosticsBail = {
  typeBien: string;
  anneeConstruction: number | null;
  qualifications: QualificationDiagnostic[];
  referenceDate: string;
};

type ExigenceDiagnosticBail = "attendu" | "a_preciser" | "a_disposition" | "non_concerne" | "complementaire" | "indisponible";
type StatutDiagnosticBail = { libelle: string; ton: "ok" | "attention" | "neutre" };
export type LigneDiagnosticBail = {
  cle: string;
  type: string;
  niveau: "lot" | "bien";
  exigence: ExigenceDiagnosticBail;
  rapport?: DiagnosticBail;
  anciens: DiagnosticBail[];
  statut: StatutDiagnosticBail;
  action?: string;
  destinationAction?: "bien" | "diagnostics";
  precision?: string;
};

/** Le fichier disponible n'est pas, à lui seul, une preuve de validité du rapport. */
export function statutRapportBail(rapport: DiagnosticBail, aujourdhui: string, referenceDate = aujourdhui): StatutDiagnosticBail {
  const statut = statutPieceDiagnostic(rapport, referenceDate);
  if (!rapport.document_id) return { ...statut, ton: "attention" };
  if (!jourValide(rapport.date_realisation) || rapport.date_realisation > aujourdhui
    || (rapport.date_expiration !== null && !jourValide(rapport.date_expiration))) {
    return { libelle: "Date à vérifier", ton: "attention" };
  }
  if (rapport.date_expiration && rapport.date_expiration < referenceDate && rapport.date_expiration >= aujourdhui) {
    return { libelle: "À renouveler avant l’entrée", ton: "attention" };
  }
  if (statut.ton === "attention") return { ...statut, ton: "attention" };
  if (!rapport.date_expiration) return { libelle: "Validité à vérifier", ton: "neutre" };
  return { libelle: "Rapport disponible", ton: "ok" };
}

/** Réutilise les attentes du parc sans transformer son suivi en nouveau blocage juridique. */
export function preparerDiagnosticsBail(
  diagnostics: DiagnosticBail[],
  aujourdhui: string,
  contexte?: ContexteDiagnosticsBail,
  erreurContexte = false,
) {
  const contexteDisponible = Boolean(contexte && !erreurContexte && Object.hasOwn(TYPES_BIEN, contexte.typeBien)
    && jourValide(contexte.referenceDate) && jourValide(aujourdhui));
  const referenceDate = contexteDisponible && contexte!.referenceDate > aujourdhui ? contexte!.referenceDate : aujourdhui;
  const attendus = contexteDisponible ? diagnosticsExigibles({
    type: contexte!.typeBien, annee_construction: contexte!.anneeConstruction,
  }) : [];
  const clesAttendues = new Set(attendus.map(d => `${d.niveau}:${d.type}`));
  // L'absence d'année ne dispense pas des rapports liés à l'ancienneté.
  // Ils restent à qualifier, sans attribuer au bâtiment une année fictive.
  const anneeAPreciser = contexteDisponible && contexte!.anneeConstruction === null;
  const typesAvecAnneeInconnue = anneeAPreciser
    ? [...(attendus.some(d => d.type === "dpe") ? ["plomb"] : []), "amiante_privatif", "amiante_communes"] : [];
  const groupes = new Map<string, { type: string; niveau: "lot" | "bien"; rapports: DiagnosticBail[] }>();
  for (const d of attendus) groupes.set(`${d.niveau}:${d.type}`, { ...d, rapports: [] });
  for (const type of typesAvecAnneeInconnue) {
    const niveau = TYPES_DIAGNOSTIC[type].niveau;
    groupes.set(`${niveau}:${type}`, { type, niveau, rapports: [] });
  }
  const idsVus = new Set<string>();
  for (const d of diagnostics) {
    if (idsVus.has(d.id)) continue;
    idsVus.add(d.id);
    const cle = `${d.niveau}:${d.type}`;
    const groupe = groupes.get(cle) ?? { type: d.type, niveau: d.niveau, rapports: [] };
    groupe.rapports.push(d);
    groupes.set(cle, groupe);
  }
  const lignes: LigneDiagnosticBail[] = [...groupes].map(([cle, groupe]) => {
    // Les lectures ne sont pas obligées de fournir le même ordre. Une ancienne
    // version valide ne doit pas masquer le rapport récent à compléter.
    const [rapport, ...anciens] = [...groupe.rapports].sort((a, b) =>
      b.date_realisation.localeCompare(a.date_realisation) || b.id.localeCompare(a.id));
    let exigence: ExigenceDiagnosticBail = !contexteDisponible ? "indisponible"
      : clesAttendues.has(cle) ? "attendu" : "complementaire";
    const anneeInconnue = typesAvecAnneeInconnue.includes(groupe.type);
    const amiante = groupe.type === "amiante_privatif" || groupe.type === "amiante_communes";
    if (anneeInconnue) exigence = "a_preciser";
    else if (exigence === "attendu" && amiante) exigence = "a_disposition";
    if (exigence === "attendu" && ["gaz", "electricite"].includes(groupe.type)) {
      const obligation = evaluerQualificationDiagnostic(groupe.type, contexte!.qualifications.find(q => q.type === groupe.type), referenceDate);
      exigence = obligation === "non_concerne" ? "non_concerne" : obligation === "a_preciser" ? "a_preciser" : "attendu";
    }
    let statut: StatutDiagnosticBail;
    let action: string | undefined;
    let destinationAction: "bien" | "diagnostics" = "diagnostics";
    if (exigence === "non_concerne") {
      statut = { libelle: "Non concerné", ton: "neutre" };
    } else if (rapport) {
      statut = statutRapportBail(rapport, aujourdhui, referenceDate);
      if (!rapport.document_id) action = "Joindre le fichier";
      else if (statut.libelle === "Expiré" || statut.libelle === "À renouveler avant l’entrée") action = "Renouveler";
      else if (statut.libelle === "Classe à compléter") action = "Compléter la classe";
      else if (statut.ton !== "ok") action = "Vérifier le rapport";
      if (!contexteDisponible && statut.ton === "ok") statut = { libelle: "Fichier disponible", ton: "neutre" };
    } else if (exigence === "a_preciser") {
      statut = { libelle: "À préciser", ton: "neutre" };
      action = anneeInconnue ? "Préciser le bâtiment" : "Préciser l’installation";
      destinationAction = anneeInconnue ? "bien" : "diagnostics";
    } else if (exigence === "a_disposition") {
      statut = { libelle: "À tenir à disposition", ton: "neutre" };
      action = "Ajouter le rapport";
    } else {
      statut = { libelle: "À ajouter", ton: "attention" };
      action = "Ajouter le rapport";
    }
    const precision = amiante ? `${anneeInconnue ? "Année de construction à préciser · " : ""}À disposition du locataire sur demande, sans annexion au bail.`
      : anneeInconnue ? "Année de construction à préciser." : undefined;
    return { cle, type: groupe.type, niveau: groupe.niveau, exigence, rapport, anciens, statut, action, destinationAction, precision };
  });
  return {
    lignes,
    referenceDate,
    contexteIndisponible: !contexteDisponible,
    anneeAPreciser,
  };
}
