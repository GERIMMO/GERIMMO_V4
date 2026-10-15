// `@/app/actions/incidents` est un fichier d'actions serveur (base de données, session) : il n'existe pas dans le
// navigateur du banc. Les deux décisions motivées sur un devis (refus, demande de révision) rendent ce que le test a
// préparé (`window.__bancDecision.reponses`) et notent ce qu'elles reçoivent ; les autres ne servent qu'à l'import.
import type { EtatIncidentAction } from "@/app/actions/incidents";

declare global {
  interface Window {
    __bancDecision: { envois: { geste: string; motif: string | null }[]; reponses: EtatIncidentAction[] };
  }
}

function decision(geste: string) {
  return async (_org: string, _devis: string, _etat: EtatIncidentAction, donnees: FormData): Promise<EtatIncidentAction> => {
    const motif = donnees.get("motif");
    window.__bancDecision.envois.push({ geste, motif: typeof motif === "string" ? motif : null });
    return window.__bancDecision.reponses.shift() ?? {};
  };
}

export const refuserDevis = decision("refus");
export const demanderRevisionDevis = decision("revision");
const neutre = async (): Promise<EtatIncidentAction> => ({});
export const annulerMission = neutre;
export const deciderAvenant = neutre;
export const evaluerArtisan = neutre;
export const fixerRendezVous = neutre;
export const ouvrirConsultation = neutre;
export const retenirDevis = neutre;
export const reviserImputation = neutre;
export const solliciterArtisan = neutre;
