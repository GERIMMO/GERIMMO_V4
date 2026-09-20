// Catalogue fonctionnel : modèles existants, variantes métier et compléments identifiés.
// Les numéros des anciennes épreuves ne sont pas réattribués aux modèles ajoutés.
export type CibleCatalogue = "bail" | "lot" | "appel" | "quittance" | "depot" | "revision" | "attestation" | "edl" | "regularisation" | "incident" | "intervention" | "ecriture" | "mandat" | "rapport" | "organisation";
export type EntreeCatalogue = { id: string; nom: string; famille: string; cible: CibleCatalogue; description: string; priorite: "P1" | "P2"; code: string };
export const CATALOGUE_DOCUMENTS: EntreeCatalogue[] = [
  {
    "id": "bail_nu",
    "nom": "Bail nu",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Contrat de résidence principale, à partir du brouillon.",
    "priorite": "P1",
    "code": "bail_nu"
  },
  {
    "id": "bail_meuble",
    "nom": "Bail meublé",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Contrat et inventaire du mobilier du bail.",
    "priorite": "P1",
    "code": "bail_meuble"
  },
  {
    "id": "bail_colocation",
    "nom": "Colocation · contrat commun",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Un contrat signé par tous les colocataires.",
    "priorite": "P1",
    "code": "bail_colocation"
  },
  {
    "id": "bail_individuel",
    "nom": "Colocation · contrat individuel",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Chambre privative, espaces partagés et conditions individuelles.",
    "priorite": "P1",
    "code": "bail_individuel"
  },
  {
    "id": "notice",
    "nom": "Notice d’information",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Droits et obligations à remettre avec le bail.",
    "priorite": "P1",
    "code": "notice"
  },
  {
    "id": "avenant",
    "nom": "Avenant au bail",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Acte des parties pour les seules modifications convenues.",
    "priorite": "P1",
    "code": "avenant"
  },
  {
    "id": "cautionnement",
    "nom": "Acte de cautionnement",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Engagement nominatif du garant déjà rattaché au bail.",
    "priorite": "P1",
    "code": "cautionnement"
  },
  {
    "id": "avis_echeance",
    "nom": "Avis d’échéance",
    "famille": "Loyers et paiements",
    "cible": "appel",
    "description": "Montant du terme appelé et modalités de paiement.",
    "priorite": "P1",
    "code": "avis_echeance"
  },
  {
    "id": "quittance",
    "nom": "Quittance de loyer",
    "famille": "Loyers et paiements",
    "cible": "quittance",
    "description": "Réservée à un terme intégralement réglé.",
    "priorite": "P1",
    "code": "quittance"
  },
  {
    "id": "recu_partiel",
    "nom": "Reçu de paiement partiel",
    "famille": "Loyers et paiements",
    "cible": "quittance",
    "description": "Reçu enregistré pour un terme non soldé.",
    "priorite": "P1",
    "code": "quittance"
  },
  {
    "id": "recu_depot",
    "nom": "Reçu du dépôt de garantie",
    "famille": "Loyers et paiements",
    "cible": "depot",
    "description": "Versement de dépôt effectivement enregistré.",
    "priorite": "P1",
    "code": "recu_depot"
  },
  {
    "id": "revision_irl",
    "nom": "Notification de révision IRL",
    "famille": "Loyers et paiements",
    "cible": "revision",
    "description": "Révision enregistrée et nouvel indice applicable.",
    "priorite": "P1",
    "code": "revision_irl"
  },
  {
    "id": "prorata",
    "nom": "Décompte du prorata",
    "famille": "Loyers et paiements",
    "cible": "appel",
    "description": "Terme calculé au prorata de l’entrée ou de la sortie.",
    "priorite": "P1",
    "code": "prorata"
  },
  {
    "id": "rappel_assurance",
    "nom": "Rappel d’assurance",
    "famille": "Entrée et contrat",
    "cible": "attestation",
    "description": "Attestation à renouveler et échéance de couverture.",
    "priorite": "P1",
    "code": "rappel_assurance"
  },
  {
    "id": "edl_entree",
    "nom": "État des lieux d’entrée",
    "famille": "États des lieux",
    "cible": "edl",
    "description": "Constat issu de la grille, des compteurs et des clés.",
    "priorite": "P1",
    "code": "edl"
  },
  {
    "id": "edl_sortie",
    "nom": "État des lieux de sortie",
    "famille": "États des lieux",
    "cible": "edl",
    "description": "Constat de sortie et comparaison avec l’entrée.",
    "priorite": "P1",
    "code": "edl"
  },
  {
    "id": "decompte_restitution",
    "nom": "Solde et restitution du dépôt",
    "famille": "Départ et dépôt",
    "cible": "bail",
    "description": "Dépôt, retenues et solde issus de la restitution enregistrée.",
    "priorite": "P1",
    "code": "decompte_restitution"
  },
  {
    "id": "conge_bailleur",
    "nom": "Congé donné par le bailleur",
    "famille": "Départ et dépôt",
    "cible": "bail",
    "description": "Préparation du congé motivé pour un contrat en cours.",
    "priorite": "P1",
    "code": "conge_bailleur"
  },
  {
    "id": "bordereau_ddt",
    "nom": "Bordereau des diagnostics",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Liste des diagnostics et de leurs justificatifs à annexer.",
    "priorite": "P1",
    "code": "bordereau_ddt"
  },
  {
    "id": "inventaire_entree",
    "nom": "Inventaire du mobilier à l’entrée",
    "famille": "États des lieux",
    "cible": "bail",
    "description": "Mobilier enregistré pour ce contrat et espaces concernés.",
    "priorite": "P1",
    "code": "inventaire_entree"
  },
  {
    "id": "inventaire_sortie",
    "nom": "Inventaire du mobilier à la sortie",
    "famille": "États des lieux",
    "cible": "bail",
    "description": "Inventaire de référence et constat contradictoire à compléter.",
    "priorite": "P1",
    "code": "inventaire_sortie"
  },
  {
    "id": "avenant_remplacement",
    "nom": "Avenant de remplacement en colocation",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Départ et arrivée nominatifs dans un contrat commun.",
    "priorite": "P1",
    "code": "avenant_remplacement"
  },
  {
    "id": "liste_dossier",
    "nom": "Liste des pièces du dossier",
    "famille": "Entrée et contrat",
    "cible": "bail",
    "description": "Pièces demandées au locataire retenu et statut des dépôts.",
    "priorite": "P1",
    "code": "liste_dossier"
  },
  {
    "id": "attestation_loyer",
    "nom": "Attestation de loyer",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Loyer contractuel, adresse et identité de l’occupant.",
    "priorite": "P1",
    "code": "attestation_loyer"
  },
  {
    "id": "attestation_caf",
    "nom": "Dossier de préparation CAF / MSA",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Données du bail pour compléter l’attestation officielle de loyer.",
    "priorite": "P1",
    "code": "attestation_caf"
  },
  {
    "id": "regularisation_charges",
    "nom": "Courrier de régularisation des charges",
    "famille": "Charges",
    "cible": "regularisation",
    "description": "Provisions, dépenses réelles et écart de l’exercice enregistré.",
    "priorite": "P1",
    "code": "regularisation_charges"
  },
  {
    "id": "decompte_charges",
    "nom": "Décompte annuel des charges",
    "famille": "Charges",
    "cible": "regularisation",
    "description": "Détail des montants, de la répartition et du justificatif.",
    "priorite": "P1",
    "code": "decompte_charges"
  },
  {
    "id": "consultation_charges",
    "nom": "Consultation des justificatifs de charges",
    "famille": "Charges",
    "cible": "regularisation",
    "description": "Modalités de consultation des pièces de la régularisation.",
    "priorite": "P1",
    "code": "consultation_charges"
  },
  {
    "id": "relance_simple",
    "nom": "Relance amiable de loyer",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Solde échu actualisé et invitation à régulariser.",
    "priorite": "P1",
    "code": "relance_simple"
  },
  {
    "id": "seconde_relance",
    "nom": "Seconde relance de loyer",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Rappel des échéances restant dues et de la première relance.",
    "priorite": "P1",
    "code": "seconde_relance"
  },
  {
    "id": "mise_en_demeure",
    "nom": "Mise en demeure de payer",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Courrier à notifier avec le décompte exact des termes échus.",
    "priorite": "P1",
    "code": "mise_en_demeure"
  },
  {
    "id": "situation_dette",
    "nom": "Situation du compte locataire",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Échéances appelées, couvertes et restant dues.",
    "priorite": "P1",
    "code": "situation_dette"
  },
  {
    "id": "protocole_apurement",
    "nom": "Protocole d’apurement",
    "famille": "Loyers et paiements",
    "cible": "bail",
    "description": "Projet d’accord et échéancier calculé sur la dette constatée.",
    "priorite": "P1",
    "code": "protocole_apurement"
  },
  {
    "id": "accuse_conge",
    "nom": "Accusé de réception du congé",
    "famille": "Départ et dépôt",
    "cible": "bail",
    "description": "Dates du congé enregistré et étapes de sortie.",
    "priorite": "P1",
    "code": "accuse_conge"
  },
  {
    "id": "restitution_cles",
    "nom": "Bordereau de remise des clés",
    "famille": "Départ et dépôt",
    "cible": "edl",
    "description": "Clés, références et quantités issues de l’état des lieux.",
    "priorite": "P1",
    "code": "restitution_cles"
  },
  {
    "id": "decompte_retenues",
    "nom": "Décompte des retenues",
    "famille": "Départ et dépôt",
    "cible": "bail",
    "description": "Retenues justifiées et vétusté du dossier de restitution.",
    "priorite": "P1",
    "code": "decompte_retenues"
  },
  {
    "id": "attestation_fin_bail",
    "nom": "Attestation de fin de bail",
    "famille": "Départ et dépôt",
    "cible": "bail",
    "description": "Fin d’un contrat effectivement clôturé.",
    "priorite": "P1",
    "code": "attestation_fin_bail"
  },
  {
    "id": "autorisation_travaux",
    "nom": "Autorisation de travaux",
    "famille": "Incidents et travaux",
    "cible": "bail",
    "description": "Nature, conditions, responsabilité et prise en charge convenues.",
    "priorite": "P1",
    "code": "autorisation_travaux"
  },
  {
    "id": "ordre_intervention",
    "nom": "Ordre d’intervention",
    "famille": "Incidents et travaux",
    "cible": "intervention",
    "description": "Mission confiée à l’artisan, accès et dates enregistrés.",
    "priorite": "P1",
    "code": "ordre_intervention"
  },
  {
    "id": "comparatif_devis",
    "nom": "Comparatif des devis",
    "famille": "Incidents et travaux",
    "cible": "incident",
    "description": "Offres déposées pour le même incident et décision enregistrée.",
    "priorite": "P1",
    "code": "comparatif_devis"
  },
  {
    "id": "compte_rendu_intervention",
    "nom": "Compte rendu d’intervention",
    "famille": "Incidents et travaux",
    "cible": "intervention",
    "description": "Travaux et montant final déclarés par l’artisan.",
    "priorite": "P1",
    "code": "compte_rendu_intervention"
  },
  {
    "id": "recap_incident",
    "nom": "Récapitulatif d’incident",
    "famille": "Incidents et travaux",
    "cible": "incident",
    "description": "Signalement, suivi, décisions et clôture du dossier.",
    "priorite": "P1",
    "code": "recap_incident"
  },
  {
    "id": "cloture_mensuelle",
    "nom": "Journal de clôture mensuelle",
    "famille": "Gestion et fiscalité",
    "cible": "organisation",
    "description": "Écritures du mois et état de la clôture de gestion.",
    "priorite": "P1",
    "code": "cloture_mensuelle"
  },
  {
    "id": "ecriture_rectificative",
    "nom": "Justificatif d’écriture rectificative",
    "famille": "Gestion et fiscalité",
    "cible": "ecriture",
    "description": "Contre-écriture et référence de la pièce corrigée.",
    "priorite": "P1",
    "code": "ecriture_rectificative"
  },
  {
    "id": "recap_fiscal_nu",
    "nom": "Récapitulatif annuel · location nue",
    "famille": "Gestion et fiscalité",
    "cible": "lot",
    "description": "Revenus et dépenses du lot pour préparer la déclaration.",
    "priorite": "P1",
    "code": "recap_fiscal_nu"
  },
  {
    "id": "recap_fiscal_meuble",
    "nom": "Récapitulatif annuel · meublé",
    "famille": "Gestion et fiscalité",
    "cible": "lot",
    "description": "Recettes et dépenses du meublé à transmettre au comptable.",
    "priorite": "P1",
    "code": "recap_fiscal_meuble"
  },
  {
    "id": "mandat_gestion",
    "nom": "Mandat de gestion",
    "famille": "Mandats et agence",
    "cible": "mandat",
    "description": "Lots confiés, pouvoirs, durée et rémunération.",
    "priorite": "P2",
    "code": "mandat_gestion"
  },
  {
    "id": "avenant_mandat",
    "nom": "Avenant aux conditions du mandat",
    "famille": "Mandats et agence",
    "cible": "mandat",
    "description": "Conditions convenues entre le mandant et l’agence.",
    "priorite": "P2",
    "code": "avenant_mandat"
  },
  {
    "id": "avenant_perimetre",
    "nom": "Avenant au périmètre de gestion",
    "famille": "Mandats et agence",
    "cible": "mandat",
    "description": "Lots confiés et changements de périmètre convenus.",
    "priorite": "P2",
    "code": "avenant_perimetre"
  },
  {
    "id": "rapport_gestion",
    "nom": "Rapport de gestion",
    "famille": "Mandats et agence",
    "cible": "rapport",
    "description": "Rapport mensuel enregistré, net et versement.",
    "priorite": "P2",
    "code": "rapport_gestion"
  },
  {
    "id": "bordereau_versement",
    "nom": "Bordereau de versement au mandant",
    "famille": "Mandats et agence",
    "cible": "rapport",
    "description": "Versement effectivement renseigné sur un rapport.",
    "priorite": "P2",
    "code": "bordereau_versement"
  },
  {
    "id": "facture_honoraires",
    "nom": "Facture d’honoraires",
    "famille": "Mandats et agence",
    "cible": "mandat",
    "description": "Honoraires du mois inscrits au journal, numérotés et facturés au mandant.",
    "priorite": "P2",
    "code": "facture_honoraires"
  },
  {
    "id": "resiliation_mandat",
    "nom": "Résiliation du mandat",
    "famille": "Mandats et agence",
    "cible": "mandat",
    "description": "Dates, motif et remise du dossier de gestion.",
    "priorite": "P2",
    "code": "resiliation_mandat"
  },
  {
    "id": "recap_fiscal_agence",
    "nom": "Récapitulatif annuel du mandant",
    "famille": "Mandats et agence",
    "cible": "mandat",
    "description": "Mouvements de gestion de l’année pour le propriétaire.",
    "priorite": "P2",
    "code": "recap_fiscal_agence"
  }
];
