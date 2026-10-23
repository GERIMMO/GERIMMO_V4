export const ETAPES_PROSPECT:Record<string,string>={nouveau:'Nouveau contact',qualifie:'Besoin qualifié',demonstration:'Démonstration / essai',offre:'Offre présentée',gagne:'Espace client ouvert',perdu:'Non converti'};
// Plan de conformité du 23/10 (R45) : origine en liste fermée (contrainte supervision_prospects_origine_liste) et
// qualité du prospect. Particulier : sa fiche suit sa demande de contact ; professionnel : 36 mois après son dernier contact.
export const ORIGINES_PROSPECT:Record<string,string>={formulaire:'Formulaire de contact du site','échange direct':'Échange direct',recommandation:'Recommandation'};
export const QUALITES_PROSPECT:Record<string,string>={particulier:'Particulier',professionnel:'Professionnel (agence, artisan, entreprise)'};
export type Prospect={id:string;nom:string;email:string;telephone:string|null;origine:string;qualite:string;demande_id:string|null;etape:string;responsable:string|null;prochaine_action:string|null;echeance:string|null;organisation_id:string|null;notes:string;revision:number;oppose_le:string|null;dernier_contact_prospect_le:string|null};
export function lireProspect(f:FormData){const t=(k:string)=>String(f.get(k)??'').trim();const champs={nom:t('nom'),email:t('email').toLowerCase(),telephone:t('telephone')||null,origine:t('origine'),qualite:t('qualite'),etape:t('etape'),responsable:t('responsable')||null,prochaine_action:t('prochaine_action')||null,echeance:t('echeance')||null,organisation_id:t('organisation_id')||null,notes:t('notes')};
 if(champs.nom.length<2||champs.nom.length>160||!Object.hasOwn(ORIGINES_PROSPECT,champs.origine)||!Object.hasOwn(QUALITES_PROSPECT,champs.qualite)||!/^\S+@\S+\.\S+$/.test(champs.email)||champs.email.length>254||(champs.telephone?.length??0)>50||champs.notes.length>4000||!Object.hasOwn(ETAPES_PROSPECT,champs.etape))return {erreur:'Vérifiez le nom, l’e-mail, l’origine, la qualité et l’étape.'};
 if(champs.etape==='gagne'&&!champs.organisation_id)return {erreur:'Rattachez l’espace client réellement ouvert.'};
 if(champs.etape==='perdu'&&champs.notes.length<5)return {erreur:'Indiquez le motif de non-conversion dans les notes.'};
 if(!['gagne','perdu'].includes(champs.etape)&&(!champs.prochaine_action||champs.prochaine_action.length<3||!champs.echeance))return {erreur:'Précisez la prochaine action et sa date.'};
 if((champs.prochaine_action?.length??0)>1000)return {erreur:'La prochaine action est trop longue.'};
 if(champs.echeance&&(!/^\d{4}-\d{2}-\d{2}$/.test(champs.echeance)||!Number.isFinite(Date.parse(champs.echeance))||new Date(champs.echeance).toISOString().slice(0,10)!==champs.echeance))return {erreur:'Date de prochaine action invalide.'};
 for(const v of [champs.responsable,champs.organisation_id])if(v&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))return {erreur:'Sélectionnez un responsable ou un espace valide.'};
 return {champs};}
/** L'origine telle qu'elle se lit dans la mention du premier message. */
const ORIGINE_DANS_LA_MENTION:Record<string,string>={formulaire:'formulaire de contact du site','échange direct':'échange direct',recommandation:'recommandation'};
/**
 * La mention du premier message à un prospect (plan de conformité du 23/10, lot 1F, texte du plan). Gerimmo n'envoie
 * aucun message aux prospects : la console prépare ce texte, à placer dans le premier message, et le refuse après une
 * opposition (`controler_envoi_prospection`). Sans dénomination de l'éditeur saisie, rien n'est préparé.
 */
export function mentionPremierMessageProspect(p:{denomination:string|null|undefined;origine:string;lienConfidentialite:string}):string|null{
 const denomination=p.denomination?.trim();const origine=ORIGINE_DANS_LA_MENTION[p.origine];
 if(!denomination||!origine||!p.lienConfidentialite)return null;
 return `Vous recevez ce message de ${denomination}, éditeur de Gerimmo, parce que vous nous avez communiqué votre adresse (${origine}). Nous conservons vos coordonnées trois ans au plus après votre dernier contact. Pour ne plus recevoir de message, répondez simplement « Stop » : nous supprimons alors vos coordonnées dans le mois. Détails : ${p.lienConfidentialite}.`;
}
