import { CERTIFICATION_SANS_GARANTIE_CUMULEE } from "@/lib/textes-signature-actes";

// `montant` : un montant en euros saisi en texte décimal (« 2345,67 »), lu par `lireMontantFacultatif` côté serveur ; jamais `type="number"`,
// dont la virgule est lue comme un séparateur de milliers par un navigateur non francophone (VER-TS-02).
// `repli: "detail_enregistre"` : le champ n'est pas obligatoire quand le dossier choisi porte déjà cette information (D39).
// `case` : une case à cocher obligatoire ; cochée, l'option vaut « oui » (constat R30 du 23/10, acte de cautionnement).
export type ChampCatalogue = { cle: string; libelle: string; type?: "date" | "number" | "month" | "textarea" | "montant" | "case"; aide?: string; choix?: {valeur:string;libelle:string}[]; repli?: "detail_enregistre" };
const conditions: ChampCatalogue = {cle:"conditions",libelle:"Conditions convenues",type:"textarea"};
const effet: ChampCatalogue = {cle:"date_effet",libelle:"Date d’effet",type:"date"};
const modifications: ChampCatalogue = {cle:"modifications",libelle:"Modifications convenues",type:"textarea"};
const annee: ChampCatalogue = {cle:"annee",libelle:"Année",type:"number"};
const consultation: ChampCatalogue = {cle:"consultation",libelle:"Consultation des justificatifs",type:"textarea",aide:"Lieu ou lien, horaires et personne à contacter."};
// D39 (CHF-03) : saisi à la génération du document ; la régularisation émise ne se modifie pas et n'est pas touchée.
const detailDepenses: ChampCatalogue = {cle:"detail_depenses",libelle:"Détail des dépenses par nature et clé de répartition",type:"textarea",repli:"detail_enregistre",aide:"Chaque nature de charges (eau, chauffage, ascenseur, entretien…) avec son montant et la clé de répartition retenue (tantièmes, surface, consommation…). Ce détail n’est écrit que dans ce document : la régularisation déjà enregistrée n’est pas modifiée."};
export const OPTIONS_CATALOGUE: Record<string, ChampCatalogue[]> = {
  avenant:[{cle:"objet",libelle:"Objet de l’avenant"},modifications],
  cautionnement:[{cle:"garant",libelle:"Garant du dossier",aide:"Choisissez un garant déjà rattaché au bail."},{cle:"forme",libelle:"Forme de caution",choix:[{valeur:"solidaire",libelle:"Solidaire"},{valeur:"simple",libelle:"Simple"}]},{cle:"montant_max",libelle:"Plafond de l’engagement (€)",type:"montant"},{cle:"sans_garantie_cumulee",libelle:CERTIFICATION_SANS_GARANTIE_CUMULEE,type:"case"}],
  conge_bailleur:[{cle:"motif",libelle:"Motif du congé",choix:[{valeur:"reprise",libelle:"Reprise"},{valeur:"vente",libelle:"Vente"},{valeur:"motif_legitime",libelle:"Motif légitime et sérieux"}]},effet,{cle:"beneficiaire_nom",libelle:"Bénéficiaire de la reprise"},{cle:"beneficiaire_lien",libelle:"Lien avec le bailleur"},{cle:"motif_detail",libelle:"Motivation et justificatifs",type:"textarea"}],
  inventaire_entree:[{cle:"date_constat",libelle:"Date du constat",type:"date"}],
  inventaire_sortie:[{cle:"date_constat",libelle:"Date du constat",type:"date"},{cle:"constat",libelle:"Constat du mobilier à la sortie",type:"textarea"}],
  avenant_remplacement:[{cle:"sortant",libelle:"Colocataire sortant"},{cle:"entrant",libelle:"Identité et adresse de l’entrant",type:"textarea"},effet,{cle:"depot",libelle:"Accord relatif au dépôt",type:"textarea"}],
  attestation_loyer:[{cle:"destinataire",libelle:"Destinataire"}],
  attestation_caf:[{cle:"destinataire",libelle:"Caisse destinataire"},{cle:"allocataire",libelle:"Numéro allocataire"}],
  regularisation_charges:[detailDepenses,consultation],decompte_charges:[detailDepenses,consultation],consultation_charges:[consultation],
  mise_en_demeure:[{cle:"delai",libelle:"Délai de règlement (jours)",type:"number"}],
  protocole_apurement:[{cle:"mensualites",libelle:"Nombre de mensualités",type:"number"},{cle:"premiere_echeance",libelle:"Première échéance",type:"date"},conditions],
  autorisation_travaux:[{cle:"travaux",libelle:"Travaux autorisés",type:"textarea"},{cle:"intervenant",libelle:"Intervenant"},{cle:"periode",libelle:"Période convenue"},{cle:"prise_en_charge",libelle:"Prise en charge et plafond",type:"textarea"},conditions],
  ordre_intervention:[{cle:"acces",libelle:"Accès et contact sur place",type:"textarea"}],
  cloture_mensuelle:[{cle:"mois",libelle:"Mois",type:"month"}],
  facture_honoraires:[{cle:"mois",libelle:"Mois facturé",type:"month",aide:"Un mois révolu. Le numéro de facture est attribué définitivement à l’émission."}],
  recap_fiscal_nu:[annee,{cle:"interets_emprunt",libelle:"Intérêts d’emprunt de l’année (€)",type:"montant",aide:"Prérempli avec le montant déjà qualifié en ligne 250 dans votre livre (modifiable). Si vous le modifiez, le PDF signale l’écart avec le livre. Indiquez 0 si le logement n’a aucun emprunt."}],recap_fiscal_meuble:[annee],recap_fiscal_agence:[annee],
  avenant_mandat:[effet,modifications],avenant_perimetre:[effet,modifications],
  resiliation_mandat:[effet,{cle:"motif",libelle:"Motif et fondement",type:"textarea"},{cle:"remise",libelle:"Remise du dossier et du solde",type:"textarea"}],
};
