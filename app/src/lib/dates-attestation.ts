/** Dates civiles : la date d'émission décrit un document déjà établi. */
export function jourAttestation(maintenant = new Date()): string {
  return maintenant.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

export function erreurDatesAttestation(emise: string, expiration: string, maintenant = new Date()): string | null {
  for (const valeur of [emise, expiration]) {
    if (!valeur) continue;
    const date = new Date(`${valeur}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valeur) {
      return "Vérifiez les dates de l’attestation.";
    }
  }
  if (emise && emise > jourAttestation(maintenant)) return "La date d’émission ne peut pas être dans le futur.";
  if (emise && expiration && expiration < emise) return "La fin de validité ne peut pas précéder la date d’émission.";
  // G-40 (recette du 11/11/2026) : une attestation déjà expirée remplaçait la version encore valable du même type.
  // Valable jusqu'au jour indiqué inclus : seule une fin de validité antérieure à aujourd'hui (jour de Paris) est refusée.
  if (expiration && expiration < jourAttestation(maintenant)) {
    const fin = new Date(`${expiration}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
    return `Cette attestation n’est plus valable depuis le ${fin}. Déposez l’attestation en cours de validité : la précédente reste en place.`;
  }
  return null;
}
