// Les preuves métier sont revérifiées par PostgreSQL à la réservation et juste avant émission.
export type ContexteIncidentAbonnement =
  | { type: 'relance_abonnement'; id: string; episode: string; palier: number; montant: number; periodicite: string; premier: boolean; facture: string; version: string }
  | { type: 'resiliation_impaye'; id: string; episode: string; fin: string; facture: string; annulees: string[] }
  | { type: 'retractation_abonnement'; id: string; etape: 'reception' | 'execution' | 'copie'; copie?: string; declaration: string; declaree: string; nature: string; montant?: number; passage?: boolean };

export function incidentContractuel(type?: string): boolean {
  return type === 'relance_abonnement' || type === 'resiliation_impaye' || type === 'retractation_abonnement';
}
