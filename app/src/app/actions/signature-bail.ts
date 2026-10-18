"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { verifierGerant } from "@/lib/ged-acces";
import { clientDeService } from "@/lib/supabase/service";
import { assemblerSignatureBail, configurationSignatureBail, configurationSuiviSignatureBail, type AnnexeSignature, type CircuitBail, type SignataireBail } from "@/lib/signature-bail";
import { rendrePdf } from "@/lib/documents/rendu";
import { deposerFichierGed } from "@/lib/ged-depot";
import { appliquerMarqueDocument } from "@/lib/documents/marque";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { activerDemandeSignature, annulerDemandeSignature, lireDemandeSignature, preparerCircuitSignature, supprimerBrouillonSignature, prestataireSignature } from "@/lib/signature-prestataire";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { verifierAvantEffet } from "@/lib/controle-effets";
import { sansJargon } from "@/lib/erreurs";
import { signatureEnEssai } from "@/lib/signature-essai";

export type VueSignatureBail = {
  erreur?: string; succes?: string; manquants?: string[]; signataires?: SignataireBail[];
  circuit?: CircuitBail | null; mode?: "indisponible" | "sandbox" | "production";
  annexes?: AnnexeSignature[];
  versionDepassee?: boolean;
  essai?: boolean;
};
async function acces(org: string) {
  const g = await verifierGerant(org);
  if (!g.user) throw new Error("Connectez-vous à votre espace propriétaire.");
  if (signatureEnEssai(org) && g.user.app_metadata?.gerimmo_recette !== "permanente-v1") throw new Error("Cet essai est réservé au compte de recette permanent.");
  const droit = await g.supabase.rpc("has_org_role", { org, roles: ["proprietaire_direct"] });
  if (droit.error || !droit.data) throw new Error("La signature doit être demandée depuis votre propre espace propriétaire.");
  return { ...g, user: g.user };
}
async function circuitAutorise(org: string, bail: string, id: string) {
  const g = await acces(org);
  const { data, error } = await g.supabase.from("bail_signature_circuits").select("*").eq("id", id).eq("organization_id", org).eq("bail_id", bail).single();
  if (error || !data) throw new Error("Le circuit de signature n’est pas accessible.");
  return { ...g, circuit: data as CircuitBail };
}
function rafraichir(org: string, bail: string) {
  revalidatePath(`/agence/${org}/baux/${bail}`);
  revalidatePath(`/agence/${org}/documents`);
  revalidatePath(`/espace/${org}/baux/${bail}`);
}
const erreur = (e: unknown): VueSignatureBail => ({ erreur: e instanceof Error ? sansJargon(e.message) : "Cette opération n’a pas pu être confirmée. Actualisez le suivi avant de réessayer." });

export async function lireSignatureBail(org: string, bail: string): Promise<VueSignatureBail> {
  try {
    const { supabase } = await acces(org);
    const [{ data, error }, preparation] = await Promise.all([
      supabase.from("bail_signature_circuits").select("*").eq("organization_id", org).eq("bail_id", bail).order("created_at", { ascending: false }).limit(1),
      assemblerSignatureBail(supabase, org, bail),
    ]);
    if (error) throw new Error("Le suivi des signatures n’est pas encore disponible dans cet environnement.");
    const circuit = (data?.[0] ?? null) as CircuitBail | null;
    return { circuit, signataires: preparation.signataires, manquants: preparation.manquants, annexes: preparation.annexes,
      versionDepassee: Boolean(circuit && (circuit.empreinte!==preparation.empreinte || (circuit.etat==='pret' && new Date(circuit.expire_le).getTime()<=Date.now()+86_400_000))),
      mode: configurationSignatureBail(process.env,circuit?.prestataire,org)?.environnement ?? "indisponible", essai: signatureEnEssai(org) };
  } catch(e) { return erreur(e); }
}

