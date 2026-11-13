import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculerFactureExistante } from "./calcul-facture-existant";
import { preparerPdfFactureExistant } from "./pdf-facture-existant";
import { methodeConseillee, recuperationConseillee } from "./conseil-repartition";
import { periodesCompteurs, compteursPourFacture, fluideCompatible } from "./compteurs-facture";
import { indexDate } from "./controle-compteur-general";
import { lireCollectionConsommations, lireLiensConsommations } from "./lecture-consommations";
import type { CompteurConsommation, ReleveConsommation } from "./consommations";
import { aujourdhuiParis } from "./ged";

/** Aucun appel d’encaissement ou de régularisation annuelle dans ce traitement. */
export async function traiterFactureAutomatique(service:SupabaseClient,org:string,id:string,avantEffet:()=>Promise<void>=async()=>{}, jeton?:string) {
 const geste=async(nom:string,args:Record<string,unknown>={})=>{
  await avantEffet();
  return service.rpc("geste_facture_automatique",{p_facture:id,p_geste:nom,p_args:{...args,_jeton:jeton}});
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
  const r=rep.data;
  if(r?.statut!=="validee") {
   const lr=await lireCollectionConsommations<{id:string;nom:string}>((a,b)=>db.from("lots").select("id,nom",{count:"exact"}).eq("organization_id",org).eq("bien_id",c.bien_id).order("id").range(a,b));
   if(lr.error)throw new Error("Logements indisponibles.");const lots=lr.data.filter(l=>!c.lot_id||l.id===c.lot_id);
   const br=await lireLiensConsommations<{id:string;lot_id:string;chambre_id:string|null;charges_mode:string;date_debut:string;date_fin:string|null;etat:string}>(lots.map(l=>l.id),(ids,a,b)=>db.from("baux").select("id,lot_id,chambre_id,charges_mode,date_debut,date_fin,etat",{count:"exact"}).eq("organization_id",org).in("lot_id",ids).in("etat",["actif","preavis","termine"]).order("id").range(a,b));
   const mr=await lireCollectionConsommations<CompteurConsommation>((a,b)=>db.from("compteurs_consommation").select("*,remplacement:remplacements_compteur!ancien_id(ancien_id,nouveau_id,date_pose)",{count:"exact"}).eq("organization_id",org).eq("bien_id",c.bien_id).order("id").range(a,b));
   if(br.error||mr.error)throw new Error("Baux ou compteurs indisponibles.");
   if(["entretien","autre"].includes(c.categorie))throw new Error("Précisez la part récupérable de cette prestation avant de poursuivre.");
   const reg=r?.source?.reglages;
   const mode=methodeConseillee(c.categorie,lots,mr.data,f.periode_debut,reg?.mode_interface);
   const conseil=recuperationConseillee(c.categorie,lots,br.data.map(b=>({...b,mode_charges:b.charges_mode})),f.periode_debut,f.periode_fin);
   if(conseil.inconnus)throw new Error("Complétez le mode de charges des baux concernés.");
   if(br.data.some(b=>b.chambre_id && b.date_debut <= f.periode_fin && (!b.date_fin || b.date_fin >= f.periode_debut)) && !reg?.colocation)throw new Error("Confirmez une fois la clé entre les chambres de la colocation.");
   if(mode==="consommations") {
    const rr=await lireLiensConsommations<ReleveConsommation>(mr.data.map(m=>m.id),(ids,a,b)=>db.from("releves_consommation").select("*",{count:"exact"}).eq("organization_id",org).in("compteur_id",ids).order("id").range(a,b));
    if(rr.error)throw new Error("Relevés indisponibles.");
    let demandeEnregistree = false;
    const datesFutures: string[] = [];
    const problemes: string[] = [];
    for(const lot of lots) {
     // Un compteur arrêté peut documenter intégralement une facture ancienne.
     const chaines = periodesCompteurs(mr.data, mr.data.flatMap(m => m.remplacement ?? []), f.periode_debut, f.periode_fin, c.categorie, lot.id);
     if (chaines.some(ch => ch.length > 1)) {
       if (chaines.length !== 1) { problemes.push(`Choisissez le compteur facturé de ${lot.nom}.`); continue; }
       const manque = chaines[0].flatMap(p => [p.debut,p.fin].filter(j => indexDate(p.compteur,rr.data,j)==null).map(j => ({m:p.compteur,j}))).at(0);
       if (!manque) continue;
       if (!manque.m.actif) { problemes.push(`Vérifiez le dernier relevé du compteur remplacé de ${lot.nom}.`); continue; }
       if (manque.j > aujourdhuiParis()) { datesFutures.push(manque.j); continue; }
       const demande = await geste("demander_index_facture",{p_org:org,p_facture:id,p_compteur:manque.m.id,p_jour:manque.j});
       if (demande.error) problemes.push(`${lot.nom} : ${demande.error.message}`); else demandeEnregistree = true;
       continue;
     }
     const documentes = compteursPourFacture(mr.data, rr.data, f, c.categorie, lot.id);
     if (documentes.length === 1) continue;
     if (documentes.length > 1) {
       problemes.push(`Choisissez le compteur facturé de ${lot.nom}.`);
       continue;
     }
     const possibles=mr.data.filter(m=>m.lot_id===lot.id && m.actif && m.date_index_initial<=f.periode_debut && fluideCompatible(m.type,c.categorie));
     if(possibles.length!==1){problemes.push(`Vérifiez le compteur de ${lot.nom}.`);continue;}
     const m=possibles[0];
     const dates=[f.periode_debut,f.periode_fin].filter(j=>indexDate(m,rr.data,j)==null).sort();
     // Les index sont demandés dans l’ordre chronologique, sans inventer d’historique.
     const jour=dates[0];if(!jour)continue;
     if (jour > aujourdhuiParis()) { datesFutures.push(jour); continue; }
     const demande=await geste("demander_index_facture",{p_org:org,p_facture:id,p_compteur:m.id,p_jour:jour});
     if(demande.error)problemes.push(`${lot.nom} : ${demande.error.message}`);else demandeEnregistree = true;
    }
    if(problemes.length)throw new Error(problemes.join(" "));
    if (demandeEnregistree || datesFutures.length) {
      const prochaineDate = datesFutures.sort()[0];
      const detail = [
        demandeEnregistree && "Demande de relevé enregistrée.",
        prochaineDate && `Prochain relevé attendu le ${prochaineDate.split("-").reverse().join("/")}.`,
        "Gerimmo reprendra le calcul après réception des index.",
      ].filter(Boolean).join(" ");
      return suivi("releves_attendus", detail);
    }
   }
   const form=new FormData();form.set("mode",mode);if(conseil.coche)form.set("recuperable","on");if(reg?.colocation)form.set("colocation",reg.colocation);
   const calc=await calculerFactureExistante(db,org,id,form);if(calc.erreur||!calc.repartition)throw new Error(calc.erreur??"Calcul indisponible.");
   return suivi("a_verifier","Vérifiez les montants par logement puis validez la répartition.");
  }
  for(const bail of new Set<string>(r.lignes.filter((l:{bail_id:string|null;recuperable:boolean})=>l.bail_id&&l.recuperable).map((l:{bail_id:string})=>l.bail_id))) {
   await avantEffet();const pdf=await preparerPdfFactureExistant(db,org,r.id,bail);if(pdf.erreur)throw new Error(pdf.erreur);

  }
  return suivi("terminee","Répartition validée. Les décomptes sont prêts à être consultés et partagés.");
 } catch(e) {
 const detail=e instanceof Error?e.message:"Traitement interrompu";
 // Les refus métier restent visibles ; une panne de lecture/transport est rejouable.
 if(/indisponible|interrompu|fetch|network|timeout|ECONN|n’a pas pu être préparé/i.test(detail)) return {etat:"reprise",detail};
 return suivi("a_verifier",detail);
}
}

