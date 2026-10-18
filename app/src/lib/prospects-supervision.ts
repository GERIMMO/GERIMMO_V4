export const ETAPES_PROSPECT:Record<string,string>={nouveau:'Nouveau contact',qualifie:'Besoin qualifié',demonstration:'Démonstration / essai',offre:'Offre présentée',gagne:'Espace client ouvert',perdu:'Non converti'};
export type Prospect={id:string;nom:string;email:string;telephone:string|null;origine:string;demande_id:string|null;etape:string;responsable:string|null;prochaine_action:string|null;echeance:string|null;organisation_id:string|null;notes:string;revision:number};
export function lireProspect(f:FormData){const t=(k:string)=>String(f.get(k)??'').trim();const champs={nom:t('nom'),email:t('email').toLowerCase(),telephone:t('telephone')||null,origine:t('origine'),etape:t('etape'),responsable:t('responsable')||null,prochaine_action:t('prochaine_action')||null,echeance:t('echeance')||null,organisation_id:t('organisation_id')||null,notes:t('notes')};
 if(champs.nom.length<2||champs.nom.length>160||champs.origine.length<2||champs.origine.length>160||!/^\S+@\S+\.\S+$/.test(champs.email)||champs.email.length>254||(champs.telephone?.length??0)>50||champs.notes.length>4000||!Object.hasOwn(ETAPES_PROSPECT,champs.etape))return {erreur:'Vérifiez le nom, l’e-mail, l’origine et l’étape.'};
 if(champs.etape==='gagne'&&!champs.organisation_id)return {erreur:'Rattachez l’espace client réellement ouvert.'};
 if(champs.etape==='perdu'&&champs.notes.length<5)return {erreur:'Indiquez le motif de non-conversion dans les notes.'};
 if(!['gagne','perdu'].includes(champs.etape)&&(!champs.prochaine_action||champs.prochaine_action.length<3||!champs.echeance))return {erreur:'Précisez la prochaine action et sa date.'};
 if((champs.prochaine_action?.length??0)>1000)return {erreur:'La prochaine action est trop longue.'};
 if(champs.echeance&&(!/^\d{4}-\d{2}-\d{2}$/.test(champs.echeance)||!Number.isFinite(Date.parse(champs.echeance))||new Date(champs.echeance).toISOString().slice(0,10)!==champs.echeance))return {erreur:'Date de prochaine action invalide.'};
 for(const v of [champs.responsable,champs.organisation_id])if(v&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))return {erreur:'Sélectionnez un responsable ou un espace valide.'};
 return {champs};}
