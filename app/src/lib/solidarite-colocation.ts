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

/*
 * Décision du dirigeant du 24/11/2026 — case « mariés ou pacsés » au bail (colonne `baux.locataires_epoux_pacses`,
 * migration 20261125152000). Article 8-1 de la loi du 6 juillet 1989 (recueil) : I — une location consentie exclusivement
 * à des époux ou à des partenaires de PACS au moment de la conclusion initiale du contrat n'est pas une colocation ; VI —
 * la fin de la solidarité (date d'effet du congé et nouveau colocataire au bail, ou au plus tard six mois après) vise les
 * colocataires. Le recueil ne donne pas d'autre terme à la solidarité de ces locataires : elle reste celle de la clause du
 * bail. Gerimmo n'enregistre alors aucune date de fin au départ de l'un d'eux. Les textes ci-dessous ne disent rien de plus.
 */

/** La case, à la préparation d'un bail à deux locataires (étape Personnes). */
export const LIBELLE_CASE_EPOUX_PACS =
  "Les deux locataires sont mariés l’un à l’autre, ou liés l’un à l’autre par un PACS, à la signature du bail (location consentie à eux seuls)";

export const AIDE_CASE_EPOUX_PACS =
  "Article 8-1 de la loi du 6 juillet 1989 : une location consentie exclusivement à des époux ou à des partenaires liés par un PACS au moment de la conclusion initiale du contrat n’est pas une colocation. Case cochée : le bail le dit, et la règle de la colocation sur la fin de la solidarité (au plus tard six mois après le congé de l’un d’eux) n’est ni imprimée ni appliquée par Gerimmo, qui n’enregistre aucune date de fin de solidarité au départ de l’un d’eux. Case non cochée : règle de la colocation.";

/** Refus : la case ne vaut que pour un bail consenti à deux personnes. */
export const refusCaseEpouxPacsNombre = (nombre: number) =>
  `La case « mariés ou pacsés » ne vaut que pour un bail consenti à deux personnes, mariées ou pacsées l’une à l’autre : ce bail compte ${nombre} locataire${nombre > 1 ? "s" : ""}. Décochez-la, ou corrigez les locataires.`;

/** Choix « aucun remplaçant » de l'enregistrement d'un départ, case cochée. */
export const OPTION_SANS_REMPLACANT_EPOUX_PACS = "Personne — aucune fin de solidarité enregistrée (époux ou pacsés)";

/** Sous le formulaire d'enregistrement d'un départ, case cochée. */
export const AIDE_DEPART_EPOUX_PACS =
  "Bail consenti à des époux ou à des partenaires liés par un PACS : ce n’est pas une colocation au sens de l’art. 8-1 de la loi du 6 juillet 1989, et sa règle de fin de la solidarité (au remplacement, ou au plus tard six mois après le congé) ne s’applique pas. Gerimmo n’enregistre donc aucune date de fin de solidarité : le locataire qui part et son garant restent destinataires des appels de loyer et des relances tant que le bail court.";

/** Refus de retirer une personne d'un bail signé, case cochée. */
export const REFUS_RETRAIT_BAIL_SIGNE_EPOUX_PACS =
  "Le bail est signé : la personne ne se retire plus. Enregistrez le départ du locataire. Bail consenti à des époux ou à des partenaires liés par un PACS : la règle de fin de la solidarité de la colocation (art. 8-1 de la loi du 6 juillet 1989) ne s’applique pas ; Gerimmo n’enregistre pas de date de fin.";

/** Départ enregistré, case cochée (la base ne rend pas de date). */
export const SUCCES_DEPART_EPOUX_PACS =
  "Départ enregistré — bail consenti à des époux ou à des partenaires liés par un PACS : aucune date de fin de solidarité n’est enregistrée (la règle de la colocation ne s’applique pas).";

/** Ligne d'un colocataire parti, case cochée, sans date de fin. */
export const SOLIDAIRE_SANS_FIN_EPOUX_PACS = "aucune fin de solidarité enregistrée (époux ou pacsés)";

/** Pied de la carte des garants d'un bail de colocation : avec ou sans la case. */
export const AIDE_GARANTS_COLOCATION =
  "Garant nominatif (couvre un colocataire) ; avec clause de solidarité, il peut être appelé au-delà de sa part. Engagement plafonné à 6 mois après le départ du colocataire couvert (loi ALUR).";
export const AIDE_GARANTS_EPOUX_PACS =
  "Garant nominatif (couvre l’un des locataires) ; avec clause de solidarité, il peut être appelé au-delà de sa part. Bail consenti à des époux ou à des partenaires liés par un PACS : la limite de six mois de la colocation ne s’applique pas à son engagement, et Gerimmo n’enregistre pas de date de fin.";
