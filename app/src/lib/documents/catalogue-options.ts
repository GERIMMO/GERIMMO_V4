import { CERTIFICATION_SANS_GARANTIE_CUMULEE, DECLARATION_ETUDIANT_NON_BOURSIER } from "@/lib/textes-signature-actes";

// `montant` : un montant en euros saisi en texte décimal (« 2345,67 »), lu par `lireMontantFacultatif` côté serveur ; jamais `type="number"`,
// dont la virgule est lue comme un séparateur de milliers par un navigateur non francophone (VER-TS-02).
// `repli: "detail_enregistre"` : le champ n'est pas obligatoire quand le dossier choisi porte déjà cette information (D39).
// `case` : une case à cocher obligatoire (sauf `facultatif`) ; cochée, l'option vaut « oui » (constat R30 du 23/10, acte de cautionnement).
// `facultatif` : le champ peut rester vide ; l'assembleur dit lui-même ce qui manque quand l'information est exigée (phase 3, S18).
// `si` : le champ n'est demandé, affiché et envoyé que lorsque la liste de choix `cle` vaut l'une des `valeurs` (phase 3, S18 : le
// prix de vente pour un congé pour vendre, le bénéficiaire pour une reprise…). Un champ masqué ne part pas dans les options.
export type ChampCatalogue = { cle: string; libelle: string; type?: "date" | "number" | "month" | "textarea" | "montant" | "case"; aide?: string; choix?: {valeur:string;libelle:string}[]; repli?: "detail_enregistre"; facultatif?: boolean; si?: { cle: string; valeurs: string[] } };
const siMotif = (...valeurs: string[]) => ({ cle: "motif", valeurs });
const conditions: ChampCatalogue = {cle:"conditions",libelle:"Conditions convenues",type:"textarea"};
const effet: ChampCatalogue = {cle:"date_effet",libelle:"Date d’effet",type:"date"};
const modifications: ChampCatalogue = {cle:"modifications",libelle:"Modifications convenues",type:"textarea"};
const annee: ChampCatalogue = {cle:"annee",libelle:"Année",type:"number"};
// Phase 3, lot 54 (W37) : les consignes à l'utilisateur sortent du courrier adressé au locataire et se lisent ici, sous le champ,
// là où il prépare le document (texte affiché, jamais replié) : le justificatif n'est pas dans le PDF, et le PDF ne déclenche rien.
const SANS_PRELEVEMENT = "Ce PDF ne déclenche aucun prélèvement ni envoi.";
const consultation: ChampCatalogue = {cle:"consultation",libelle:"Consultation des justificatifs",type:"textarea",aide:`Lieu ou lien, horaires et personne à contacter. ${SANS_PRELEVEMENT}`};
const consultationEtJustificatif: ChampCatalogue = {...consultation,aide:`Lieu ou lien, horaires et personne à contacter. Le justificatif enregistré avec la régularisation n’est pas dans ce PDF : joignez-le au courrier. ${SANS_PRELEVEMENT}`};
// D39 (CHF-03) : saisi à la génération du document ; la régularisation émise ne se modifie pas et n'est pas touchée.
const detailDepenses: ChampCatalogue = {cle:"detail_depenses",libelle:"Détail des dépenses par nature et clé de répartition",type:"textarea",repli:"detail_enregistre",aide:"Chaque nature de charges (eau, chauffage, ascenseur, entretien…) avec son montant et la clé de répartition retenue (tantièmes, surface, consommation…). Ce détail n’est écrit que dans ce document : la régularisation déjà enregistrée n’est pas modifiée."};
// Textes officiels, lot T1 — les consignes du congé du bailleur, écrites une fois pour l'écran du bail et pour le catalogue.
// Ce qui fait courir le délai (article 15 I de la loi du 6 juillet 1989 ; notice de l'arrêté du 13 décembre 2017, point 1-4).
export const CONGE_RECEPTION = "Le délai court à compter de la réception par le locataire : pour une lettre recommandée avec demande d’avis de réception, le jour où la lettre lui est effectivement remise (une lettre présentée mais non retirée ne fait pas courir le délai) ; pour un acte de commissaire de justice, le jour de la signification ; pour une remise en main propre contre récépissé ou émargement, le jour de la remise.";
// La notice n'est pas imprimée par Gerimmo (même logique que la notice du bail, décision Q46) : le bailleur la joint lui-même.
export const CONGE_NOTICE_A_JOINDRE = "Logement loué nu, congé pour vendre ou pour reprise : la notice d’information fixée par l’arrêté du 13 décembre 2017 doit être jointe au congé. La lettre l’annonce en pièce jointe, mais Gerimmo ne l’imprime pas : joignez-la vous-même. Son texte est l’annexe de cet arrêté, publiée sur Légifrance (legifrance.gouv.fr, texte JORFTEXT000036236664).";
export const CONGE_SANS_GARANTIE = "Un congé incomplet ou tardif peut être sans effet ; Gerimmo ne garantit pas que ce modèle soit complet ni à jour.";
export const CONGE_ACHETE_OCCUPE = "La loi limite le congé quand le bailleur a acheté le logement déjà loué : pour vendre, si le terme du bail arrive moins de trois ans après l’achat ; pour reprendre, moins de deux ans après. Dans ces cas, Gerimmo ne prépare pas la lettre.";
export const OPTIONS_CATALOGUE: Record<string, ChampCatalogue[]> = {
  avenant:[{cle:"objet",libelle:"Objet de l’avenant"},modifications],
  cautionnement:[{cle:"garant",libelle:"Garant du dossier",aide:"Choisissez un garant déjà rattaché au bail."},{cle:"forme",libelle:"Forme de caution",choix:[{valeur:"solidaire",libelle:"Solidaire"},{valeur:"simple",libelle:"Simple"}]},{cle:"montant_max",libelle:"Plafond de l’engagement (€)",type:"montant"},{cle:"sans_garantie_cumulee",libelle:CERTIFICATION_SANS_GARANTIE_CUMULEE,type:"case"},
    // Textes officiels, lot T2 (R03-A1) : case FACULTATIVE ; sans elle, l'acte est refusé quand le bailleur est une société non familiale.
    {cle:"etudiant_non_boursier",libelle:`${DECLARATION_ETUDIANT_NON_BOURSIER} (Ne cochez pas cette case si le bailleur est une personne ou une SCI familiale.)`,type:"case",facultatif:true}],
  // Phase 3 (S18) : les informations que demande l'écran du bail (generer-conge-bailleur.tsx), selon le motif : prix et conditions de
  // la vente, bénéficiaire de la reprise, motif invoqué. Plus de « date d'effet » : l'assembleur ne la lisait pas — l'effet est l'échéance
  // du bail calculée pour la date de réception prévue. Le prix et les conditions restent facultatifs à la saisie (meublé) ; en location
  // nue, l'assembleur refuse le congé pour vendre sans eux et le dit.
  // Textes officiels, lot T1 : la date est celle de la RÉCEPTION par le locataire (article 15 I de la loi du 6 juillet 1989), plus la
  // « première présentation » ; la clé `date_presentation` garde son nom. Question « acheté déjà loué » : exigée par l'assembleur en
  // location nue (vente, reprise). Les textes ci-dessous sont partagés avec l'écran du bail (generer-conge-bailleur.tsx).
  conge_bailleur:[
    {cle:"motif",libelle:"Motif du congé",choix:[{valeur:"vente",libelle:"Vente"},{valeur:"reprise",libelle:"Reprise"},{valeur:"motif_legitime",libelle:"Motif légitime et sérieux"}],aide:`Vente ou reprise : à faire relire avant de notifier (ADIL, avocat, commissaire de justice). ${CONGE_SANS_GARANTIE} ${CONGE_NOTICE_A_JOINDRE}`},
    {cle:"date_presentation",libelle:"Réception prévue par le locataire (aujourd’hui par défaut)",type:"date",facultatif:true,aide:`La date d’effet ne se saisit pas : c’est l’échéance du bail calculée pour cette date de réception (l’échéance suivante si le préavis n’y tient plus). ${CONGE_RECEPTION} Gerimmo ne notifie pas le congé : il se notifie à chaque locataire et colocataire individuellement ; la date de réception est ensuite à enregistrer sur la fiche du bail.`},
    {cle:"prix_vente",libelle:"Prix de vente proposé (€)",type:"montant",facultatif:true,si:siMotif("vente"),aide:"Obligatoire pour un logement loué nu : le congé pour vendre y vaut offre de vente au locataire, le PDF ne se génère pas sans lui. Facultatif en meublé."},
    {cle:"conditions_vente",libelle:"Conditions de la vente",facultatif:true,si:siMotif("vente"),aide:"Obligatoires pour un logement loué nu, comme le prix : le PDF ne se génère pas sans elles. Facultatives en meublé."},
    {cle:"achete_occupe",libelle:"Logement acheté alors qu’il était déjà loué ?",facultatif:true,si:siMotif("vente","reprise"),choix:[{valeur:"",libelle:"À préciser (obligatoire en location nue)"},{valeur:"non",libelle:"Non"},{valeur:"oui",libelle:"Oui"}],aide:CONGE_ACHETE_OCCUPE},
    {cle:"date_acquisition",libelle:"Date d’acquisition (seulement si le logement a été acheté déjà loué)",type:"date",facultatif:true,si:siMotif("vente","reprise")},
    {cle:"beneficiaire_nom",libelle:"Bénéficiaire de la reprise",si:siMotif("reprise"),aide:"Bailleur SCI familiale : le bénéficiaire est l’un des associés."},
    {cle:"beneficiaire_lien",libelle:"Lien avec le bailleur",si:siMotif("reprise")},
    {cle:"beneficiaire_adresse",libelle:"Adresse du bénéficiaire de la reprise",si:siMotif("reprise")},
    {cle:"raisons_reprise",libelle:"Raisons de la reprise",type:"textarea",si:siMotif("reprise")},
    {cle:"motif_detail",libelle:"Motif invoqué",type:"textarea",si:siMotif("motif_legitime")},
  ],
  inventaire_entree:[{cle:"date_constat",libelle:"Date du constat",type:"date"}],
  inventaire_sortie:[{cle:"date_constat",libelle:"Date du constat",type:"date"},{cle:"constat",libelle:"Constat du mobilier à la sortie",type:"textarea"}],
  // Phase 3 (C22) : le sortant se choisit parmi les titulaires du contrat commun (liste de l'écran ; l'assembleur refuse toute autre personne).
  avenant_remplacement:[{cle:"sortant",libelle:"Colocataire sortant",aide:"Choisissez l’un des titulaires du contrat commun."},{cle:"entrant",libelle:"Identité, adresse et état civil de l’entrant",aide:"Première ligne : Nom Prénom (repris dans le cadre de signature). Lignes suivantes : date et lieu de naissance, adresse.",type:"textarea"},effet,{cle:"depot",libelle:"Accord relatif au dépôt",type:"textarea"}],
  attestation_loyer:[{cle:"destinataire",libelle:"Destinataire"}],
  attestation_caf:[{cle:"destinataire",libelle:"Caisse destinataire"},{cle:"allocataire",libelle:"Numéro allocataire"}],
  regularisation_charges:[detailDepenses,consultationEtJustificatif],decompte_charges:[detailDepenses,consultationEtJustificatif],consultation_charges:[consultation],
  // Phase 3, lot 53 (W34) : la consigne d'envoi n'est plus imprimée dans la lettre ; elle reste ici, pour l'expéditeur.
  mise_en_demeure:[{cle:"delai",libelle:"Délai de règlement (jours)",type:"number",aide:"Gerimmo n’envoie pas ce PDF : ce courrier est à notifier avec preuve de réception."}],
  // Phase 3 (C65, C66, C74) : plus de nombre de mensualités ni de première échéance saisis ici. Le protocole reprend le plan
  // d'apurement enregistré sur le bail (tranches, tolérance, seuil de caducité, conditions) ; sans plan, il n'est pas produit.
  autorisation_travaux:[{cle:"travaux",libelle:"Travaux autorisés",type:"textarea"},{cle:"intervenant",libelle:"Intervenant"},{cle:"periode",libelle:"Période convenue"},{cle:"prise_en_charge",libelle:"Prise en charge et plafond",type:"textarea"},conditions],
  ordre_intervention:[{cle:"acces",libelle:"Accès et contact sur place",type:"textarea"}],
  cloture_mensuelle:[{cle:"mois",libelle:"Mois",type:"month"}],
  facture_honoraires:[{cle:"mois",libelle:"Mois facturé",type:"month",aide:"Un mois révolu. Le numéro de facture est attribué définitivement à l’émission."}],
  recap_fiscal_nu:[annee,{cle:"interets_emprunt",libelle:"Intérêts d’emprunt de l’année (€)",type:"montant",aide:"Prérempli avec le montant déjà qualifié en ligne 250 dans votre livre (modifiable). Si vous le modifiez, le PDF signale l’écart avec le livre. Indiquez 0 si le logement n’a aucun emprunt."}],recap_fiscal_meuble:[annee],recap_fiscal_agence:[annee],
  avenant_mandat:[effet,modifications],avenant_perimetre:[effet,modifications],
  resiliation_mandat:[effet,{cle:"motif",libelle:"Motif et fondement",type:"textarea"},{cle:"remise",libelle:"Remise du dossier et du solde",type:"textarea"}],
};
/** Le champ est-il demandé pour les choix courants ? `valeur(cle)` lit la valeur courante d'une liste de choix du formulaire. */
export function champVisible(c: ChampCatalogue, valeur: (cle: string) => string): boolean {
  return !c.si || c.si.valeurs.includes(valeur(c.si.cle));
}
/** Les options envoyées à la génération : les seuls champs demandés pour les choix faits, nettoyés de leurs espaces. */
export function optionsDuFormulaire(modeleId: string, lire: (cle: string) => string): Record<string, string> {
  return Object.fromEntries((OPTIONS_CATALOGUE[modeleId] ?? []).filter((c) => champVisible(c, lire)).map((c) => [c.cle, lire(c.cle).trim()]));
}
