import 'server-only';
import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
import {EDITEUR} from './editeur';
import {CHAMPS_EDITEUR} from './identite-editeur';
export const lireEditeur=cache(async function lireEditeur(){
 const db=await createClient();const {data,error}=await db.from('supervision_identite').select('valeurs').eq('singleton',true).maybeSingle();
 const editeur:Record<string,string|null>={...EDITEUR};
 if(!error&&data?.valeurs)for(const k of Object.keys(CHAMPS_EDITEUR)){const v=data.valeurs[k];if(typeof v==='string'||v===null)editeur[k]=v;}
 return {editeur,indisponible:Boolean(error)||!data};
});
