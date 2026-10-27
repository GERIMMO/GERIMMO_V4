/** Actions exclusivement fictives du banc CUA ; aucune base ni aucun réseau. */
import type { QualificationDiagnostic } from "../../../src/lib/qualification-diagnostics";
import type { DiagnosticDepose } from "../../../src/app/agence/[orgId]/parc/[bienId]/lignes-diagnostics";
import { jourAParis, jourValide } from "../../../src/lib/presentation-document";

export const controleDiagnostics = {
  qualifications: [] as QualificationDiagnostic[],
  diagnostics: [{ id: "dpe-fictif", type: "dpe", date_realisation: "2026-10-01", date_expiration: "2036-10-01", diagnostiqueur: "Cabinet fictif", document_id: "rapport-dpe-fictif", classe_dpe: "C" }] as DiagnosticDepose[],
  reponse: "succes" as "succes" | "erreur",
  retarder: false,
  liberer: undefined as (() => void) | undefined,
  envois: [] as { action: string; type: string; situation?: string; date?: string; annee?: string }[],
};

const texte = (form: FormData, nom: string) => String(form.get(nom) ?? "");
const informer = () => window.dispatchEvent(new Event("diagnostics-controle"));
async function attendre() {
  if (controleDiagnostics.retarder) await new Promise<void>(resolve => { controleDiagnostics.liberer = resolve; });
}

export async function enregistrerQualificationDiagnostic(_org: string, _bien: string, _lot: string, _etat: unknown, form: FormData) {
  const type = texte(form, "type");
  const situation = texte(form, "situation");
  const date = texte(form, "date_installation").trim();
  const annee = texte(form, "annee_installation").trim();
  const valeurs = { type, situation, date_installation: date, annee_installation: annee };
  controleDiagnostics.envois.push({ action: "qualification", type, situation, date, annee });
  if (!["gaz", "electricite"].includes(type)
    || !["plus_15_ans", "date_connue", "annee_connue", "absente", "inconnue"].includes(situation)
    || (situation === "absente" && type !== "gaz")) return { erreur: "Choisissez la situation de cette installation.", valeurs };
  if (situation === "date_connue" && (!jourValide(date) || date < "1800-01-01" || date > jourAParis())) {
    return { erreur: "Indiquez une date d’installation valide, au plus tard aujourd’hui.", valeurs };
  }
  const anneeActuelle = Number(jourAParis().slice(0, 4));
  if (situation === "annee_connue" && (!/^\d{4}$/.test(annee) || Number(annee) < 1800 || Number(annee) > anneeActuelle)) {
    return { erreur: `Indiquez une année d’installation entre 1800 et ${anneeActuelle}.`, valeurs };
  }
  const qualification: QualificationDiagnostic = {
    type: type as QualificationDiagnostic["type"],
    situation: situation as QualificationDiagnostic["situation"],
    date_installation: situation === "date_connue" ? date : null,
    annee_installation: situation === "annee_connue" ? Number(annee) : null,
  };
  await attendre();
  if (controleDiagnostics.reponse === "erreur") return { erreur: "Échec simulé : la réponse n’a pas été enregistrée." };
  controleDiagnostics.qualifications = [...controleDiagnostics.qualifications.filter(q => q.type !== qualification.type), qualification];
  informer();
  return { succes: "Réponse enregistrée." };
}

export async function deposerDiagnostic(_org: string, _bien: string, _lot: string | null, _etat: unknown, form: FormData) {
  const type = texte(form, "type");
  controleDiagnostics.envois.push({ action: "depot", type, date: texte(form, "date_realisation") });
  await attendre();
  if (controleDiagnostics.reponse === "erreur") return { erreur: "Échec simulé : le rapport n’a pas été enregistré." };
  controleDiagnostics.diagnostics = [...controleDiagnostics.diagnostics.filter(d => d.type !== type), {
    id: `diagnostic-fictif-${type}`, type, date_realisation: texte(form, "date_realisation"), date_expiration: texte(form, "date_expiration") || null,
    diagnostiqueur: "Cabinet fictif", document_id: `rapport-fictif-${type}`, classe_dpe: texte(form, "classe_dpe") || null,
  }];
  informer();
  return { succes: "Rapport fictif enregistré." };
}

export async function corrigerClasseDpeLot() {
  return { erreur: "La modification de classe n’est pas exercée dans ce banc isolé." };
}
