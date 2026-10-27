/** La catégorie saisie désigne-t-elle une taxe foncière (« Taxe foncière », « taxe_fonciere »…) ? */
export function estTaxeFonciere(categorie: string) {
  return /taxe[ _-]*fonciere/.test(categorie.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
}

/** Montants en centimes ; le commentaire libre n'est jamais interprété. */
export function ventilerTeom(total: number, teom: number, categorie: string, sens: string) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(teom) || teom < 0 || teom > total) {
    throw new Error("La part de TEOM doit être comprise entre zéro et le montant total.");
  }
  if (teom > 0 && (sens !== "depense" || !estTaxeFonciere(categorie))) {
    throw new Error("Renseignez la TEOM uniquement pour une dépense de taxe foncière.");
  }
  const totalCentimes = Math.round(total * 100);
  const teomCentimes = Math.round(teom * 100);
  return teomCentimes === 0
    ? [{ categorie, montant: totalCentimes / 100 }]
    : [
        ...(totalCentimes > teomCentimes ? [{ categorie: "Taxe foncière", montant: (totalCentimes - teomCentimes) / 100 }] : []),
        { categorie: "TEOM", montant: teomCentimes / 100 },
      ];
}
