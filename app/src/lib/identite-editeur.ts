import {CHAMPS_PRESTATAIRES,EDITEUR,TYPES_VENDEUR,estEntrepreneurIndividuel,porteLaMentionEI} from './editeur';
// Clé → libellé du formulaire de /admin/parametres : les treize faits d'éditeur, puis (19/10) la localisation et les
// coordonnées des prestataires. La base n'admet QUE ces clés (contrainte identite_champs_connus, liste fermée) : toute clé
// ajoutée ici demande une migration qui l'ajoute à la contrainte, appliquée AVANT le déploiement du code.
// Libellés COURTS (relecture D7R-07) : ils servent aussi au journal des modifications et au message de refus
// d'archivage, où les longues parenthèses d'aide ressortaient en minuscules. L'aide de saisie est dans AIDES_EDITEUR.
export const CHAMPS_EDITEUR:Record<string,string>={denomination:'Nom de l’éditeur',forme:'Forme juridique',capital:'Capital social (facultatif)',siege:'Adresse',rcs:'Immatriculation (RNE ou RCS)',siret:'SIRET',tvaIntracommunautaire:'TVA intracommunautaire (facultatif)',directeurPublication:'Directeur de publication',email:'E-mail de contact',telephone:'Téléphone de contact professionnel',mediateurNom:'Médiateur de la consommation',mediateurAdresse:'Adresse du médiateur',mediateurSite:'Site du médiateur',...CHAMPS_PRESTATAIRES,typeVendeur:'Type de vendeur'};
// Seconde reprise du 24/11/2026 (relectures T4R-03 et T4R-04) : `typeVendeur` est la vingt-sixième clé, ajoutée à la
// contrainte de la base par la migration 20261125106000 (à appliquer AVANT le code). Elle vient en dernier : les
// vingt-cinq premières restent celles, et dans l'ordre, de la migration 20261019123000.
/** Les choix du champ « Type de vendeur » (liste fermée) : valeur enregistrée → libellé. */
export const CHOIX_TYPE_VENDEUR:readonly (readonly [string,string])[]=Object.entries(TYPES_VENDEUR);
/** L'aide affichée sous le champ, dans le formulaire de /admin/parametres seulement. */
export const AIDES_EDITEUR:Record<string,string>={denomination:'Société : dénomination sociale. Entrepreneur individuel : nom et prénom, immédiatement précédés ou suivis de « EI » (par exemple « NOM Prénom EI »).',typeVendeur:'Ce choix décide de la mention « EI » et du capital ; il n’est pas affiché au public. Sans lui, les ventes restent fermées.',forme:'SAS, SARL… ou « Entrepreneur individuel » : affichée telle quelle aux mentions légales.',capital:'Sociétés seulement ; à laisser vide pour un entrepreneur individuel.',siege:'Siège de la société, ou adresse de l’entreprise individuelle.'};
/** Les champs saisis sur plusieurs lignes : les coordonnées (dénomination, adresse, téléphone). */
export const CHAMPS_MULTILIGNES=new Set(Object.keys(CHAMPS_PRESTATAIRES).filter(k=>k.startsWith('coordonnees')));
export function validerIdentite(f:FormData){const valeurs:Record<string,string|null>={};for(const k of Object.keys(CHAMPS_EDITEUR)){const v=String(f.get(k)??'').replace(/\r\n?/g,'\n').trim();if(v.length>1000)return {erreur:'Un champ dépasse 1 000 caractères.'};valeurs[k]=v||null;}
 if(valeurs.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeurs.email))return {erreur:'Vérifiez l’adresse e-mail.'};
 if(valeurs.siret&&!/^\d{14}$/.test(valeurs.siret.replace(/\s/g,'')))return {erreur:'Le SIRET doit comporter 14 chiffres.'};
 if(valeurs.mediateurSite){try{const u=new URL(valeurs.mediateurSite);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{return {erreur:'Le site du médiateur doit être une adresse HTTPS.'};}}
 const coordonneesMediateur=[valeurs.mediateurNom,valeurs.mediateurAdresse,valeurs.mediateurSite];
 if(coordonneesMediateur.some(Boolean)&&!coordonneesMediateur.every(Boolean))return {erreur:'Renseignez ensemble le nom, l’adresse postale et le site du médiateur désigné, ou laissez les trois champs vides.'};
 // Seconde reprise du 24/11/2026 (T4R-03) : le type de vendeur se choisit dans une liste ; toute autre valeur est refusée.
 if(valeurs.typeVendeur&&!Object.hasOwn(TYPES_VENDEUR,valeurs.typeVendeur))return {erreur:'Choisissez le type de vendeur dans la liste : entrepreneur individuel, ou société ou autre personne morale.'};
 // Décision du dirigeant du 24/11/2026 (Q7) : le vendeur est un entrepreneur individuel. Code de commerce, article
 // R. 526-27 (recueil fourni par le dirigeant le 24/11/2026) : la dénomination incorpore le nom « précédé ou suivi
 // immédiatement des mots : “ entrepreneur individuel ” ou des initiales : “ EI ” » ; mêmes mentions dans les fiches
 // officielles F37351 et F31808 d'Entreprendre Service Public, lues le 24/11/2026. Le nom saisi est repris seul dans
 // les conditions, les courriers et le formulaire de rétractation : la mention doit donc y figurer. Un entrepreneur
 // individuel n'a pas de capital social. Le contrôle suit le TYPE CHOISI, jamais le texte libre de la forme juridique.
 if(estEntrepreneurIndividuel(valeurs)){
  if(valeurs.denomination&&!porteLaMentionEI(valeurs.denomination))return {erreur:'Vous avez choisi le type « Entrepreneur individuel » : écrivez le nom et le prénom immédiatement précédés ou suivis de « EI » ou de « entrepreneur individuel » (par exemple « NOM Prénom EI »).'};
  if(valeurs.capital)return {erreur:'Un entrepreneur individuel n’a pas de capital social : laissez ce champ vide.'};
 }
 return {valeurs};}
/**
 * L'identité telle que les pages légales l'affichent : les faits du code, recouverts par les valeurs saisies pour les
 * seules clés connues (texte ou vide). Une seule fusion pour la lecture des pages (lireEditeur) et pour l'identité
 * figée avec une version archivée des conditions (24/10) : l'archive dit ce que la page montrait.
 */
export function identiteDepuisValeurs(valeurs:unknown):Record<string,string|null>{
 const editeur:Record<string,string|null>={...EDITEUR};
 if(valeurs&&typeof valeurs==='object')for(const k of Object.keys(CHAMPS_EDITEUR)){const v=(valeurs as Record<string,unknown>)[k];if(typeof v==='string'||v===null)editeur[k]=v;}
 return editeur;
}
