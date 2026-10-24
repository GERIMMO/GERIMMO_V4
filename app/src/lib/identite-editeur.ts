import {CHAMPS_PRESTATAIRES,EDITEUR} from './editeur';
// Clé → libellé du formulaire de /admin/parametres : les treize faits d'éditeur, puis (19/10) la localisation et les
// coordonnées des prestataires. La base n'admet QUE ces clés (contrainte identite_champs_connus, liste fermée) : toute clé
// ajoutée ici demande une migration qui l'ajoute à la contrainte, appliquée AVANT le déploiement du code.
export const CHAMPS_EDITEUR:Record<string,string>={denomination:'Dénomination sociale',forme:'Forme juridique',capital:'Capital social (facultatif)',siege:'Adresse du siège',rcs:'Immatriculation (RNE ou RCS)',siret:'SIRET',tvaIntracommunautaire:'TVA intracommunautaire (facultatif)',directeurPublication:'Directeur de publication',email:'E-mail de contact',telephone:'Téléphone de contact professionnel',mediateurNom:'Médiateur de la consommation',mediateurAdresse:'Adresse du médiateur',mediateurSite:'Site du médiateur',...CHAMPS_PRESTATAIRES};
/** Les champs saisis sur plusieurs lignes : les coordonnées (dénomination, adresse, téléphone). */
export const CHAMPS_MULTILIGNES=new Set(Object.keys(CHAMPS_PRESTATAIRES).filter(k=>k.startsWith('coordonnees')));
export function validerIdentite(f:FormData){const valeurs:Record<string,string|null>={};for(const k of Object.keys(CHAMPS_EDITEUR)){const v=String(f.get(k)??'').replace(/\r\n?/g,'\n').trim();if(v.length>1000)return {erreur:'Un champ dépasse 1 000 caractères.'};valeurs[k]=v||null;}
 if(valeurs.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeurs.email))return {erreur:'Vérifiez l’adresse e-mail.'};
 if(valeurs.siret&&!/^\d{14}$/.test(valeurs.siret.replace(/\s/g,'')))return {erreur:'Le SIRET doit comporter 14 chiffres.'};
 if(valeurs.mediateurSite){try{const u=new URL(valeurs.mediateurSite);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{return {erreur:'Le site du médiateur doit être une adresse HTTPS.'};}}
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