export async function preparerSignatureBail(org: string, bail: string): Promise<VueSignatureBail> {
  try {
    const { supabase, user } = await acces(org);
    const service = clientDeService(); if (!service) throw new Error("Le rangement sécurisé du circuit est indisponible.");
    const preparation = await assemblerSignatureBail(supabase, org, bail);
    if (preparation.manquants.length) return { ...await lireSignatureBail(org,bail), erreur: "Complétez les informations signalées avant de préparer le bail." };
    const courant = await supabase.from("bail_signature_circuits").select("*").eq("organization_id",org).eq("bail_id",bail).in("etat",["pret","preparation","en_cours","a_verifier"]).maybeSingle();
    if (courant.error) throw new Error("Le suivi du circuit est indisponible.");
    if (courant.data) {
      if (courant.data.etat !== "pret") throw new Error("Un circuit existe déjà. Vérifiez son suivi ou annulez-le avant de préparer un nouvel envoi.");
      if (courant.data.prestataire === prestataireSignature() && courant.data.empreinte === preparation.empreinte && new Date(courant.data.expire_le).getTime()>Date.now()+86_400_000) return { ...await lireSignatureBail(org,bail), succes: "Le PDF est prêt pour votre relecture." };
      const retire = await service.from("bail_signature_circuits").update({ etat: "annule" }).eq("id",courant.data.id).eq("etat","pret").select("id").single();
      if (retire.error) throw new Error("Le circuit vient de changer. Actualisez son suivi.");
    }
    const pdf = await rendrePdf(appliquerMarqueDocument(preparation.document,await chargerMarque(supabase,org)));
    const depot = await deposerFichierGed(supabase,user,org,new File([Uint8Array.from(pdf).buffer],"bail-a-signer.pdf",{type:"application/pdf"}),"bail",`${preparation.titreGed} — à signer en ligne`);
    const documentId = depot.documentId ?? depot.doublonId;
    if (!documentId) throw new Error(depot.erreur ?? "Le PDF n’a pas pu être enregistré.");
    const liens = await supabase.from("document_liens").upsert(preparation.liens.map(l=>({ organization_id:org,document_id:documentId,entite:l.entite,entite_id:l.entiteId })),{onConflict:"document_id,entite,entite_id",ignoreDuplicates:true});
    if (liens.error) throw new Error("Le PDF est enregistré, mais son lien avec le bail doit être réparé. Réessayez la préparation.");
    const insertion = await service.from("bail_signature_circuits").insert({ organization_id:org,bail_id:bail,document_id:documentId,created_by:user.id,
      prestataire:prestataireSignature(),environnement:configurationSignatureBail(process.env,prestataireSignature(),org)?.environnement ?? "production",empreinte:preparation.empreinte,pdf_hash:createHash("sha256").update(pdf).digest("hex"),signataires:preparation.signataires,annexes:preparation.annexes });
    if (insertion.error) throw new Error("Un circuit existe déjà ou n’a pas pu être enregistré. Actualisez le suivi.");
    rafraichir(org,bail);
    return { ...await lireSignatureBail(org,bail), succes:"PDF préparé. Relisez-le avant de confirmer l’envoi aux signataires." };
  } catch(e) { return erreur(e); }
}

