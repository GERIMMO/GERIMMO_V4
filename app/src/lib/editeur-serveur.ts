import 'server-only';
import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
import {createClientPublic} from '@/lib/supabase/public';
import {identiteDepuisValeurs} from './identite-editeur';
export const lireEditeur=cache(async function lireEditeur(options?:{pagePublique?:boolean}){
 // Pages publiques relues toutes les heures (mentions légales, conditions, confidentialité — audit final, PUB-05) :
 // lecture SANS cookie (anon lit déjà `valeurs`), sinon la page redevient dynamique ; et une lecture en échec LÈVE au
 // lieu de rendre « indisponible » — Next garde alors la dernière version réussie, et un build sans base échoue au lieu
 // de figer « en cours de finalisation » pendant une heure (relecture adverse du 28/10). Sans configuration (pas de
 // client), le rendu habituel. La supervision et la garde de souscription gardent la lecture d'avant (sans option).
 if(options?.pagePublique){
  const db=createClientPublic();
  if(db){
   const {data,error}=await db.from('supervision_identite').select('valeurs').eq('singleton',true).maybeSingle();
   if(error)throw new Error(`Identité de l'éditeur illisible : la page publique n'est pas mise en cache (${error.message}).`);
   return {editeur:identiteDepuisValeurs(data?.valeurs),indisponible:!data};
  }
 }
 const db=await createClient();const {data,error}=await db.from('supervision_identite').select('valeurs').eq('singleton',true).maybeSingle();
 const editeur=identiteDepuisValeurs(error?null:data?.valeurs);
 return {editeur,indisponible:Boolean(error)||!data};
});
