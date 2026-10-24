"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierGerant } from "@/lib/ged-acces";
import { clientDeService } from "@/lib/supabase/service";
import { configurationSignatureBail, configurationSuiviSignatureBail, type AnnexeSignature, type CircuitBail, type SignataireBail } from "@/lib/signature-bail";
import { rendrePdf } from "@/lib/documents/rendu";
import { deposerFichierGed } from "@/lib/ged-depot";
import { appliquerMarqueDocument } from "@/lib/documents/marque";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { annulerDemandeSignature, lireDemandeSignature, supprimerBrouillonSignature, prestataireSignature } from "@/lib/signature-prestataire";
import { rapprocherSignatureInterrompue } from "@/lib/signature-suivi";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { verifierAvantEffet } from "@/lib/controle-effets";
import { sansJargon } from "@/lib/erreurs";
import { assemblerSignatureDocument, selectionDuCircuit } from "@/lib/signature-document";
import { selectionSignatureValide, type SelectionSignature } from "@/lib/politique-signature";
import { signatureEnEssai } from "@/lib/signature-essai";
import { fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { ERREUR_MENTION_CAUTION } from "@/lib/mention-caution";
import { REFUS_CONFIRMATION_EDL, controlerEnvoi, envoyerApresControle, telephoneGarantConfirme } from "@/lib/signature-envoi";
import { demanderConfirmationMobileCaution, echeanceLisible } from "@/lib/confirmation-mobile-caution";

export type VueSignatureBail = {
  bailId?: string | null; selection?: SelectionSignature; erreur?: string; succes?: string; manquants?: string[]; signataires?: SignataireBail[];
  circuit?: CircuitBail | null; mode?: "indisponible" | "sandbox" | "production";
  annexes?: AnnexeSignature[];
  versionDepassee?: boolean;
  essai?: boolean;
  /** Message affiché quand l'envoi de ce seul modèle est fermé par réglage serveur (le PDF reste préparable). */
  fermeture?: string;
  /** Acte de cautionnement prêt : dernier lien envoyé à la caution pour qu'elle confirme son mobile (décision du 23/10). */
  attenteCaution?: { envoyeLe: string; expireLe: string; etat: "en_attente" | "expire" | "utilise" };
  /** État des lieux : date « Établi le » du relevé, rappelée près de la case de confirmation sur place. */
  dateEdl?: string | null;
};
/** Le dernier lien de confirmation du mobile, lu avec la clé de service (aucune politique ne l'ouvre aux sessions). */
async function lireAttenteCaution(org: string, circuit: string): Promise<VueSignatureBail["attenteCaution"]> {
  try {
    const service = clientDeService();
    if (!service) return undefined;
    const { data, error } = await service.from("confirmations_mobile_caution").select("cree_le,expire_le,utilise_le,annulee_le")
      .eq("organization_id", org).eq("circuit_id", circuit).is("annulee_le", null).order("cree_le", { ascending: false }).limit(1);
    const lien = error ? null : data?.[0];
    if (!lien) return undefined;
    return { envoyeLe: lien.cree_le, expireLe: lien.expire_le, etat: lien.utilise_le ? "utilise" : new Date(lien.expire_le).getTime() <= Date.now() ? "expire" : "en_attente" };
  } catch { return undefined; }
}
async function lireDateEdl(supabase: SupabaseClient, org: string, edl: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await supabase.from("etats_des_lieux").select("date_edl").eq("id", edl).eq("organization_id", org).maybeSingle();
    return error ? undefined : (data as { date_edl?: string | null } | null)?.date_edl ?? null;
  } catch { return undefined; }
}
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
    // Cautionnement (décision du 23/10) : le mobile du garant n'est jamais celui du dossier ; seul celui qu'il a confirmé
    // lui-même, posé sur le circuit prêt, s'affiche.
    const garantCircuit = selection.code === "cautionnement" ? circuit?.signataires.find(s=>s.qualite==="Garant") : undefined;
    const signataires = garantCircuit?.telephoneConfirmeLe ? preparation.signataires.map(s=>s.qualite==="Garant" ? {...s,telephone:garantCircuit.telephone,telephoneConfirmeLe:garantCircuit.telephoneConfirmeLe} : s) : preparation.signataires;
    return { bailId:preparation.bailId, selection, circuit, signataires, manquants: preparation.manquants, annexes: preparation.annexes,
      versionDepassee: Boolean(circuit && (circuit.empreinte!==preparation.empreinte || (circuit.etat==='pret' && new Date(circuit.expire_le).getTime()<=Date.now()+86_400_000))),
      mode, essai: signatureEnEssai(org), fermeture,
      ...(selection.code === "cautionnement" && circuit ? { attenteCaution: await lireAttenteCaution(org,circuit.id) } : {}),
      ...(selection.code === "edl" ? { dateEdl: await lireDateEdl(supabase,org,selection.cibleId) } : {}) };
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