export async function envoyerSignatureBail(org: string, bail: string, id: string): Promise<VueSignatureBail> {
  let reserve = false;
  try {
    const { supabase, user, circuit } = await circuitAutorise(org,bail,id);
    const config = configurationSignatureBail(process.env,circuit.prestataire,org);
    if (!config) throw new Error("La signature électronique n’est pas encore activée. Le PDF reste disponible et aucun envoi n’a été effectué.");
    if (circuit.environnement !== config.environnement) throw new Error("L’environnement de signature a changé. Annulez cette préparation puis préparez un nouveau PDF.");
    if (new Date(circuit.expire_le).getTime()<=Date.now()+86_400_000) throw new Error("Cette préparation est trop ancienne. Actualisez le PDF avant de l’envoyer.");
    if (config.environnement === "sandbox" && !(process.env[config.prestataire === "zoho" ? "ZOHO_SIGN_ORGS_TEST" : "YOUTRUST_ORGS_TEST"] ?? "").split(",").map(x=>x.trim()).includes(org)) throw new Error("Cet espace n’est pas autorisé pour les essais de signature.");
    const service = clientDeService(); if (!service) throw new Error("Le suivi sécurisé est indisponible.");
    const preparation = await assemblerSignatureBail(supabase,org,bail);
    if (preparation.manquants.length || preparation.empreinte !== circuit.empreinte) throw new Error("Le dossier a changé depuis la préparation. Préparez et relisez un nouveau PDF.");
    const controle=await supabase.rpc("controler_mise_en_location",{p_bail:bail});
    if(controle.error)throw new Error(sansJargon(controle.error.message));
    const { data: doc, error: edoc } = await supabase.from("documents").select("storage_path,empreinte,mime_type").eq("id",circuit.document_id).eq("organization_id",org).single();
    if (edoc || !doc || doc.mime_type !== "application/pdf") throw new Error("Le PDF à signer n’est pas disponible.");
    const fichier = await supabase.storage.from("documents").download(doc.storage_path);
    if (fichier.error || !fichier.data) throw new Error("Le PDF n’a pas pu être chargé.");
    const contenu = new Uint8Array(await fichier.data.arrayBuffer());
    if (createHash("sha256").update(contenu).digest("hex") !== circuit.pdf_hash) throw new Error("Le fichier ne correspond plus au PDF préparé. Préparez une nouvelle version avant l’envoi.");
    const annexes:{pdf:Uint8Array;nomFichier:string}[]=[];
    let total=contenu.byteLength;
    for(const a of circuit.annexes) {
      const piece=await supabase.storage.from("documents").download(a.storage_path);
      if(piece.error || !piece.data)throw new Error("Une annexe n’a pas pu être chargée.");
      total+=piece.data.size;
      if(total>50_000_000)throw new Error("Les annexes dépassent 50 Mo. Réduisez la taille des PDF avant l’envoi.");
      const octets=new Uint8Array(await piece.data.arrayBuffer());
      if(createHash("sha256").update(octets).digest("hex")!==a.empreinte)throw new Error("Une annexe a changé. Préparez un nouveau dossier avant l’envoi.");
      annexes.push({pdf:octets,nomFichier:`annexe-${annexes.length+1}.pdf`});
    }
    await verifierAvantEffet(service,"signatures");
    const reservation = await service.rpc("reserver_envoi_signature_bail",{p_circuit:id,p_actor:user.id});
    if (reservation.error) throw new Error(sansJargon(reservation.error.message));
    reserve = true;
    const expiration = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(circuit.expire_le));
    const cree = await preparerCircuitSignature({ config,pdf:contenu,nomFichier:"bail-gerimmo.pdf",
      titre:signatureEnEssai(org) ? "GERIMMO — ESSAI DE SIGNATURE SANS ENGAGEMENT" : config.environnement === "sandbox" ? "TEST FICTIF — Bail Gerimmo" : "Votre bail Gerimmo",referenceExterne:id,expiration,
      signataires:circuit.signataires,annexes,demandeCreee:async externalId=>{
        const attache = await service.from("bail_signature_circuits").update({external_request_id:externalId}).eq("id",id).eq("etat","preparation").select("id").single();
        if (attache.error) throw new Error("Le suivi de la demande doit être vérifié avant toute activation.");
      } });
    const attache = await service.from("bail_signature_circuits").update({ external_document_id:cree.documentId,
      signataires:circuit.signataires.map((s,i)=>({...s,externalId:cree.signataireIds[i],statut:"initiated"})) }).eq("id",id).eq("etat","preparation").select("id").single();
    if (attache.error) throw new Error("Les signataires n’ont pas pu être rattachés. Aucune activation n’a été demandée.");
    await verifierAvantEffet(service,"signatures");
    await activerDemandeSignature(config,cree.demandeId,{...circuit,external_document_id:cree.documentId,signataires:circuit.signataires.map((s,i)=>({...s,externalId:cree.signataireIds[i]}))});
    const miseAJour = await service.from("bail_signature_circuits").update({etat:"en_cours",updated_at:new Date().toISOString()}).eq("id",id).eq("etat","preparation");
    if (miseAJour.error) throw new Error("L’envoi doit être rapproché du prestataire.");
    rafraichir(org,bail);
    return { ...await lireSignatureBail(org,bail),succes:"Le premier signataire est invité par e-mail. Les suivants seront invités dans l’ordre, les propriétaires en dernier." };
  } catch(e) {
    if (reserve) {
      await clientDeService()?.from("bail_signature_circuits").update({etat:"a_verifier",erreur:"L’envoi n’a pas pu être confirmé. Actualisez le suivi avant toute nouvelle demande."}).eq("id",id).in("etat",["preparation","en_cours"]);
      return {erreur:"L’envoi n’a pas pu être confirmé. Actualisez le suivi ; ne créez pas une deuxième demande."};
    }
    return erreur(e);
  }
}

export async function actualiserSignatureBail(org: string,bail: string,id: string): Promise<VueSignatureBail> {
  try {
    const {circuit} = await circuitAutorise(org,bail,id);
    const config = configurationSuiviSignatureBail(process.env,circuit.prestataire); const service = clientDeService();
    if (circuit.external_request_id) {
      if (!config || !service || config.environnement !== circuit.environnement) throw new Error("La connexion au prestataire est indisponible. Le dernier état connu est conservé.");
      await synchroniserCircuitSignatureBail(service,config,circuit.id);
    }
    rafraichir(org,bail);
    return lireSignatureBail(org,bail);
  } catch(e) { return erreur(e); }
}

