'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {dateParis} from '@/lib/tarifs';
import {montantEnCentimes} from '@/lib/tresorerie-supervision';
export type EtatCout={erreur?:string;succes?:string};
export async function ajouterCout(_:EtatCout,f:FormData):Promise<EtatCout>{
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');
 if(auth.error||auth.data!==true)return {erreur:'Compte de supervision permanent requis.'};
 const t=(k:string)=>String(f.get(k)??'').trim();
 const montant=montantEnCentimes(t('montant'));
 const jour=t('jour');
 if(!Number.isFinite(Date.parse(jour))||new Date(jour).toISOString().slice(0,10)!==jour||jour>dateParis(new Date()))return {erreur:'Indiquez la date réelle d’un paiement déjà effectué, au plus tard aujourd’hui.'};
 if(montant===null||!/^\d{4}-\d{2}-\d{2}$/.test(t('jour'))||!['hebergement','ia','email','signature','marketing','autre'].includes(t('categorie'))||t('fournisseur').length<2||t('fournisseur').length>120||t('reference').length<2||t('reference').length>200||t('preuve').length<3||t('preuve').length>2000) return {erreur:'Vérifiez le montant, la date, le fournisseur et la référence du justificatif.'};
 const {error}=await db.from('supervision_couts').insert({fournisseur:t('fournisseur'),categorie:t('categorie'),jour:t('jour'),montant_cents:montant,reference:t('reference'),preuve:t('preuve')});
 if(error)return {erreur:error.code==='23505'?'Cette référence est déjà enregistrée pour ce fournisseur.':'Enregistrement impossible. Votre saisie est conservée.'};
 revalidatePath('/admin');return {succes:'Coût enregistré dans le registre. Aucun paiement n’a été déclenché.'};
}
