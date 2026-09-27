// Qui atteste, dans l'attestation de bon paiement du locataire (audit du
// 27/09). Un document « fait pour servir et valoir » doit nommer un auteur
// identifiable, avec son adresse ([[Quittance conforme]]) :
//  - chez un PROPRIÉTAIRE DIRECT, le bailleur lui-même (les détenteurs du
//    lot) — pas le nom de son « parc », qui n'est personne ;
//  - chez une AGENCE, l'agence, gestionnaire pour le compte du bailleur.

export type EmetteurAttestationBrut = {
  type: string;
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  email: string | null;
  siret: string | null;
  bailleurs: { nom: string; prenom: string | null }[];
};

export type EmetteurAttestation = {
  nom: string | null;
  qualite: string;
  adresse: string | null;
  ville: string | null;
  email: string | null;
  siret: string | null;
  /** Ce qui manque pour que l'attestation soit délivrable. */
  manquants: string[];
};

export function emetteurAttestation(d: EmetteurAttestationBrut): EmetteurAttestation {
  const bailleurs =
    d.bailleurs
      .map((b) => [b.nom, b.prenom].filter(Boolean).join(" ").trim())
      .filter(Boolean)
      .join(", ") || null;
  const pd = d.type === "proprietaire_direct";
  const nom = pd ? bailleurs : d.nom?.trim() || null;
  const adresse = d.adresse?.trim()
    ? [d.adresse.trim(), [d.code_postal, d.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;
  const manquants = [
    !nom && (pd ? "le nom du bailleur" : "le nom du gestionnaire"),
    !adresse && "son adresse",
    !d.ville?.trim() && "sa commune",
  ].filter((m): m is string => Boolean(m));
  return {
    nom,
    qualite: pd
      ? "bailleur du logement désigné ci-dessous"
      : `gestionnaire du logement désigné ci-dessous${bailleurs ? `, pour le compte de ${bailleurs}` : ""}`,
    adresse,
    ville: d.ville?.trim() || null,
    email: d.email?.trim() || null,
    siret: pd ? null : d.siret?.trim() || null,
    manquants,
  };
}
