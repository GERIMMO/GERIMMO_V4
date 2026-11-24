// Textes officiels, lot T2 — passages du contrat type (décret n° 2015-587 du 29 mai 2015, annexes 1 et 2, version en vigueur
// depuis le 1er octobre 2026) que le bail reprend MOT POUR MOT. Ils ont été extraits par programme du recueil fourni par le
// dirigeant (source Légifrance et version déclarées, non recontrôlées par nous), pas retapés ; chacun est identique dans
// l'annexe 1 (logement nu) et dans l'annexe 2 (logement meublé), ce que l'extraction a vérifié. Ne pas les retoucher, même
// pour la typographie : un test en garde l'empreinte.

/** Rubrique IX. A : « Il est rappelé les dispositions du I de l'article 5 de la loi du 6 juillet 1989, alinéas 1 à 3 ». */
export const ARTICLE_5_I_ALINEAS_1_A_3: readonly string[] = [
  "La rémunération des personnes mandatées pour se livrer ou prêter leur concours à l'entremise ou à la négociation d'une mise en location d'un logement, tel que défini aux articles 2 et 25-3, est à la charge exclusive du bailleur, à l'exception des honoraires liés aux prestations mentionnées aux deuxième et troisième alinéas du présent I.",
  "Les honoraires des personnes mandatées pour effectuer la visite du preneur, constituer son dossier et rédiger un bail sont partagés entre le bailleur et le preneur. Le montant toutes taxes comprises imputé au preneur pour ces prestations ne peut excéder celui imputé au bailleur et demeure inférieur ou égal à un plafond par mètre carré de surface habitable de la chose louée fixé par voie réglementaire et révisable chaque année, dans des conditions définies par décret. Ces honoraires sont dus à la signature du bail.",
  "Les honoraires des personnes mandatées pour réaliser un état des lieux sont partagés entre le bailleur et le preneur. Le montant toutes taxes comprises imputé au locataire pour cette prestation ne peut excéder celui imputé au bailleur et demeure inférieur ou égal à un plafond par mètre carré de surface habitable de la chose louée fixé par voie réglementaire et révisable chaque année, dans des conditions définies par décret. Ces honoraires sont dus à compter de la réalisation de la prestation.",
];

/** Rubrique VIII : les deux phrases fixes de la clause résolutoire. */
export const CLAUSE_RESOLUTOIRE_CONTRAT_TYPE: readonly string[] = [
  "Le contrat de location est résilié de plein droit pour défaut de paiement du loyer ou des charges aux termes convenus ou pour non versement du dépôt de garantie.",
  "La clause de résiliation de plein droit ne produit effet que six semaines après la date d'un commandement de payer demeuré infructueux.",
];

/** Rubrique II. A, fin du rappel des niveaux de performance d'un logement décent. */
export const RAPPEL_DECENCE_METHODE_DPE =
  "La consommation d'énergie finale et le niveau de performance du logement sont déterminés selon la méthode du diagnostic de performance énergétique mentionné à l'article L. 126-26 du code de la construction et de l'habitation.";

/** Empreinte (SHA-256) des six textes ci-dessus, joints par un saut de ligne, relevée à l'extraction. */
export const EMPREINTE_TEXTES_CONTRAT_TYPE = "16f4dd95e1b4fb61c84845a3c64cc19e8d86122bc070a80edcd4a19320522df9";
