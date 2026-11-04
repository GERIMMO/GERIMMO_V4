import type {SupabaseClient} from '@supabase/supabase-js';
import {lireToutesLesPages} from './lecture-complete';
import {lireParIdentifiants} from './lectures-fiscales';
export async function lireContactsMessages(db:SupabaseClient,org:string){
 const [baux,liens]=await Promise.all([
  lireToutesLesPages<{id:string;locataire_principal:string|null}>((a,b)=>db.from('baux').select('id,locataire_principal',{count:'exact'}).eq('organization_id',org).order('id').range(a,b),b=>b.id),
  lireToutesLesPages<{id:string;person_id:string;role:string}>((a,b)=>db.from('bail_personnes').select('id,person_id,role',{count:'exact'}).eq('organization_id',org).eq('role','colocataire').order('id').range(a,b),l=>l.id),
 ]);
 if(baux.echec||liens.echec)return{contacts:[],erreur:true};
 const ids=[...new Set([...baux.lignes.flatMap(b=>b.locataire_principal?[b.locataire_principal]:[]),...liens.lignes.map(l=>l.person_id)])];
 const p=await lireParIdentifiants<{id:string;nom:string;prenom:string|null}>(ids,ids=>db.from('persons').select('id,nom,prenom').eq('organization_id',org).in('id',ids).is('archived_at',null));
 return{contacts:p.error||p.tronquee?[]:(p.data??[]),erreur:!!p.error||p.tronquee};
}
