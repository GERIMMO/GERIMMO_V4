/** Les chambres et le logement entier sont deux modes d'occupation du même lot. */
export function occupationLot(
  chambres: readonly { id: string }[],
  baux: readonly { etat: string; chambre_id: string | null }[],
) {
  const actifs = baux.filter(bail => bail.etat === "actif" || bail.etat === "preavis");
  const entier = actifs.some(bail => bail.chambre_id === null);
  const ids = new Set(chambres.map(chambre => chambre.id));
  const louees = new Set(actifs.flatMap(bail => bail.chambre_id && ids.has(bail.chambre_id) ? [bail.chambre_id] : []));
  return {
    contratsActifs: actifs.length,
    logementEntierOccupe: entier,
    chambresPreparees: ids.size,
    chambresLouees: louees.size,
    // Des chambres préparées dans un logement loué entier ne sont pas vacantes.
    chambresSansBail: entier ? 0 : ids.size - louees.size,
  };
}
