"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { verifierGerant } from "@/lib/ged-acces";
import { clientDeService } from "@/lib/supabase/service";
import { configurationSignatureBail, configurationSuiviSignatureBail, type AnnexeSignature, type CircuitBail, type SignataireBail } from "@/lib/signature-bail";
import { rendrePdf } from "@/lib/documents/rendu";
import { deposerFichierGed } from "@/lib/ged-depot";
import { appliquerMarqueDocument } from "@/lib/documents/marque";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { activerDemandeSignature, annulerDemandeSignature, lireDemandeSignature, preparerCircuitSignature, supprimerBrouillonSignature, prestataireSignature } from "@/lib/signature-prestataire";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { verifierAvantEffet } from "@/lib/controle-effets";
import { sansJargon } from "@/lib/erreurs";
import { assemblerSignatureDocument, selectionDuCircuit } from "@/lib/signature-document";
import { selectionSignatureValide, type SelectionSignature } from "@/lib/politique-signature";
import { signatureEnEssai } from "@/lib/signature-essai";
import { fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { ERREUR_MENTION_CAUTION } from "@/lib/mention-caution";

export type VueSignatureBail = {
  bailId?: string | null; selection?: SelectionSignature; erreur?: string; succes?: string; manquants?: string[]; signataires?: SignataireBail[];
  circuit?: CircuitBail | null; mode?: "indisponible" | "sandbox" | "production";
  annexes?: AnnexeSignature[];
  versionDepassee?: boolean;
  essai?: boolean;
  /** Message affiché quand l'envoi de ce seul modèle est fermé par réglage serveur (le PDF reste préparable). */
  fermeture?: string;
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
  const { data, error } = await g.supabase.from("bail_signature_circuits").select("*").eq("id", id).eq("organization_id", org).single();
  if (error || !data || (data.modele === "devis_artisan" ? data.cible_id : data.bail_id) !== bail) throw new Error("Le circuit de signature n’est pas accessible.");
  return { ...g, circuit: data as CircuitBail };
}
function rafraichir(org: string, bail: string) {
  revalidatePath(`/agence/${org}/baux/${bail}`);
  revalidatePath(`/agence/${org}/documents`);
  revalidatePath(`/agence/${org}/incidents`);
  revalidatePath(`/espace/${org}/incidents`);
  revalidatePath(`/espace/${org}/baux/${bail}`);
}
const erreur = (e: unknown): VueSignatureBail => ({ erreur: e instanceof Error ? sansJargon(e.message) : "Cette opération n’a pas pu être confirmée. Actualisez le suivi avant de réessayer." });

export async function lireSignatureBail(org: string, bail: string, choix?: SelectionSignature): Promise<VueSignatureBail> {
  try {
    const { supabase } = await acces(org);
    const selection = selectionSignatureValide(choix ?? {code:"bail",cibleId:bail});
    let requete = supabase.from("bail_signature_circuits").select("*").eq("organization_id",org)
      .eq("modele",selection.code).eq("cible_id",selection.cibleId);
    if (selection.code === "cautionnement") requete = requete.eq("options->>garant",selection.options?.garant ?? "");
    const {data,error} = await requete.order("created_at",{ascending:false}).limit(1);
    if (error) throw new Error("Le suivi des signatures n’est pas encore disponible dans cet environnement.");
    const circuit = (data?.[0] ?? null) as CircuitBail | null;
    const fournisseur = circuit?.prestataire ?? (selection.code === "bail" ? prestataireSignature() : "zoho");
    // Fermeture ciblée d'un modèle (ZOHO_SIGN_CAUTIONNEMENT_FERME=1 ou true) : l'envoi est indisponible, la préparation du PDF reste possible.
    // Elle ne vaut que pour un NOUVEL envoi : un circuit déjà envoyé (préparation, en cours, à vérifier) garde le mode d'avant et
    // ne porte pas le message, dont le « signer hors ligne » serait trompeur alors que les invitations sont parties (relecture du 19/10).
    const fermeture = circuit && ["preparation", "en_cours", "a_verifier"].includes(circuit.etat) ? undefined : fermetureModeleSignature(selection.code) ?? undefined;
    const mode = fermeture ? "indisponible" : (selection.code !== "devis_artisan" || process.env.ZOHO_SIGN_DEVIS_ACTIF === "true" || signatureEnEssai(org)) && (selection.code === "bail" || (fournisseur === "zoho" && (process.env.ZOHO_SIGN_DOCUMENTS_ACTIF === "true" || signatureEnEssai(org)))) ? configurationSignatureBail(process.env,fournisseur,org)?.environnement ?? "indisponible" : "indisponible";
    // Un dossier déjà envoyé reste consultable même si ses données courantes ont changé.
    if (circuit && circuit.etat !== "pret") return { bailId:circuit.bail_id, selection:selectionDuCircuit(circuit), circuit, signataires:circuit.signataires, annexes:circuit.annexes, mode, essai:signatureEnEssai(org) || circuit.essai, fermeture };
    const preparation = await assemblerSignatureDocument(supabase,org,selection);
    return { bailId:preparation.bailId, selection, circuit, signataires: preparation.signataires, manquants: preparation.manquants, annexes: preparation.annexes,
      versionDepassee: Boolean(circuit && (circuit.empreinte!==preparation.empreinte || (circuit.etat==='pret' && new Date(circuit.expire_le).getTime()<=Date.now()+86_400_000))),
      mode, essai: signatureEnEssai(org), fermeture };
  } catch(e) { return erreur(e); }
}

export async function preparerSignatureBail(org: string, bail: string, choix?: SelectionSignature): Promise<VueSignatureBail> {
  try {
    const { supabase, user } = await acces(org);
    const service = clientDeService(); if (!service) throw new Error("Le rangement sécurisé du circuit est indisponible.");
    const selection = selectionSignatureValide(choix ?? {code:"bail",cibleId:bail});
    const fournisseur = selection.code === "bail" ? prestataireSignature() : "zoho";
    const preparation = await assemblerSignatureDocument(supabase,org,selection);
    bail = preparation.bailId ?? selection.cibleId;
    if (preparation.manquants.length) return { ...await lireSignatureBail(org,bail,selection), erreur: "Complétez les informations signalées avant de préparer le document." };
    let recherche = supabase.from("bail_signature_circuits").select("*").eq("organization_id",org).eq("modele",selection.code).eq("cible_id",selection.cibleId).in("etat",["pret","preparation","en_cours","a_verifier"]);
    if (selection.code === "cautionnement") recherche=recherche.eq("options->>garant",selection.options?.garant ?? "");
    const courant = await recherche.maybeSingle();
    if (courant.error) throw new Error("Le suivi du circuit est indisponible.");
    if (courant.data) {
      if (courant.data.etat !== "pret") throw new Error("Un circuit existe déjà. Vérifiez son suivi ou annulez-le avant de préparer un nouvel envoi.");
      if (courant.data.prestataire === fournisseur && courant.data.empreinte === preparation.empreinte && new Date(courant.data.expire_le).getTime()>Date.now()+86_400_000) return { ...await lireSignatureBail(org,bail,selection), succes: "Le PDF est prêt pour votre relecture." };
      const retire = await service.from("bail_signature_circuits").update({ etat: "annule" }).eq("id",courant.data.id).eq("etat","pret").select("id").single();
      if (retire.error) throw new Error("Le circuit vient de changer. Actualisez son suivi.");
    }
    const pdf = await rendrePdf(appliquerMarqueDocument(preparation.document,await chargerMarque(supabase,org)));
    const depot = await deposerFichierGed(supabase,user,org,new File([Uint8Array.from(pdf).buffer],`${selection.code}-a-signer.pdf`,{type:"application/pdf"}),selection.code === "edl" ? "etat_des_lieux" : ["protocole_apurement","autorisation_travaux","devis_artisan"].includes(selection.code) ? "courrier" : "bail",`${preparation.titreGed} — à signer en ligne`, { genereServeur: true });
    const documentId = depot.documentId ?? depot.doublonId;
    if (!documentId) throw new Error(depot.erreur ?? "Le PDF n’a pas pu être enregistré.");
    const liens = await supabase.from("document_liens").upsert(preparation.liens.map(l=>({ organization_id:org,document_id:documentId,entite:l.entite,entite_id:l.entiteId })),{onConflict:"document_id,entite,entite_id",ignoreDuplicates:true});
    if (liens.error) throw new Error("Le PDF est enregistré, mais son lien avec le bail doit être réparé. Réessayez la préparation.");
    const insertion = await service.from("bail_signature_circuits").insert({ organization_id:org,bail_id:preparation.bailId,document_id:documentId,created_by:user.id,modele:selection.code,cible_id:selection.cibleId,options:selection.options,essai:signatureEnEssai(org),...("incidentId" in preparation ? {incident_id:preparation.incidentId,expire_le:preparation.expireLe} : {}),
      prestataire:fournisseur,environnement:configurationSignatureBail(process.env,fournisseur,org)?.environnement ?? "production",empreinte:preparation.empreinte,pdf_hash:createHash("sha256").update(pdf).digest("hex"),signataires:preparation.signataires,annexes:preparation.annexes });
    if (insertion.error) throw new Error("Un circuit existe déjà ou n’a pas pu être enregistré. Actualisez le suivi.");
    rafraichir(org,bail);
    return { ...await lireSignatureBail(org,bail,selection), succes:"PDF préparé. Relisez-le avant de confirmer l’envoi aux signataires." };
  } catch(e) { return erreur(e); }
}

export async function envoyerSignatureBail(org: string, bail: string, id: string): Promise<VueSignatureBail> {
  let reserve = false;
  let appelPrestataire = false;
  let acteur: string | null = null;
  try {
    const { supabase, user, circuit } = await circuitAutorise(org,bail,id);
    acteur=user.id;
    // Fermeture ciblée d'un modèle : refus avant toute lecture du dossier, toute réservation et tout appel au prestataire.
    const fermeture = fermetureModeleSignature(circuit.modele);
    if (fermeture) throw new Error(fermeture);
    const config = configurationSignatureBail(process.env,circuit.prestataire,org);
    if (circuit.modele && circuit.modele !== "bail" && circuit.prestataire !== "zoho") throw new Error("Ce type de document doit être signé avec Zoho. Préparez un nouveau circuit après la connexion de Zoho.");
    if (circuit.modele === "devis_artisan" && process.env.ZOHO_SIGN_DEVIS_ACTIF !== "true" && !signatureEnEssai(org)) throw new Error("La signature des devis sera disponible après les essais du circuit.");
    if (circuit.modele && circuit.modele !== "bail" && process.env.ZOHO_SIGN_DOCUMENTS_ACTIF !== "true" && !signatureEnEssai(org)) throw new Error("L’envoi des nouveaux types de documents n’est pas encore activé.");
    if (!config) throw new Error("La signature électronique n’est pas encore activée. Le PDF reste disponible et aucun envoi n’a été effectué.");
    if (circuit.environnement !== config.environnement) throw new Error("L’environnement de signature a changé. Annulez cette préparation puis préparez un nouveau PDF.");
    if (new Date(circuit.expire_le).getTime()<=Date.now()+86_400_000) throw new Error(circuit.modele === "devis_artisan" ? "La validité du devis est trop courte pour ouvrir la signature. Demandez à l’artisan une offre valable plus longtemps." : "Cette préparation est trop ancienne. Actualisez le PDF avant de l’envoyer.");
    if (config.environnement === "sandbox" && !(process.env.ZOHO_SIGN_ORGS_TEST ?? "").split(",").map(x=>x.trim()).includes(org)) throw new Error("Cet espace n’est pas autorisé pour les essais de signature.");
    const service = clientDeService(); if (!service) throw new Error("Le suivi sécurisé est indisponible.");
    const preparation = await assemblerSignatureDocument(supabase,org,selectionDuCircuit(circuit));
    if (preparation.manquants.length || preparation.empreinte !== circuit.empreinte) throw new Error("Le dossier a changé depuis la préparation. Préparez et relisez un nouveau PDF.");
    if (!circuit.modele || circuit.modele === "bail") {
      const controle=await supabase.rpc("controler_mise_en_location",{p_bail:bail});
      if(controle.error)throw new Error(sansJargon(controle.error.message));
    }
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
    // Après la réservation, les relevés EDL sont verrouillés en base. Une
    // écriture concurrente juste avant ce verrou doit aussi invalider le PDF.
    if (circuit.modele === "edl" || circuit.modele === "devis_artisan") {
      const verrouille = await assemblerSignatureDocument(supabase,org,selectionDuCircuit(circuit));
      if (verrouille.manquants.length || verrouille.empreinte !== circuit.empreinte) {
        throw new Error("Le relevé a changé. Aucun appel au prestataire n’a été effectué. Préparez un nouveau PDF.");
      }
    }
    const expiration = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(circuit.expire_le));
    const cree = await preparerCircuitSignature({ config,pdf:contenu,nomFichier:"document-gerimmo.pdf",
      titre:signatureEnEssai(org) ? "GERIMMO — ESSAI DE SIGNATURE SANS ENGAGEMENT" : config.environnement === "sandbox" ? "TEST FICTIF — Document Gerimmo" : preparation.titreGed,referenceExterne:id,expiration,
      signataires:circuit.signataires,annexes,creationCommencee:()=>{appelPrestataire=true;},demandeCreee:async externalId=>{
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
    return { ...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),succes:"Le premier signataire est invité par e-mail. Les suivants seront invités dans l’ordre indiqué." };
  } catch(e) {
    if (reserve && !appelPrestataire) {
      // La réservation a réussi, mais aucune création distante n’a commencé.
      // Une panne de relecture ne doit pas laisser un circuit impossible à annuler.
      const service=clientDeService();
      const retrait=await service?.rpc("abandonner_preparation_signature",{p_circuit:id,p_actor:acteur});
      if (retrait?.data === true && !retrait.error) reserve=false;
    }
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
    return lireSignatureBail(org,bail,selectionDuCircuit(circuit));
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
      if (actuel.status === "done") {
        await synchroniserCircuitSignatureBail(service,config,id);
        const suivi = await service.from("bail_signature_circuits").select("etat,erreur").eq("id",id).single();
        if (suivi.error || !suivi.data) throw new Error("Le classement du document doit être vérifié.");
        if (circuit.modele === "cautionnement" && suivi.data.etat === "a_verifier" && suivi.data.erreur === ERREUR_MENTION_CAUTION) {
          // Écarter le circuit non conforme sans altérer le fichier signé ni sa preuve chez Zoho.
          const ecarte = await service.from("bail_signature_circuits").update({etat:"annule",erreur:ERREUR_MENTION_CAUTION,updated_at:new Date().toISOString()}).eq("id",id).eq("etat","a_verifier").eq("erreur",ERREUR_MENTION_CAUTION).select("id").single();
          if (ecarte.error || !ecarte.data) throw new Error("Le circuit vient de changer. Actualisez son suivi.");
          rafraichir(org,bail);
          return {...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),succes:"Cautionnement écarté du parcours de validation. Son historique est conservé ; préparez un nouvel acte avec la mention complète."};
        }
        if (suivi.data.etat !== "termine") throw new Error("Le document signé n’a pas encore été validé et archivé. Consultez son suivi.");
        return {...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),succes:"Le contrat était déjà signé. Son archive a été récupérée."};
      }
      if (["expired","declined","rejected"].includes(actuel.status)) {
        await synchroniserCircuitSignatureBail(service,config,id);
        return {...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),succes:actuel.status === "expired" ? "L’invitation a expiré. Vous pouvez préparer une nouvelle version." : "La signature a été refusée. Consultez son suivi avant de préparer une nouvelle version."};
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
    let retrait = service.from("bail_signature_circuits").update({etat:"annule",erreur:null,updated_at:new Date().toISOString()}).eq("id",id);
    retrait = circuit.etat === "pret"
      ? retrait.eq("etat","pret").is("external_request_id",null)
      : retrait.in("etat",["preparation","en_cours","a_verifier"]).eq("external_request_id",circuit.external_request_id);
    const fin = await retrait.select("id").single();
    if (fin.error || !fin.data) throw new Error("Le circuit a changé. Actualisez son suivi avant de demander son arrêt.");
    rafraichir(org,bail);
    return {...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),succes:"Circuit annulé. Vous pouvez préparer une nouvelle version."};
  } catch(e) { return erreur(e); }
}

export async function activerBailApresSignature(org:string,bail:string,id:string): Promise<VueSignatureBail> {
  try {
    if (signatureEnEssai(org)) throw new Error("Un essai de signature ne met pas un logement en location.");
    const {supabase,circuit} = await circuitAutorise(org,bail,id);
    if (circuit.modele && circuit.modele !== "bail") throw new Error("Seul le bail signé permet la mise en location.");
    const actuel = await assemblerSignatureDocument(supabase,org,selectionDuCircuit(circuit));
    if (actuel.empreinte !== circuit.empreinte) throw new Error("Les informations du dossier ont changé après la préparation du contrat. Vérifiez le PDF signé avant toute activation auprès de l’assistance.");
    const result = await supabase.rpc("activer_bail_signature_electronique",{p_circuit:id});
    if (result.error) throw new Error(sansJargon(result.error.message));
    rafraichir(org,bail);
    return {succes:"Le bail est activé. Le contrat signé et toutes ses preuves sont conservés dans Documents."};
  } catch(e) { return erreur(e); }
}
