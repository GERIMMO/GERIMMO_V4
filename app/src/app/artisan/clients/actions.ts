"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierArtisanMutation } from "@/app/artisan/acces";
import { activationArtisanLocale, chargerActivitePrivee } from "@/lib/artisan-prive";
import { detecterMimeReel, pdfComplet, EXTENSIONS } from "@/lib/file-type";
import { calculerDevis, montantEnCentimes } from "@/lib/devis-structure";
import { assemblerDevisArtisan } from "@/lib/documents/devis-artisan";
import { rendrePdf } from "@/lib/documents/rendu";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { messageErreurPrive, messageRenduPdfEchoue } from "@/lib/artisan-prive-erreurs";
import { exclusionLue, MESSAGE_ECRITURE_FERMEE } from "@/lib/artisan-prive-exclusion";

export type ResultatPrive = {erreur?:string;succes?:string;href?:string};
async function piecePrivee(supabase:SupabaseClient,artisan:string,fichier:File,cle:string) {
  if (!fichier.size||fichier.size>10*1024*1024) throw Error("Choisissez un fichier entre 1 octet et 10 Mo.");
  const octets=new Uint8Array(await fichier.arrayBuffer()); const mime=detecterMimeReel(octets);
  if(!mime||!["application/pdf","image/png","image/jpeg"].includes(mime)||(mime==="application/pdf"&&!pdfComplet(octets))) throw Error("Joignez un PDF complet, un JPEG ou un PNG.");
  const path=`${artisan}/${cle}.${EXTENSIONS[mime]}`;
  const {error:upload}=await supabase.storage.from("artisan-prive").upload(path,octets,{contentType:mime});
  if(upload){const {data:existant}=await supabase.storage.from("artisan-prive").download(path);if(!existant||createHash("sha256").update(new Uint8Array(await existant.arrayBuffer())).digest("hex")!==createHash("sha256").update(octets).digest("hex"))throw Error("Le justificatif n’a pas pu être déposé. Votre saisie est conservée.");}
  const {data,error}=await supabase.rpc("artisan_classer_piece",{p_path:path,p_nom:fichier.name.slice(0,240),p_mime:mime,p_taille:fichier.size,p_sha:createHash("sha256").update(octets).digest("hex")});
  if(error){await supabase.storage.from("artisan-prive").remove([path]);throw Error(error.message);}
  return String(data);
}
export async function enregistrerActivitePrivee(form:FormData):Promise<ResultatPrive> {
  try {
    const action=String(form.get("action")??"");const reglement=["reglement","annuler_reglement"].includes(action);
    if(!activationArtisanLocale(reglement?"reglements":"clients"))throw Error("La saisie de ce module est désactivée. Les dossiers conservés restent consultables.");
    const {supabase,fiche,erreur}=await verifierArtisanMutation();if(!fiche)throw Error(erreur??"Connectez-vous avec votre propre compte artisan.");
    // D25-B (ARC-08) : refusé ou sur liste noire, l'artisan n'écrit plus (client, chantier, devis, facture). On le dit AVANT de produire un
    // PDF au gabarit Gerimmo ou de déposer une pièce ; la base refuse de toute façon. Les règlements déclarés restent hors de cette décision.
    if(!reglement){const {data:exclusion}=await supabase.rpc("artisan_exclusion_plateforme");const fermee=exclusionLue(exclusion);if(fermee)throw Error(MESSAGE_ECRITURE_FERMEE[fermee]);}
    const id=String(form.get("id")??"")||null;const revision=Number(form.get("revision")??0);const cle=String(form.get("cle")??"");
    if(!/^[a-f\d-]{36}$/i.test(cle))throw Error("Rechargez le formulaire avant de continuer.");
    const donnees:Record<string,unknown>={};
    for(const key of ["nom","type","email","telephone","adresse","titre","description","valide_jusqu_au","devis_id","decision","motif","conflit_motif","bilan","numero","justification","date","moyen","reference","reglement_id"]){const v=form.get(key);if(typeof v==="string")donnees[key]=v.trim();}
    if(action==="archiver_client")donnees.archive=form.get("archive")==="true";
    if(action==="devis")donnees.lignes=calculerDevis(JSON.parse(String(form.get("lignes")??"[]"))).lignes;
    if(action==="planning")for(const k of ["debut","fin"]){const d=new Date(String(form.get(k)));if(!Number.isFinite(d.getTime()))throw Error("Vérifiez les dates du rendez-vous.");donnees[k]=d.toISOString();}
    if(action==="facture"||action==="reglement") {const cents=montantEnCentimes(String(form.get("montant")??""));if(cents===null||cents<=0)throw Error("Indiquez un montant positif, au centime.");donnees[action==="facture"?"montant_ttc_cents":"montant_cents"]=cents;}
    if(action==="valider_devis") {
      const {data}=await chargerActivitePrivee();const h=data?.chantiers.find(x=>x.id===id);const d=data?.devis.find(x=>x.id===donnees.devis_id&&x.chantier_id===id);
      if(d?.statut==="valide"&&d.pdf_id)return {succes:"Cette version est déjà validée.",href:`/artisan/chantiers/${id}`};
      if(!d||!h||h.revision!==revision||d.statut!=="brouillon")throw Error("Le devis a changé. Rechargez et relisez sa dernière version.");
      const document=assemblerDevisArtisan({id:d.id,description:d.description,lignes:d.lignes,montant_ht_cents:Number(d.montant_ht_cents),montant_tva_cents:Number(d.montant_tva_cents),montant_ttc_cents:Number(d.montant_ttc_cents),diagnostic:null,delai_intervention:null,duree_estimee:null,contraintes:null,observations:null,statut:"valide",depose_le:d.created_at,valide_jusqu_au:d.valide_jusqu_au,artisan_nom:d.entreprise.nom,artisan_siret:d.entreprise.siret,artisan_telephone:d.entreprise.telephone,artisan_email:d.entreprise.email,artisan_adresse:d.entreprise.adresse??"",artisan_mentions:d.entreprise.mentions??"",agence_nom:d.client.nom,incident_numero:`Client externe · ${h.titre} · version ${d.version}`,commune:h.adresse,code_postal:null});
      // Un devis incomplet est un refus métier (on dit ce qui manque) ; un moteur PDF en panne est technique : référence au support, jamais le texte brut (ARC-01).
      const refus=refusDocumentIncomplet(document);if(refus)throw Error(`Le PDF ne peut pas être généré : information manquante (${refus.manquants.join(" ; ")}). Complétez-la, puis relancez.`);
      let pdf:Uint8Array;try{pdf=await rendrePdf(document);}catch(e){throw Error(messageRenduPdfEchoue(e));}
      donnees.piece_id=await piecePrivee(supabase,fiche.artisan_id,new File([new Uint8Array(pdf)],`DEV-${d.id.slice(0,8).toUpperCase()}-v${d.version}.pdf`,{type:"application/pdf"}),cle);
    } else {
      const fichier=form.get("fichier");
      if(fichier instanceof File&&fichier.size)donnees.piece_id=await piecePrivee(supabase,fiche.artisan_id,fichier,cle);
    }
    const {data,error}=reglement?await supabase.rpc("artisan_reglement_ecrire",{p_action:action,p_origine:String(form.get("origine")),p_facture:id,p_donnees:donnees,p_cle:cle}):await supabase.rpc("artisan_externe_ecrire",{p_action:action,p_id:id,p_revision:revision,p_donnees:donnees,p_cle:cle});
    if(error)throw Error(messageErreurPrive(action,error.message));
    for(const path of ["/artisan/clients","/artisan/agenda","/artisan/facturation"])revalidatePath(path);
    const href=reglement?`/artisan/facturation/${id}`:["client","modifier_client","archiver_client"].includes(action)?`/artisan/clients/${data}`:`/artisan/chantiers/${data}`;
    revalidatePath(href);return{succes:"Enregistré dans votre espace privé.",href};
  }catch(e){return{erreur:e instanceof Error?e.message:"L’enregistrement a échoué. Votre saisie est conservée."};}
}