/** « AAAA-MM-JJ » d'une date du calendrier qui existe. */
function dateVisiteValide(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [annee, mois, jour] = v.split("-").map(Number);
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

/**
 * Envoi d'un circuit prêt. Décision du dirigeant du 23/10 (« Cautionnement et état des lieux signés dans Gerimmo ») :
 *  · état des lieux : `confirmation.surPlace` (la case « établi contradictoirement, sur place », cochée) et
 *    `confirmation.visiteLe` (date de la visite, celle que porte l'état des lieux) ; sans elles, refus avant toute
 *    lecture du dossier (et refus en base) ;
 *  · acte de cautionnement : tant que la caution n'a pas confirmé elle-même son mobile, l'envoi part vers ELLE (lien à
 *    usage unique) et non chez le prestataire ; une fois confirmé, la demande est créée avec son numéro.
 */
export async function envoyerSignatureBail(org: string, bail: string, id: string, confirmation?: { visiteLe?: string; surPlace?: boolean }): Promise<VueSignatureBail> {
  try {
    const { supabase, user, circuit } = await circuitAutorise(org,bail,id);
    if (circuit.modele === "edl" && (confirmation?.surPlace !== true || !dateVisiteValide(confirmation?.visiteLe))) throw new Error(REFUS_CONFIRMATION_EDL);
    // Contrôles sans effet : fermeture ciblée d'un modèle d'abord (avant toute lecture), puis réglages, dossier, PDF.
    const controle = await controlerEnvoi({ db: supabase, org, bail, circuit });
    if (circuit.modele === "cautionnement" && !telephoneGarantConfirme(circuit.signataires)) {
      const service = clientDeService(); if (!service) throw new Error("Le suivi sécurisé est indisponible.");
      const lien = await demanderConfirmationMobileCaution({ service, org, circuit, acteur: user.id });
      rafraichir(org,bail);
      return { ...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),
        succes:`Lien envoyé à la caution (${lien.email}). Elle confirme elle-même son numéro de mobile ; l’acte lui est alors envoyé en signature automatiquement. Vous signerez en dernier, après avoir vérifié sa mention. Le lien expire le ${echeanceLisible(lien.expireLe)}.` };
    }
    const envoi = await envoyerApresControle({ db: supabase, org, circuit, acteur: user.id, controle, visiteLe: confirmation?.visiteLe });
    if ("erreur" in envoi) return { erreur: envoi.erreur };
    rafraichir(org,bail);
    return { ...await lireSignatureBail(org,bail,selectionDuCircuit(circuit)),succes:"Le premier signataire est invité par e-mail. Les suivants seront invités dans l’ordre indiqué." };
  } catch(e) { return erreur(e); }
}

export async function actualiserSignatureBail(org: string,bail: string,id: string): Promise<VueSignatureBail> {
  try {
    const {circuit} = await circuitAutorise(org,bail,id);
    const config = configurationSuiviSignatureBail(process.env,circuit.prestataire); const service = clientDeService();
    if (circuit.external_request_id) {
      if (!config || !service || config.environnement !== circuit.environnement) throw new Error("La connexion au prestataire est indisponible. Le dernier état connu est conservé.");
      await synchroniserCircuitSignatureBail(service,config,circuit.id);
    } else if (["preparation","a_verifier"].includes(circuit.etat)) {
      if (!config || !service) throw new Error("La connexion au prestataire est indisponible.");
      await rapprocherSignatureInterrompue(service,config,circuit.id);
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
