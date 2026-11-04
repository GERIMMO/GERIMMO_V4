"use server";
import {revalidatePath} from 'next/cache';
import {verifierGerant,verifierLocataire} from '@/lib/ged-acces';
import {estUuid} from '@/lib/identifiants';
import {sansJargon} from '@/lib/erreurs';
import {rendrePdf} from '@/lib/documents/rendu';
import {preparerFichierGed,abandonnerPieceGed} from '@/lib/ged-depot';
import {documentEcheancierCharges} from '@/lib/documents/echeancier-charges';
import type {EcheancierCharges} from '@/lib/echeanciers-charges';
import {lireMontantFacultatif} from '@/lib/saisie-montant';
export type EtatEcheancierCharges={erreur?:string;succes?:string};
function actualiser(org:string){revalidatePath(`/espace/${org}`,'layout');revalidatePath(`/agence/${org}`,'layout');revalidatePath(`/locataire/${org}`,'layout')}
export async function proposerEcheancierCharges(org:string,regularisation:string,_:EtatEcheancierCharges,f:FormData):Promise<EtatEcheancierCharges>{
 const {supabase,user}=await verifierGerant(org,{geste:'regularisation_charges',cible:regularisation});
 if(!user||![org,regularisation].every(estUuid))return{erreur:'Accès refusé.'};
 if(f.get('verifie')!=='on')return{erreur:'Vérifiez le décompte et les règlements déjà reçus avant de proposer cet échéancier.'};
 const r=await supabase.from('regularisations_charges').select('*').eq('organization_id',org).eq('id',regularisation).single();
 if(r.error||!r.data)return{erreur:'Ce décompte n’est pas accessible.'};
 try{
 const prepare=await supabase.rpc('preparer_echeancier_charges',{p_regularisation:regularisation,p_nombre:Number(f.get('nombre')),p_premiere:String(f.get('premiere')??'')});
 if(prepare.error||!prepare.data)return{erreur:sansJargon(prepare.error?.message??'L’échéancier n’a pas pu être préparé.')};
 const lu=await supabase.from('echeanciers_charges').select('*').eq('organization_id',org).eq('id',prepare.data).single();
 if(lu.error||!lu.data)return{erreur:'Le brouillon est conservé. Rechargez la page pour le reprendre.'};
 const p=lu.data as EcheancierCharges;
 if(p.document_id)return{succes:'Cet échéancier a déjà été transmis.'};
 const bail=await supabase.from('baux').select('lot_id,locataire_principal').eq('organization_id',org).eq('id',p.bail_id).single();
 if(bail.error||!bail.data)return{erreur:'Le bail n’a pas pu être vérifié.'};
 const [locataire,lot,detentions]=await Promise.all([
  supabase.from('persons').select('nom,prenom').eq('organization_id',org).eq('id',bail.data.locataire_principal).single(),
  supabase.from('lots').select('nom,bien_id').eq('organization_id',org).eq('id',bail.data.lot_id).single(),
  supabase.from('detentions').select('person:persons!detentions_person_id_fkey(nom,prenom)').eq('organization_id',org).eq('lot_id',bail.data.lot_id).is('date_fin',null),
 ]);
 if(locataire.error||lot.error||detentions.error||!locataire.data||!lot.data)return{erreur:'Complétez les identités et le logement avant de produire le PDF.'};
 const bien=await supabase.from('biens').select('address_line1,postal_code,city').eq('organization_id',org).eq('id',lot.data.bien_id).single();
 if(bien.error||!bien.data)return{erreur:'L’adresse du bien n’a pas pu être vérifiée.'};
 const noms=(detentions.data??[]).map(d=>{const pers=Array.isArray(d.person)?d.person[0]:d.person;return pers?[pers.prenom,pers.nom].filter(Boolean).join(' '):''}).filter(Boolean);
 const pdf=await rendrePdf(documentEcheancierCharges(p,{locataire:[locataire.data.prenom,locataire.data.nom].filter(Boolean).join(' '),logement:lot.data.nom,adresse:[bien.data.address_line1,`${bien.data.postal_code} ${bien.data.city}`].filter(Boolean).join(', '),emetteur:[...new Set(noms)].join(', '),annee:r.data.annee,charges:Number(r.data.charges_reelles),provisions:Number(r.data.provisions)}));
 const prep=await preparerFichierGed(supabase,org,new File([new Uint8Array(pdf)],'echeancier-charges.pdf',{type:'application/pdf'}),false,true);
 if(!prep.fichier)return{erreur:prep.erreur??'Le PDF n’a pas pu être enregistré.'};
 const piece=prep.fichier;
 const emis=await supabase.rpc('publier_echeancier_charges',{p_plan:p.id,p_storage_path:piece.chemin,p_mime:piece.mime,p_taille:piece.taille,p_empreinte:piece.empreinte});
 if(emis.error||!emis.data){await abandonnerPieceGed(supabase,piece);return{erreur:sansJargon(emis.error?.message??'L’échéancier n’a pas été transmis.')};}
 const doc=await supabase.from('documents').select('storage_path').eq('organization_id',org).eq('id',emis.data).single();
 if(!doc.error&&doc.data?.storage_path!==piece.chemin)await abandonnerPieceGed(supabase,piece);
 actualiser(org);return{succes:'PDF disponible dans les deux espaces. L’échéancier attend l’accord du locataire.'};
 }catch(e){return{erreur:sansJargon(e instanceof Error?e.message:'L’échéancier n’a pas pu être transmis.')};}
}
export async function agirEcheancierCharges(org:string,plan:string,proprietaire:boolean,_:EtatEcheancierCharges,f:FormData):Promise<EtatEcheancierCharges>{
 const {supabase,user}=proprietaire?await verifierGerant(org,{geste:'encaissement',cible:plan}):await verifierLocataire(org);
 if(!user||![org,plan].every(estUuid))return{erreur:'Accès refusé.'};
 const lu=await supabase.from('echeanciers_charges').select('id').eq('organization_id',org).eq('id',plan).single();
 if(lu.error||!lu.data)return{erreur:'Cet échéancier n’est pas accessible.'};
 const action=String(f.get('action')??'');
 if((proprietaire&&action!=='confirmer')||(!proprietaire&&!['accepter','declarer'].includes(action)))return{erreur:'Action indisponible depuis cet espace.'};
 if(action==='accepter'&&f.get('accord')!=='on')return{erreur:'Consultez le PDF et confirmez votre accord sur les dates et montants.'};
 const montant=action==='confirmer'?lireMontantFacultatif(f.get('montant')):null;
 if(montant&&('erreur'in montant||montant.montant===null))return{erreur:'Indiquez le montant total reçu pour cette échéance.'};
 const recu=montant&&'montant'in montant&&montant.montant!==null?Math.round(montant.montant*100):null;
 const r=await supabase.rpc('agir_echeancier_charges',{p_plan:plan,p_action:action,p_rang:Number(f.get('rang'))||null,p_recu_cents:recu,p_date:action==='confirmer'?String(f.get('date')??''):null});
 if(r.error)return{erreur:sansJargon(r.error.message)};
 actualiser(org);return{succes:action==='confirmer'?'Réception enregistrée.':action==='accepter'?'Accord enregistré.':'Paiement signalé au propriétaire. La réception reste à confirmer.'};
}
