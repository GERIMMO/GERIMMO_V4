export type ChampCatalogue = { cle: string; libelle: string; type?: "date" | "number" | "month" | "textarea"; aide?: string; choix?: {valeur:string;libelle:string}[] };
const conditions: ChampCatalogue = {cle:"conditions",libelle:"Conditions convenues",type:"textarea"};
const effet: ChampCatalogue = {cle:"date_effet",libelle:"Date d’effet",type:"date"};
const modifications: ChampCatalogue = {cle:"modifications",libelle:"Modifications convenues",type:"textarea"};
const annee: ChampCatalogue = {cle:"annee",libelle:"Année",type:"number"};
const consultation: ChampCatalogue = {cle:"consultation",libelle:"Consultation des justificatifs",type:"textarea",aide:"Lieu ou lien, horaires et personne à contacter."};
export const OPTIONS_CATALOGUE: Record<string, ChampCatalogue[]> = {
  avenant:[{cle:"objet",libelle:"Objet de l’avenant"},modifications],
  cautionnement:[{cle:"garant",libelle:"Garant du dossier",aide:"Choisissez un garant déjà rattaché au bail."},{cle:"forme",libelle:"Forme de caution",choix:[{valeur:"solidaire",libelle:"Solidaire"},{valeur:"simple",libelle:"Simple"}]},{cle:"montant_max",libelle:"Plafond de l’engagement (€)",type:"number"}],
  conge_bailleur:[{cle:"motif",libelle:"Motif du congé",choix:[{valeur:"reprise",libelle:"Reprise"},{valeur:"vente",libelle:"Vente"},{valeur:"motif_legitime",libelle:"Motif légitime et sérieux"}]},effet,{cle:"beneficiaire_nom",libelle:"Bénéficiaire de la reprise"},{cle:"beneficiaire_lien",libelle:"Lien avec le bailleur"},{cle:"motif_detail",libelle:"Motivation et justificatifs",type:"textarea"}],
  inventaire_entree:[{cle:"date_constat",libelle:"Date du constat",type:"date"}],
  inventaire_sortie:[{cle:"date_constat",libelle:"Date du constat",type:"date"},{cle:"constat",libelle:"Constat du mobilier à la sortie",type:"textarea"}],
  avenant_remplacement:[{cle:"sortant",libelle:"Colocataire sortant"},{cle:"entrant",libelle:"Identité et adresse de l’entrant",type:"textarea"},effet,{cle:"depot",libelle:"Accord relatif au dépôt",type:"textarea"}],
  bon_visite:[{cle:"visiteur",libelle:"Visiteur"},{cle:"contact",libelle:"Coordonnées du visiteur"},{cle:"rendez_vous",libelle:"Date et heure de visite"},{cle:"representant",libelle:"Personne ayant assuré la visite"}],
  attestation_loyer:[{cle:"destinataire",libelle:"Destinataire"}],
  attestation_caf:[{cle:"destinataire",libelle:"Caisse destinataire"},{cle:"allocataire",libelle:"Numéro allocataire"}],
  regularisation_charges:[consultation],decompte_charges:[consultation],consultation_charges:[consultation],
  mise_en_demeure:[{cle:"delai",libelle:"Délai de règlement (jours)",type:"number"}],
  protocole_apurement:[{cle:"mensualites",libelle:"Nombre de mensualités",type:"number"},{cle:"premiere_echeance",libelle:"Première échéance",type:"date"},conditions],
  autorisation_travaux:[{cle:"travaux",libelle:"Travaux autorisés",type:"textarea"},{cle:"intervenant",libelle:"Intervenant"},{cle:"periode",libelle:"Période convenue"},{cle:"prise_en_charge",libelle:"Prise en charge et plafond",type:"textarea"},conditions],
  ordre_intervention:[{cle:"acces",libelle:"Accès et contact sur place",type:"textarea"}],
  cloture_mensuelle:[{cle:"mois",libelle:"Mois",type:"month"}],
  recap_fiscal_nu:[annee],recap_fiscal_meuble:[annee],recap_fiscal_agence:[annee],
  avenant_mandat:[effet,modifications],avenant_perimetre:[effet,modifications],
  resiliation_mandat:[effet,{cle:"motif",libelle:"Motif et fondement",type:"textarea"},{cle:"remise",libelle:"Remise du dossier et du solde",type:"textarea"}],
};
