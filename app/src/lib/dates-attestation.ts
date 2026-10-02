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
  return null;
}
