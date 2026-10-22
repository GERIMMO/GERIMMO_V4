import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CircuitConservation = {
  id: string; organization_id: string; etat: string; document_signe: string | null;
  signataires: { preuveDocumentId?: string; statut?: string }[];
};
export type ArchiveConservation = {
  id: string; organization_id: string; storage_path: string | null; mime_type: string;
  taille_octets: number; empreinte: string | null; purged_at: string | null;
};
export type ControleArchives = { ok: boolean; fichiers: number; motif: string };
const MAX_OCTETS = 25 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function signatairesArchivesValides(valeur: unknown): valeur is { statut: "signed"; preuveDocumentId: string }[] {
  return Array.isArray(valeur) && valeur.length > 0 && valeur.length <= 25
    && valeur.every(s => s !== null && typeof s === "object"
      && s.statut === "signed" && typeof s.preuveDocumentId === "string"
      && UUID.test(s.preuveDocumentId));
}

/** Relit les octets : le seul état « terminé » ne garantit pas une archive intacte. */
export async function verifierArchivesSignature(circuit:CircuitConservation,documents:ArchiveConservation[],lire:(chemin:string)=>Promise<Blob|null>):Promise<ControleArchives>{
  const refus=(motif:string):ControleArchives=>({ok:false,fichiers:0,motif});
  if(circuit.etat!=="termine"||!UUID.test(circuit.organization_id)||!circuit.document_signe||!UUID.test(circuit.document_signe))return refus("circuit_non_archive");
  if(!signatairesArchivesValides(circuit.signataires))return refus("certificat_manquant");
  const ids=[...new Set([circuit.document_signe,...circuit.signataires.map(s=>s.preuveDocumentId!)])];
  if(ids.length<2)return refus("certificat_distinct_manquant");
  let fichiers=0;
  for(const id of ids){
    const matches=documents.filter(d=>d.id===id);
    if(matches.length!==1)return refus("archive_introuvable");
    const d=matches[0];
    if(d.organization_id!==circuit.organization_id||!d.storage_path?.startsWith(circuit.organization_id+"/")||d.storage_path.split("/").some(p=>p===".."||p==="."))return refus("rattachement_incoherent");
    if(d.purged_at)return refus("archive_deja_purgee");
    if(d.mime_type!=="application/pdf"||!Number.isSafeInteger(d.taille_octets)||d.taille_octets<5||d.taille_octets>MAX_OCTETS||!/^[a-f0-9]{64}$/i.test(d.empreinte??""))return refus("metadonnees_incompletes");
    try{
      const blob=await lire(d.storage_path);
      if(!blob||blob.size!==d.taille_octets||blob.size>MAX_OCTETS)return refus("fichier_absent_ou_taille_incorrecte");
      const octets=Buffer.from(await blob.arrayBuffer());
      if(octets.subarray(0,5).toString()!=="%PDF-"||createHash("sha256").update(octets).digest("hex")!==d.empreinte!.toLowerCase())return refus("empreinte_incorrecte");
      fichiers++;
    }catch{return refus("lecture_indisponible");}
  }
  return {ok:true,fichiers,motif:"archives_verifiees"};
}

export async function controlerCircuitConserve(db:SupabaseClient,circuit:CircuitConservation,signal=AbortSignal.timeout(20_000)):Promise<ControleArchives>{
  if(!signatairesArchivesValides(circuit.signataires))return {ok:false,fichiers:0,motif:"certificat_manquant"};
  const ids=[circuit.document_signe,...circuit.signataires.map(s=>s.preuveDocumentId)].filter((s):s is string=>typeof s==="string"&&UUID.test(s));
  if(!ids.length)return {ok:false,fichiers:0,motif:"archive_introuvable"};
  try {
    signal.throwIfAborted();
    const r=await db.from("documents").select("id,organization_id,storage_path,mime_type,taille_octets,empreinte,purged_at").eq("organization_id",circuit.organization_id).in("id",ids).abortSignal(signal);
    if(r.error)return {ok:false,fichiers:0,motif:"lecture_indisponible"};
    return await verifierArchivesSignature(circuit,r.data??[],async path=>{
      signal.throwIfAborted();
      const r=await db.storage.from("documents").download(path,{}, {signal,cache:"no-store"});
      if(r.error)throw Error("lecture_indisponible");
      return r.data;
    });
  } catch {
    return {ok:false,fichiers:0,motif:"lecture_indisponible"};
  }
}

/** Préparation seulement : aucune valeur par défaut ne vaut validation juridique. */
export function preparerPurgeCopieSignature(p:{archives:ControleArchives;regle?:{referenceValidation:string;valideeLe:string;delaiJours:number};declencheurLe?:string;sauvegardeVerifieeLe?:string;litige?:boolean},maintenant=Date.now()):{eligible:boolean;motif:string}{
  if(!p.archives.ok)return {eligible:false,motif:"archives_a_verifier"};
  const r=p.regle;const validation=Date.parse(r?.valideeLe??"");
  if(!r||r.referenceValidation.trim().length<5||!Number.isFinite(validation)||validation>maintenant||!Number.isInteger(r.delaiJours)||r.delaiJours<1||r.delaiJours>36500)return {eligible:false,motif:"regle_non_validee"};
  if(p.litige!==false)return {eligible:false,motif:"conservation_a_justifier"};
  const debut=Date.parse(p.declencheurLe??"");
  if(!Number.isFinite(debut)||debut>maintenant||maintenant<debut+r.delaiJours*86400000)return {eligible:false,motif:"delai_non_echu"};
  const age=maintenant-Date.parse(p.sauvegardeVerifieeLe??"");
  if(!Number.isFinite(age)||age<0||age>26*3600000)return {eligible:false,motif:"sauvegarde_a_verifier"};
  return {eligible:true,motif:"dossier_pret_a_valider"};
}
