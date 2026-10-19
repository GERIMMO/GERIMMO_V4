import {CHAMPS_PRESTATAIRES} from './editeur';
// Clé → libellé du formulaire de /admin/parametres : les treize faits d'éditeur, puis (19/10) la localisation et les
// coordonnées des prestataires. La base n'admet QUE ces clés (contrainte identite_champs_connus, liste fermée) : toute clé
// ajoutée ici demande une migration qui l'ajoute à la contrainte, appliquée AVANT le déploiement du code.
export const CHAMPS_EDITEUR:Record<string,string>={denomination:'Dénomination sociale',forme:'Forme juridique',capital:'Capital social (facultatif)',siege:'Adresse du siège',rcs:'Immatriculation au RCS',siret:'SIRET',tvaIntracommunautaire:'TVA intracommunautaire (facultatif)',directeurPublication:'Directeur de publication',email:'E-mail de contact',telephone:'Téléphone (facultatif)',mediateurNom:'Médiateur de la consommation',mediateurAdresse:'Adresse du médiateur',mediateurSite:'Site du médiateur',...CHAMPS_PRESTATAIRES};
/** Les champs saisis sur plusieurs lignes : les coordonnées (dénomination, adresse, téléphone). */
export const CHAMPS_MULTILIGNES=new Set(Object.keys(CHAMPS_PRESTATAIRES).filter(k=>k.startsWith('coordonnees')));
export function validerIdentite(f:FormData){const valeurs:Record<string,string|null>={};for(const k of Object.keys(CHAMPS_EDITEUR)){const v=String(f.get(k)??'').replace(/\r\n?/g,'\n').trim();if(v.length>1000)return {erreur:'Un champ dépasse 1 000 caractères.'};valeurs[k]=v||null;}
 if(valeurs.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeurs.email))return {erreur:'Vérifiez l’adresse e-mail.'};
 if(valeurs.siret&&!/^\d{14}$/.test(valeurs.siret.replace(/\s/g,'')))return {erreur:'Le SIRET doit comporter 14 chiffres.'};
 if(valeurs.mediateurSite){try{const u=new URL(valeurs.mediateurSite);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{return {erreur:'Le site du médiateur doit être une adresse HTTPS.'};}}
 return {valeurs};}