export async function annulerSignatureBail(org: string,bail: string,id: string): Promise<VueSignatureBail> {
  try {
    const {circuit} = await circuitAutorise(org,bail,id); const service = clientDeService();
    if (!service) throw new Error("Le suivi sécurisé est indisponible.");
    if (!["pret","preparation","en_cours","a_verifier"].includes(circuit.etat)) throw new Error("Ce circuit est déjà terminé.");
    if (circuit.etat !== "pret") {
      const config = configurationSuiviSignatureBail(process.env,circuit.prestataire);
      if (!config || config.environnement !== circuit.environnement || !circuit.external_request_id) throw new Error("L’arrêt ne peut pas être confirmé. Le support doit rapprocher la demande avec le prestataire avant un nouvel envoi.");
      await verifierAvantEffet(service,"signatures");
      const actuel = await lireDemandeSignature(config,circuit.external_request_id);
      if (actuel.id !== circuit.external_request_id || actuel.external_id !== circuit.id) throw new Error("La référence du prestataire ne correspond pas au circuit. Aucune annulation n’a été demandée.");
      if (actuel.status === "done") { await synchroniserCircuitSignatureBail(service,config,id); return {...await lireSignatureBail(org,bail),succes:"Le contrat était déjà signé. Son archive a été récupérée."}; }
      if (["expired","declined","rejected"].includes(actuel.status)) {
        await synchroniserCircuitSignatureBail(service,config,id);
        return {...await lireSignatureBail(org,bail),succes:actuel.status === "expired" ? "L’invitation a expiré. Vous pouvez préparer une nouvelle version." : "La signature a été refusée. Consultez son suivi avant de préparer une nouvelle version."};
      }
      if (actuel.status === "draft") {
        await supprimerBrouillonSignature(config,circuit.external_request_id);
        // Zoho conserve le brouillon dans sa corbeille ; Youtrust le supprime via DELETE.
        if (config.prestataire === "zoho") {
          const confirmation = await lireDemandeSignature(config,circuit.external_request_id);
          if (confirmation.id !== circuit.external_request_id || confirmation.external_id !== circuit.id || confirmation.status !== "deleted") throw new Error("Le retrait du brouillon n’a pas encore été confirmé par le prestataire. Actualisez le suivi.");
        }
      }
      else if (["ongoing","approval"].includes(actuel.status)) {
        await annulerDemandeSignature(config,circuit.external_request_id);
        const confirmation = await lireDemandeSignature(config,circuit.external_request_id);
        if (confirmation.id !== circuit.external_request_id || confirmation.external_id !== circuit.id || confirmation.status !== "canceled") throw new Error("L’annulation n’a pas encore été confirmée par le prestataire. Actualisez le suivi.");
      } else if (!["canceled","expired","declined","rejected","deleted"].includes(actuel.status)) throw new Error("Ce circuit doit être vérifié chez le prestataire avant son annulation.");
    }
    const fin = await service.from("bail_signature_circuits").update({etat:"annule",erreur:null,updated_at:new Date().toISOString()}).eq("id",id).in("etat",["pret","preparation","en_cours","a_verifier"]);
    if (fin.error) throw new Error("L’arrêt chez le prestataire est confirmé, mais le suivi doit être actualisé.");
    rafraichir(org,bail);
    return {...await lireSignatureBail(org,bail),succes:"Circuit annulé. Vous pouvez préparer une nouvelle version."};
  } catch(e) { return erreur(e); }
}

export async function activerBailApresSignature(org:string,bail:string,id:string): Promise<VueSignatureBail> {
  try {
    if (signatureEnEssai(org)) throw new Error("Un essai de signature ne met pas un logement en location.");
    const {supabase,circuit} = await circuitAutorise(org,bail,id);
    const actuel = await assemblerSignatureBail(supabase,org,bail);
    if (actuel.empreinte !== circuit.empreinte) throw new Error("Les informations du dossier ont changé après la préparation du contrat. Vérifiez le PDF signé avant toute activation auprès de l’assistance.");
    const result = await supabase.rpc("activer_bail_signature_electronique",{p_circuit:id});
    if (result.error) throw new Error(sansJargon(result.error.message));
    rafraichir(org,bail);
    return {succes:"Le bail est activé. Le contrat signé et toutes ses preuves sont conservés dans Documents."};
  } catch(e) { return erreur(e); }
}
