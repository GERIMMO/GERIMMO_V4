"use server";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { controlerCircuitConserve, type CircuitConservation } from "@/lib/conservation-signatures";

export async function verifierPageArchives(apres?:string){
  const session=await createClient();const droit=await session.rpc("is_super_admin");
  if(droit.error||droit.data!==true)return {erreur:"Réservé au superadmin."};
  if(apres!==undefined&&(typeof apres!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(apres)))return {erreur:"Référence de reprise invalide."};
  // Le superadmin ne possède pas les baux : leur RLS renverrait une liste vide.
  // Exception de lecture serveur APRÈS is_super_admin (MFA comprise), bornée
  // à cinq circuits. Aucun octet, chemin ou signataire n'est renvoyé au client.
  const db=clientDeService();
  if(!db)return {erreur:"Le service de contrôle des archives est indisponible."};
  let q=db.from("bail_signature_circuits").select("id,organization_id,etat,document_signe,signataires").eq("etat","termine").eq("prestataire","zoho").order("id").limit(6);
  if(apres)q=q.gt("id",apres);
  const signal=AbortSignal.timeout(40_000);
  const r=await q.abortSignal(signal);
  if(r.error)return {erreur:"Les archives ne peuvent pas être lues. Aucun résultat n’est confirmé."};
  const lignes=(r.data??[]) as CircuitConservation[];const resultats=[];
  for(const circuit of lignes.slice(0,5)){
    const reference=circuit.id.slice(0,8).toUpperCase();
    try {
      resultats.push({reference,...await controlerCircuitConserve(db,circuit,signal)});
    } catch {
      resultats.push({reference,ok:false,fichiers:0,motif:"lecture_indisponible"});
    }
  }
  // Aucun nom, chemin ou contenu documentaire dans le journal.
  let journalise=false;
  try {
    const journal=await db.rpc("log_tech",{evenement:"controle_archives_signature",details:{controles:resultats.length,valides:resultats.filter(r=>r.ok).length,echecs:resultats.filter(r=>!r.ok).length,suppressions:0}});
    journalise=!journal.error;
  } catch { /* Les résultats restent disponibles même si le journal est indisponible. */ }
  return {resultats,suite:lignes.length>5?lignes[4].id:null,journalise};
}
