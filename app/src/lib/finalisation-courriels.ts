import type { SupabaseClient } from '@supabase/supabase-js';
export type ContexteCourriel = ({type:'reconduction';id:string;organisation:string;montant:number;formule:string|null;unites:number|null;suivante:string|null}|{type:'quittance';id:string;montant:number;est_quittance:boolean;automatique?:boolean}|{type:'bail_signe';id:string;document:string}|{type:'acces';id:string;usage:'signup'|'recovery';jeton_empreinte:string;invitation?:string}|{type:'invitation_artisan';id:string}|{type:'notification';id:string;evenement:string;role:'agence'|'locataire'|'artisan'}) & {destinataire?:string;acteur?:string;source?:string};
export async function verifierContexteCourriel(db:SupabaseClient,id:string) {
 const r=await db.rpc('verifier_contexte_courriel',{p_id:id});
 if(r.error) return {erreur:'Contrôle métier indisponible',recuperable:true};
 if(r.data!==true)return {erreur:'Les informations ou autorisations ont changé. Une nouvelle validation est nécessaire.'};
 return null;
}
/** Ne contient aucun transport : une reprise de finalisation ne peut pas réémettre. */
export async function reprendreFinalisationsCourriels(db:SupabaseClient) {
 const r=await db.rpc('courriels_finalisations_a_reprendre');
 if(r.error)throw new Error('Finalisations indisponibles');
 let terminees=0;
 for(const m of r.data??[]) {
  const f=await db.rpc('finaliser_courriel_metier',{p_id:m.id});
  if(!f.error&&f.data===true)terminees++;
 }
 return {terminees};
}

export class RefusContexteCourriel extends Error {
 constructor(message:string,readonly recuperable=false){super(message);}
}
export async function exigerContexteCourriel(db:SupabaseClient,id:string) {
 const refus=await verifierContexteCourriel(db,id);
 if(refus)throw new RefusContexteCourriel(refus.erreur,refus.recuperable??false);
}
