/**
 * Petites reprises du lot T2 (T2R-1) — ce que les écrans disent de la solidarité après le départ d'un locataire.
 *
 * Le bail imprime la règle sous condition (`clauseSolidarite`, mentions-location.ts) : la fin de la solidarité au plus tard
 * six mois après le congé est une règle de la colocation (article 8-1 de la loi du 6 juillet 1989, déjà cité par ces écrans),
 * et elle ne s'applique pas à une location consentie exclusivement à des époux ou à des partenaires de PACS. Deux écrans
 * l'affirmaient sans condition (« Personne — solidarité 6 mois », « courent encore six mois »). Gerimmo ne connaît pas la
 * situation de famille des locataires : les libellés disent donc la règle ET sa limite, comme le bail.
 *
 * Seuls les textes changent. Le calcul de la date enregistrée au départ (`enregistrer_depart_colocataire`, six mois dans
 * tous les cas) n'est pas touché : il attend la décision du dirigeant (case « mariés ou pacsés »).
 */
export const RESERVE_EPOUX_PACS =
  "Cette règle ne s’applique pas si le bail a été consenti exclusivement à des époux ou à des partenaires liés par un PACS : ce n’est pas une colocation au sens de cet article.";

/** Choix « aucun remplaçant » de l'enregistrement d'un départ. */
export const OPTION_SANS_REMPLACANT = "Personne — solidarité 6 mois au plus (sauf époux ou pacsés)";

/** Sous le formulaire d'enregistrement d'un départ. */
export const AIDE_DEPART_COLOCATAIRE =
  `En colocation, le colocataire reste tenu solidairement, et son garant engagé, jusqu’à six mois au plus après la date d’effet de son congé — sauf si un nouveau colocataire, figurant au bail, le remplace (art. 8-1 de la loi du 6 juillet 1989). ${RESERVE_EPOUX_PACS} Gerimmo ne connaît pas la situation de famille des locataires : la date de fin de solidarité qu’il enregistre est celle de la colocation.`;

/** Refus de retirer une personne d'un bail signé. */
export const REFUS_RETRAIT_BAIL_SIGNE =
  `Le bail est signé : la personne ne se retire plus. Enregistrez le départ du locataire. En colocation, sa solidarité et celle de son garant courent encore six mois au plus (art. 8-1 de la loi du 6 juillet 1989). ${RESERVE_EPOUX_PACS}`;
