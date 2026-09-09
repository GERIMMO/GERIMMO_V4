// Diagnostics exigibles — LA source commune des compteurs (audit 09/09, P2).
// La vue Parc, la fiche bien et la fiche lot comptaient chacune à leur façon :
// « 2 à finaliser » ici, « 3 manquants » là, sans dire de quoi on parlait.
// Tout passe désormais par ce module, qui précise le niveau de rattachement :
// DPE, électricité, gaz, plomb, amiante privatif AU LOT ; ERP, termites,
// amiante des parties communes AU BIEN (l'immeuble). Le référentiel des types
// (validités, libellés) reste dans lib/parc.ts ; l'obligation stricte
// bloquante (DPE habitation + ERP) reste alignée sur lot_blocages_location /
// verifier_transition_lot côté SQL.

import {
  TYPES_DIAGNOSTIC,
  diagnosticsAttendus,
  alerteDiagnostics,
  statutDiagnostic,
  type NiveauDiagnostic,
} from "@/lib/parc";

// Le niveau, dit en français — à afficher à côté de CHAQUE compteur pour que
// « 2 manquants » sur le bien et « 3 manquants » sur son lot cessent de se
// contredire en apparence.
export const LIBELLES_NIVEAU_DIAGNOSTIC: Record<NiveauDiagnostic, string> = {
  bien: "à l'immeuble",
  lot: "au lot",
};

export type BienPourDiagnostics = {
  type: string;
  annee_construction: number | null;
};

export type DiagnosticExigible = {
  type: string;
  libelle: string;
  niveau: NiveauDiagnostic;
};

export type DiagnosticDeposeMin = {
  type: string;
  date_expiration: string | null;
};

// Les diagnostics exigibles d'un bien, éventuellement restreints à un niveau
// de rattachement. Se déduit du bien (type, année) — RM-0.6.1.
export function diagnosticsExigibles(
  bien: BienPourDiagnostics,
  niveau?: NiveauDiagnostic
): DiagnosticExigible[] {
  return diagnosticsAttendus(bien)
    .filter((t) => !niveau || TYPES_DIAGNOSTIC[t]?.niveau === niveau)
    .map((t) => ({
      type: t,
      libelle: TYPES_DIAGNOSTIC[t]?.libelle ?? t,
      niveau: TYPES_DIAGNOSTIC[t]?.niveau ?? "lot",
    }));
}

// Ce qui manque : exigible sans AUCUN dépôt en cours (un dépôt expiré reste
// listé « périmé » à part — voir alerteDiagnosticsNiveau).
export function diagnosticsManquants(
  bien: BienPourDiagnostics,
  deposes: DiagnosticDeposeMin[],
  niveau?: NiveauDiagnostic
): DiagnosticExigible[] {
  const presents = new Set(deposes.map((d) => d.type));
  return diagnosticsExigibles(bien, niveau).filter((e) => !presents.has(e.type));
}

// Pastille d'alerte d'une section « Diagnostics », étiquetée de son niveau :
// « 2 manquants · 1 périmé (au lot) ». Rend undefined quand tout est en règle.
export function alerteDiagnosticsNiveau(
  bien: BienPourDiagnostics,
  deposes: DiagnosticDeposeMin[],
  niveau: NiveauDiagnostic
): string | undefined {
  const manquants = diagnosticsManquants(bien, deposes, niveau);
  const base = alerteDiagnostics(manquants.map((m) => m.type), deposes);
  return base ? `${base} (${LIBELLES_NIVEAU_DIAGNOSTIC[niveau]})` : undefined;
}

// Un diagnostic obligatoire est-il en défaut (absent OU expiré) ? C'est le
// critère bloquant de la base (lot_blocages_location) : un DPE périmé ne
// couvre pas l'obligation, contrairement au simple compteur de manquants.
export function obligatoireEnDefaut(
  type: string,
  deposes: DiagnosticDeposeMin[]
): boolean {
  return !deposes.some(
    (d) => d.type === type && statutDiagnostic(d.date_expiration) !== "expire"
  );
}

// Un motif de blocage venant de la base parle-t-il d'un diagnostic, et à quel
// niveau ? Sert à étiqueter les compteurs de la vue Parc sans dupliquer la
// répartition bien/lot.
export function niveauDuBlocage(message: string): NiveauDiagnostic | null {
  const m = message.toLowerCase();
  if (m.includes("dpe")) return TYPES_DIAGNOSTIC.dpe.niveau;
  if (m.includes("erp") || m.includes("état des risques") || m.includes("etat des risques"))
    return TYPES_DIAGNOSTIC.erp.niveau;
  return null;
}

// Motif court + niveau : « DPE absent (au lot) » — pour les listes agrégées.
export function etiqueterNiveau(motifCourt: string, message: string): string {
  const niveau = niveauDuBlocage(message);
  return niveau ? `${motifCourt} (${LIBELLES_NIVEAU_DIAGNOSTIC[niveau]})` : motifCourt;
}
