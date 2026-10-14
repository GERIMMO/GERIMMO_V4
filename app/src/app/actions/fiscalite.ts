"use server";
import {revalidatePath} from 'next/cache';
import {verifierGerant} from '@/lib/ged-acces';
import {sansJargon} from '@/lib/erreurs';
import {lireMontantFacultatif} from '@/lib/saisie-montant';
import {estFondsTravauxAlur} from '@/lib/fiscal';
export type EtatFiscal={erreur?:string;succes?:string};
const texte=(f:FormData,k:string)=>String(f.get(k)??'').trim();
const nombreOptionnel=(f:FormData,k:string)=>texte(f,k)===''?null:Number(texte(f,k).replace(',','.'));
// Les champs en euros sont du texte (virgule ou point, cf. lireMontant) : un texte illisible se refuse, il ne devient pas « à compléter ».
const montantOptionnel=(f:FormData,k:string,nom:string)=>{const lu=lireMontantFacultatif(f.get(k));return 'erreur' in lu?{erreur:`${nom} : ${lu.erreur.charAt(0).toLowerCase()}${lu.erreur.slice(1)}`}:lu;};
async function acces(orgId:string){const a=await verifierGerant(orgId);return {...a,autorise:!!a.user&&a.role==='proprietaire_direct'};}
function actualiser(orgId:string){revalidatePath(`/agence/${orgId}/comptabilite/fiscal`);revalidatePath(`/agence/${orgId}/loyers`);}
export async function qualifierPieceFiscale(orgId:string,ecritureId:string,_etat:EtatFiscal,f:FormData):Promise<EtatFiscal>{
 const {supabase,autorise}=await acces(orgId);if(!autorise)return{erreur:'Accès refusé.'};
 if(texte(f,'confirme')!=='oui')return{erreur:'Confirmez votre vérification de la pièce et de son traitement fiscal.'};
 const loyerHc=montantOptionnel(f,'loyer_hc','Part loyer hors charges'),charges=montantOptionnel(f,'charges','Part charges');
 if('erreur' in loyerHc)return{erreur:loyerHc.erreur};if('erreur' in charges)return{erreur:charges.erreur};
 const {error}=await supabase.rpc('qualifier_ecriture_fiscale',{p_ecriture:ecritureId,p_nature:texte(f,'nature'),p_rubrique:texte(f,'rubrique')||null,p_justification:texte(f,'justification'),p_loyer_hc:loyerHc.montant,p_charges:charges.montant,p_lot:texte(f,'lot_id')||null});
 if(error)return{erreur:sansJargon(error.message)};actualiser(orgId);
 const succes='Qualification conservée dans une nouvelle version. Le journal reste inchangé.';
 // D03 (FIN-07, option A) : une dépense au libellé « fonds de travaux ALUR » reste rangée à part quoi qu'on choisisse. On le dit ici,
 // au moment du choix, au lieu d'enregistrer en silence une qualification sans effet. Une lecture qui échoue ne retire rien à l'enregistrement.
 if(texte(f,'nature')!=='a_qualifier'){
  const {data:piece}=await supabase.from('ecritures').select('categorie,sens').eq('organization_id',orgId).eq('id',ecritureId).maybeSingle();
  if(piece&&piece.sens==='depense'&&estFondsTravauxAlur(String(piece.categorie??'')))return{succes:`${succes} Attention : cette dépense est rangée d’office en « fonds de travaux ALUR » d’après son libellé ; votre choix est conservé mais il n’est pas appliqué au récapitulatif.`};
 }
 return{succes};
}
export async function retrouverVentilation(orgId:string,ecritureId:string,_etat:EtatFiscal,_f:FormData):Promise<EtatFiscal>{
 const {supabase,autorise}=await acces(orgId);if(!autorise)return{erreur:'Accès refusé.'};
 // La fonction SQL rend l'identifiant dès qu'une capture existe, qu'elle l'ait créée ou non : sans ce garde, une avance déjà capturée
 // recevait « retrouvée » alors que rien n'avait changé (FIN-06).
 const {data:existante,error:erreurLecture}=await supabase.from('fiscal_encaissements_composantes').select('non_ventile').eq('organization_id',orgId).eq('ecriture_id',ecritureId).maybeSingle();
 if(erreurLecture)return{erreur:sansJargon(erreurLecture.message)};
 if(existante)return{erreur:'La ventilation historique de cette pièce est déjà conservée : rien n’a été modifié. Si une part reste non ventilée, qualifiez la pièce avec sa justification.'};
 const {error}=await supabase.rpc('retrouver_ventilation_fiscale',{p_ecriture:ecritureId});
 if(error)return{erreur:sansJargon(error.message)};actualiser(orgId);return{succes:'Ventilation historique retrouvée et conservée avec les références des pièces.'};
}
export async function enregistrerExerciceFiscal(orgId:string,lotId:string,annee:number,_etat:EtatFiscal,f:FormData):Promise<EtatFiscal>{
 const {supabase,autorise}=await acces(orgId);if(!autorise)return{erreur:'Accès refusé.'};
 if(texte(f,'confirme')!=='oui')return{erreur:'Confirmez les périodes et les pièces de cet exercice.'};
 let periodes:unknown;try{periodes=JSON.parse(texte(f,'periodes'));}catch{return{erreur:'Vérifiez les périodes.'};}
 const regularisation230=montantOptionnel(f,'regularisation230','Montant de la ligne 230');if('erreur' in regularisation230)return{erreur:regularisation230.erreur};
 const {error}=await supabase.rpc('enregistrer_exercice_fiscal_lot',{p_lot:lotId,p_annee:annee,p_periodes:periodes,p_justification:texte(f,'justification'),p_regularisation230:regularisation230.montant,p_quote_part230:nombreOptionnel(f,'quote_part230'),p_justification230:texte(f,'justification230')||null});
 if(error)return{erreur:sansJargon(error.message)};actualiser(orgId);return{succes:'Exercice enregistré dans une nouvelle version. Les précédentes sont conservées.'};
}
