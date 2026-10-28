import 'server-only';
import {cache} from 'react';
import {createClientPublic} from '@/lib/supabase/public';
import {identiteDepuisValeurs} from './identite-editeur';
// L'identité de l'éditeur est publique (mentions légales, conditions, confidentialité ; droit de lecture d'anon sur
// `valeurs`) : elle se lit SANS cookie (audit final, PUB-05). Lue avec le client à cookies, elle rendait dynamiques des
// pages publiques déclarées `revalidate = 3600` — fonction serveur et aller-retour Supabase à chaque visite. Mêmes
// données pour la supervision, qui lit la même ligne.
export const lireEditeur=cache(async function lireEditeur(){
 const db=createClientPublic();
 if(!db)return {editeur:identiteDepuisValeurs(null),indisponible:true};
 const {data,error}=await db.from('supervision_identite').select('valeurs').eq('singleton',true).maybeSingle();
 const editeur=identiteDepuisValeurs(error?null:data?.valeurs);
 return {editeur,indisponible:Boolean(error)||!data};
});
