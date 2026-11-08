import type { SupabaseClient } from "@supabase/supabase-js";
import { calculerFactureExistante } from "./calcul-facture-existant";
import { preparerPdfFactureExistant } from "./pdf-facture-existant";
import { methodeConseillee, recuperationConseillee } from "./conseil-repartition";
import { fluideCompatible } from "./compteurs-facture";
import { indexDate } from "./controle-compteur-general";
import { lireCollectionConsommations, lireLiensConsommations } from "./lecture-consommations";
import type { CompteurConsommation, ReleveConsommation } from "./consommations";
import { aujourdhuiParis } from "./ged";

/** Aucun appel d’encaissement ou de régularisation annuelle dans ce traitement. */
export async function traiterFactureAutomatique(service:SupabaseClient,org:string,id:string,avantEffet:()=>Promise<void>=async()=>{}) {
 const geste=async(nom:string,args:Record<string,unknown>={})=>{
  await avantEffet();
  return service.rpc("geste_facture_automatique",{p_facture:id,p_geste:nom,p_args:args});
 };
 const db=new Proxy(service,{get(target,key){
  if(key==="rpc") return geste;
  const v=Reflect.get(target,key); return typeof v==="function"?v.bind(target):v;
 }});
 const suivi=async(etat:string,detail:string)=>{const r=await geste("suivi",{etat,detail});if(r.error)throw new Error(r.error.message);return {etat,detail};};
 try {
  const acces=await geste("controle"); if(acces.error) return {etat:"a_verifier",detail:acces.error.message};
  const fr=await db.from("factures_fourniture").select("*").eq("organization_id",org).eq("id",id).single();
  if(fr.error||!fr.data)throw new Error("Facture indisponible."); const f=fr.data;
  const cr=await db.from("contrats_fourniture").select("*").eq("organization_id",org).eq("id",f.contrat_id).single();
  if(cr.error||!cr.data)throw new Error("Contrat indisponible."); const c=cr.data;
  const rep=await db.from("repartitions_fourniture").select("*").eq("organization_id",org).eq("facture_id",id).maybeSingle();
  if(rep.error)throw new Error("Répartition indisponible.");
  let r=rep.data;
  if(r?.statut!=="validee") {
   const lr=await lireCollectionConsommations<{id:string;nom:string}>((a,b)=>db.from("lots").select("id,nom",{count:"exact"}).eq("organization_id",org).eq("bien_id",c.bien_id).order("id").range(a,b));
   if(lr.error)throw new Error("Logements indisponibles.");const lots=lr.data.filter(l=>!c.lot_id||l.id===c.lot_id);
   const br=await lireLiensConsommations<{id:string;lot_id:string;chambre_id:string|null;charges_mode:string;date_debut:string;date_fin:string|null;etat:string}>(lots.map(l=>l.id),(ids,a,b)=>db.from("baux").select("id,lot_id,chambre_id,charges_mode,date_debut,date_fin,etat",{count:"exact"}).eq("organization_id",org).in("lot_id",ids).in("etat",["actif","preavis","termine"]).order("id").range(a,b));
   const mr=await lireCollectionConsommations<CompteurConsommation>((a,b)=>db.from("compteurs_consommation").select("*",{count:"exact"}).eq("organization_id",org).eq("bien_id",c.bien_id).order("id").range(a,b));
   if(br.error||mr.error)throw new Error("Baux ou compteurs indisponibles.");
   if(["entretien","autre"].includes(c.categorie))throw new Error("Précisez la part récupérable de cette prestation avant de poursuivre.");
   const reg=r?.source?.reglages;
   const mode=methodeConseillee(c.categorie,lots,mr.data,f.periode_debut,reg?.mode_interface);
   const conseil=recuperationConseillee(c.categorie,lots,br.data.map(b=>({...b,mode_charges:b.charges_mode})),f.periode_debut,f.periode_fin);
   if(conseil.inconnus)throw new Error("Complétez le mode de charges des baux concernés.");
   if(br.data.some(b=>b.chambre_id) && !reg?.colocation)throw new Error("Confirmez une fois la clé entre les chambres de la colocation.");
   if(mode==="consommations") {
    const rr=await lireLiensConsommations<ReleveConsommation>(mr.data.map(m=>m.id),(ids,a,b)=>db.from("releves_consommation").select("*",{count:"exact"}).eq("organization_id",org).in("compteur_id",ids).order("id").range(a,b));
    if(rr.error)throw new Error("Relevés indisponibles.");
    let attente=false; const problemes:string[]=[];
    for(const lot of lots) {
     const possibles=mr.data.filter(m=>m.lot_id===lot.id && m.actif && m.date_index_initial<=f.periode_debut && fluideCompatible(m.type,c.categorie));
     if(possibles.length!==1){problemes.push(`Vérifiez le compteur de ${lot.nom}.`);continue;}
     const m=possibles[0];
     const dates=[f.periode_debut,f.periode_fin].filter(j=>indexDate(m,rr.data,j)==null).sort();
     // Les index sont demandés dans l’ordre chronologique, sans inventer d’historique.
     const jour=dates[0];if(!jour)continue;
     if(jour>aujourdhuiParis()){attente=true;continue;}
     const demande=await geste("demander_index_facture",{p_org:org,p_facture:id,p_compteur:m.id,p_jour:jour});
     if(demande.error)problemes.push(`${lot.nom} : ${demande.error.message}`);else attente=true;
    }
    if(problemes.length)throw new Error(problemes.join(" "));
    if(attente)return suivi("releves_attendus","Les relevés sont demandés aux locataires. Gerimmo reprendra automatiquement après réception.");
   }
   const form=new FormData();form.set("mode",mode);if(conseil.coche)form.set("recuperable","on");if(reg?.colocation)form.set("colocation",reg.colocation);
   const calc=await calculerFactureExistante(db,org,id,form);if(calc.erreur||!calc.repartition)throw new Error(calc.erreur??"Calcul indisponible.");r=calc.repartition;
   const valide=await geste("valider_repartition_fourniture",{p_repartition:r.id,p_empreinte_attendue:r.empreinte});if(valide.error)throw new Error(valide.error.message);
  }
  for(const bail of new Set<string>(r.lignes.filter((l:{bail_id:string|null;recuperable:boolean})=>l.bail_id&&l.recuperable).map((l:{bail_id:string})=>l.bail_id))) {
   await avantEffet();const pdf=await preparerPdfFactureExistant(db,org,r.id,bail);if(pdf.erreur)throw new Error(pdf.erreur);
   const partage=await geste("diffuser_pdf_repartition",{p_org:org,p_repartition:r.id,p_bail:bail});if(partage.error)throw new Error(partage.error.message);
  }
  return suivi("terminee","Répartition validée et décomptes partagés. Aucun encaissement confirmé automatiquement. Les provisions restent déduites lors de la régularisation.");
 } catch(e) {return suivi("a_verifier",e instanceof Error?e.message:"Traitement interrompu : vérifiez la facture.");}
}

export async function traiterFileFactures(service:SupabaseClient,avantEffet:()=>Promise<void>=async()=>{}) {
 const r=await service.from("factures_automatiques").select("id,organization_id").eq("actif",true).in("etat",["a_traiter","releves_attendus"]).order("updated_at").limit(5);
 if(r.error)throw new Error("File des factures indisponible.");
 const bilan=[];
 for(const f of r.data??[])bilan.push(await traiterFactureAutomatique(service,f.organization_id,f.id,avantEffet));
 return {traitees:bilan.length,terminees:bilan.filter(b=>b.etat==="terminee").length,a_verifier:bilan.filter(b=>b.etat==="a_verifier").length};
}
