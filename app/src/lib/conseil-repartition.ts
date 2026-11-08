import { fluideCompatible } from './compteurs-facture';
export function methodeConseillee(categorie:string,lots:{id:string}[],compteurs:{lot_id:string|null;type:string;date_index_initial:string}[],debut:string,precedente?:string) {
 const mesure=['eau','electricite_commune','gaz','chauffage'].includes(categorie);
 if(precedente==='consommations' && mesure) return 'consommations';
 if(precedente==='cle') return 'cle';
 if(lots.length>1 && mesure && lots.every(l=>compteurs.some(m=>m.lot_id===l.id && m.date_index_initial<=debut && fluideCompatible(m.type,categorie)))) return 'consommations';
 return 'cle';
}

/** Conseils informatifs pour les baux d'habitation ; ne remplacent pas les contrôles du calcul. */
export const CONSEILS_FACTURE = {
 eau: "L’eau consommée et certains frais d’exploitation sont récupérables selon le bail. Les réparations importantes et les dépenses étrangères à l’usage des occupants restent à distinguer.",
 electricite_commune: "L’électricité utilisée dans les parties communes peut être récupérable. Répartissez-la entre les logements concernés avec la clé applicable, sans inclure l’électricité privative.",
 electricite_privative: "L’électricité consommée dans le logement relève normalement du contrat souscrit par le locataire. Gerimmo ne la refacture pas automatiquement : distinguez-la de l’électricité des parties communes.",
 gaz: "Pour une installation collective, le gaz destiné au chauffage ou à l’eau chaude peut entrer dans les charges récupérables. Un contrat individuel payé directement par le locataire ne doit pas être facturé une seconde fois.",
 chauffage: "L’énergie et l’entretien courant du chauffage collectif peuvent être récupérables. Respectez les règles d’individualisation applicables ; le remplacement d’une installation et les gros travaux ne sont pas de simples charges locatives.",
 internet: "Un abonnement Internet ou Wi-Fi commun ne devient pas une charge récupérable du seul fait qu’il profite aux occupants. Gerimmo conserve cette dépense au propriétaire sans créer de remboursement automatique.",
 assurance: "L’assurance du propriétaire ou de l’immeuble n’est pas une charge locative ordinaire à répartir. Gerimmo exclut sa refacturation automatique. Une assurance souscrite pour le compte du locataire relève d’une procédure distincte.",
 entretien: "Seuls les postes d’entretien courant et les menues réparations prévus dans les charges récupérables sont concernés. Vérifiez le détail de la prestation : rénovation, remplacement et gros travaux restent à distinguer.",
 teom: "La taxe d’enlèvement des ordures ménagères peut être récupérée selon l’occupation. Isolez-la de la taxe foncière et excluez les frais de gestion de la fiscalité locale.",
 autre: "La catégorie seule ne permet pas de décider qui doit payer. Précisez la nature de la dépense et vérifiez le bail et les charges récupérables. Gerimmo ne crée aucun remboursement automatique pour une dépense non identifiée.",
} satisfies Record<keyof typeof import('./consommations').CATEGORIES_FOURNITURE,string>;

export function conseilFacture(categorie:string) {
 return Object.prototype.hasOwnProperty.call(CONSEILS_FACTURE,categorie)
  ? CONSEILS_FACTURE[categorie as keyof typeof CONSEILS_FACTURE] : CONSEILS_FACTURE.autre;
}

export type BailPourConseil = {
 lot_id?:string; mode_charges?:string|null; date_debut?:string; date_fin?:string|null; etat?:string;
};
/** Une présélection ne vaut jamais créance : le calcul serveur filtre chaque bail. */
export function recuperationConseillee(categorie:string,lots:{id:string}[],baux:BailPourConseil[],debut:string,fin:string) {
 const concernes=baux.filter(b=>lots.some(l=>l.id===b.lot_id) && !!b.date_debut && b.date_debut<=fin && (!b.date_fin||b.date_fin>=debut) && ['actif','preavis','termine'].includes(b.etat ?? ''));
 const eligibles=concernes.filter(b=>['provision','provisions'].includes(b.mode_charges ?? ''));
 const forfaits=concernes.filter(b=>b.mode_charges==='forfait').length;
 const inconnus=concernes.length-eligibles.length-forfaits;
 const exclus=['electricite_privative','internet','assurance','autre'].includes(categorie);
 const automatique=['eau','electricite_commune','gaz','chauffage','teom'].includes(categorie);
 const coche=automatique && eligibles.length>0;
 const motif=exclus ? 'Aucune récupération automatique pour cette catégorie.'
  : !concernes.length ? 'Aucun bail ne couvre cette période : la dépense reste au propriétaire.'
  : !eligibles.length ? (inconnus ? 'Le mode de charges des baux doit être renseigné avant toute récupération.' : 'Les baux concernés sont au forfait : aucun complément de charges à réclamer.')
  : !automatique ? 'La nature précise de la prestation doit être confirmée avant de la récupérer.'
  : `Part récupérable présélectionnée pour ${eligibles.length} ${eligibles.length>1?'baux':'bail'} avec provisions.${forfaits?' Les baux au forfait restent exclus.':''}${inconnus?' Les baux sans mode de charges confirmé restent exclus.':''}`;
 return {coche,motif,eligibles:eligibles.length,forfaits,inconnus};
}
