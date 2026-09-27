// Annuler une écriture depuis le journal (audit agence 27/09).
//
// Une écriture née d'un geste de gestion — encaissement de loyer et ses
// honoraires automatiques, encaissement du dépôt, décompte de restitution —
// ne s'annule que par le geste inverse, qui défait l'ensemble : annulée seule,
// elle laissait l'encaissement, son imputation et le reçu en place, et le
// journal contredisait l'écran des loyers. Une annulation ne s'annule pas non
// plus. La base refuse les mêmes cas (`ecriture_annulable_depuis_le_journal`) ;
// l'écran ne propose donc pas un bouton voué à l'échec, il dit où agir.

export type EcritureJournal = {
  systeme: boolean;
  contre_ecriture_de: string | null;
  encaissement_id?: string | null;
  depot_encaissement_id?: string | null;
};

/** `null` si « Annuler l'écriture » est proposé ; sinon, la mention à afficher. */
export function annulationHorsJournal(e: EcritureJournal): string | null {
  if (e.contre_ecriture_de) return "annulation";
  if (e.encaissement_id) return "se retire avec l’encaissement, depuis le bail";
  if (e.depot_encaissement_id) return "se retire avec le dépôt, depuis le bail";
  if (e.systeme) return "se corrige depuis le geste qui l’a créée";
  return null;
}
