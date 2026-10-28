import { estARenouveler, estExpiree } from "@/lib/ged";

type Attestation = { expire_le: string | null; verifie_le: string | null };

/** Une échéance absente ou illisible ne prouve jamais une couverture en cours. */
export function etatAssuranceLocataire(attestation: Attestation | undefined) {
  const date = attestation?.expire_le;
  const dateConnue = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date);
  const nonExpiree = dateConnue && !estExpiree(date);
  return {
    dateConnue,
    nonExpiree,
    validee: nonExpiree && Boolean(attestation?.verifie_le),
    aRenouveler: dateConnue && estARenouveler(date),
    libelle: !attestation ? "À déposer"
      : !dateConnue ? "Date à vérifier"
      : !nonExpiree ? "Expirée"
      : !attestation.verifie_le ? "En cours de vérification"
      : "Validée",
  };
}

/**
 * L'assurance n'est réclamée qu'à un locataire en place (sixième relecture du 28/10) : un bail dont la date de fin est
 * passée (« Votre bail a pris fin le … ») ne la réclame plus, ni dans « Ce qui vous attend » ni dans le badge du menu.
 */
export function assuranceReclamee(baux: { date_fin?: string | null }[] | null | undefined, jour: string): boolean {
  return (baux ?? []).some((b) => !b.date_fin || b.date_fin >= jour);
}

