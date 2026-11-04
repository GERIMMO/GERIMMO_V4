import type { SupabaseClient } from "@supabase/supabase-js";
import { lireToutesLesPages } from "./lecture-complete";
export type EntitePatrimoine={id:string;nom:string;qualite:string|null;lots:string[]};
type Detention={id:string;lot_id:string;person: {id:string;nom:string;prenom:string|null;qualite:string|null}|{id:string;nom:string;prenom:string|null;qualite:string|null}[]|null};
/** Le filtre désigne les biens détenus pendant l’exercice ; il ne calcule pas une quote-part de résultat fiscal. */
export async function lireEntitesPatrimoine(db:SupabaseClient,org:string,annee:number):Promise<{entites:EntitePatrimoine[];erreur:boolean}>{
 const r=await lireToutesLesPages<Detention>((debut,fin)=>db.from("detentions").select("id,lot_id,person:persons!detentions_person_id_fkey(id,nom,prenom,qualite)",{count:"exact"}).eq("organization_id",org).lte("date_debut",`${annee}-12-31`).or(`date_fin.is.null,date_fin.gte.${annee}-01-01`).order("id").range(debut,fin),d=>d.id);
 if(r.echec)return{entites:[],erreur:true};
 const groupes=new Map<string,EntitePatrimoine>();
 for(const d of r.lignes){const p=Array.isArray(d.person)?d.person[0]:d.person;if(!p)return{entites:[],erreur:true};const entite=groupes.get(p.id)??{id:p.id,nom:[p.prenom,p.nom].filter(Boolean).join(" "),qualite:p.qualite,lots:[]};if(!entite.lots.includes(d.lot_id))entite.lots.push(d.lot_id);groupes.set(p.id,entite);}
 return{entites:[...groupes.values()].sort((a,b)=>a.nom.localeCompare(b.nom,"fr")),erreur:false};
}
