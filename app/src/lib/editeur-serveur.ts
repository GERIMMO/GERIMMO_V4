import 'server-only';
import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
import {identiteDepuisValeurs} from './identite-editeur';
export const lireEditeur=cache(async function lireEditeur(){
 const db=await createClient();const {data,error}=await db.from('supervision_identite').select('valeurs').eq('singleton',true).maybeSingle();
 const editeur=identiteDepuisValeurs(error?null:data?.valeurs);
 return {editeur,indisponible:Boolean(error)||!data};
});
