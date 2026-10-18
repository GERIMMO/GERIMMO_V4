type Connexions = {
  domaine_personnalise: string | null;
  domaine_personnalise_verifie_le: string | null;
  email_expediteur: string | null;
  email_expediteur_verifie_le: string | null;
};

export function etatPersonnalisation(connexions: Connexions) {
  const configurees = [
    connexions.domaine_personnalise ? Boolean(connexions.domaine_personnalise_verifie_le) : null,
    connexions.email_expediteur ? Boolean(connexions.email_expediteur_verifie_le) : null,
  ].filter((valeur): valeur is boolean => valeur !== null);
  if (!configurees.length) return { libelle: "Aucune personnalisation", classe: "puce-grise" };
  if (configurees.every(Boolean)) return { libelle: "Vérifiée", classe: "puce-loue" };
  if (configurees.some(Boolean)) return { libelle: "Partiellement vérifiée", classe: "puce-prep" };
  return { libelle: "À vérifier", classe: "puce-prep" };
}