export async function traiterFileFactures(service:SupabaseClient,avantEffet:()=>Promise<void>=async()=>{}, budgetMs=45_000) {
 const debut=Date.now(); const bilan:{etat:string}[]=[];
 // Chaque réservation est atomique en base, y compris entre plusieurs serveurs.
 while(Date.now()-debut<budgetMs && bilan.length<100) {
  await avantEffet(); const jeton=randomUUID();
  const prise=await service.rpc("prendre_facture_automatique",{p_jeton:jeton});
  if(prise.error)throw new Error("File des factures indisponible.");
  if(!prise.data)break;
  const f=prise.data;let etat="reprise";
  try { etat=(await traiterFactureAutomatique(service,f.organization_id,f.id,avantEffet,jeton)).etat; }
  finally {
   const fin=await service.rpc("finir_facture_automatique",{p_facture:f.id,p_jeton:jeton,p_resultat:etat});
   if(fin.error||fin.data!==true)throw new Error("Fin de traitement non confirmée ; reprise sécurisée nécessaire.");
  }
  bilan.push({etat});
 }
 return {traitees:bilan.length,terminees:bilan.filter(b=>b.etat==="terminee").length,a_verifier:bilan.filter(b=>b.etat==="a_verifier").length,reprises:bilan.filter(b=>b.etat==="reprise").length};
}
