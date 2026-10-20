import { telechargerDossierSigneZoho } from "./zoho-sign";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CircuitBail } from "./signature-bail";
import { ERREUR_MENTION_CAUTION, mentionCautionConforme } from "./mention-caution";
import { verifierAvantEffet } from "./controle-effets";
import { lireDemandeSignature, telechargerDocumentSignature, telechargerPreuveSignature, type ConfigurationSignature } from "./signature-prestataire";

/** Le webhook est un signal : l'état courant est relu auprès du prestataire. */
export async function synchroniserCircuitSignatureBail(db: SupabaseClient, config: ConfigurationSignature, id: string): Promise<void> {
  const jeton = randomUUID();
  const verrou = await db.rpc("verrouiller_signature_bail",{p_circuit:id,p_jeton:jeton});
  if (verrou.error) throw new Error("Le suivi des signatures est indisponible.");
  if (!verrou.data) throw new Error("Ce circuit est en cours de vérification. Actualisez dans un instant.");
  try {
    const resultat = await db.from("bail_signature_circuits").select("*").eq("id",id).single();
    if (resultat.error || !resultat.data) throw new Error("Circuit introuvable.");
    const circuit = resultat.data as CircuitBail;
    if (circuit.etat === "termine") return;
    if (circuit.prestataire !== config.prestataire || circuit.environnement !== config.environnement || !circuit.external_request_id) throw new Error("La connexion ne correspond pas à ce circuit.");
    await verifierAvantEffet(db,"signatures");
    const distant = await lireDemandeSignature(config,circuit.external_request_id);
    if (distant.id !== circuit.external_request_id || distant.external_id !== circuit.id) throw new Error("La référence du prestataire ne correspond pas au circuit.");
    const ids = new Set(distant.signers.map(s=>s.id));
    if (distant.signers.length !== circuit.signataires.length || ids.size !== circuit.signataires.length || circuit.signataires.some(s=>!s.externalId || !ids.has(s.externalId))) {
      // Brouillon interrompu pendant sa préparation : garder sa référence,
      // permettre l'annulation, ne jamais envoyer une liste partielle.
      throw new Error("La liste des signataires doit être rapprochée du prestataire.");
    }
    if (config.prestataire === "zoho" && circuit.signataires.some(s => {
      const distantSigner = distant.signers.find(p => p.id === s.externalId);
      return !distantSigner || !("email" in distantSigner) || String(distantSigner.email).toLowerCase() !== s.email.toLowerCase();
    })) throw new Error("Un destinataire a changé chez Zoho Sign. Le dossier doit être vérifié.");
    const parties = circuit.signataires.map(s=>({...s,statut:distant.signers.find(p=>p.id===s.externalId)!.status}));
    if (circuit.modele === "cautionnement" && (distant.status === "done" || parties.some(s=>s.qualite === "Garant" && s.statut === "signed"))) {
      const garants = parties.filter(s=>s.qualite === "Garant");
      const mentionValide = config.prestataire === "zoho" && garants.length === 1 && garants.every(s=>{
        const p = distant.signers.find(p=>p.id===s.externalId);
        const mentions = p && "mentions" in p && Array.isArray(p.mentions) ? p.mentions : [];
        return mentions.length === 1 && mentionCautionConforme(s.mentionCaution,mentions[0]);
      });
      if (!mentionValide && !["canceled","deleted","expired","declined","rejected"].includes(distant.status)) {
        const refus = await db.from("bail_signature_circuits").update({signataires:parties,etat:"a_verifier",erreur:ERREUR_MENTION_CAUTION,updated_at:new Date().toISOString()}).eq("id",id).eq("verrou_jeton",jeton);
        if (refus.error) throw new Error("Le contrôle de la mention ne peut pas être enregistré.");
        return; // Pas d'archive validée, même si le prestataire déclare toutes les signatures finies.
      }
    }
    const etat: CircuitBail["etat"] = distant.status === "done" ? "en_cours"
      : distant.status === "canceled" || distant.status === "deleted" ? "annule"
      : distant.status === "expired" ? "expire"
      : distant.status === "declined" || distant.status === "rejected" ? "refuse"
      : distant.status === "ongoing" ? "en_cours" : "a_verifier";
    const miseAJour = await db.from("bail_signature_circuits").update({signataires:parties,etat,
      ...(!circuit.envoye_le && distant.envoyeLe && Date.parse(distant.envoyeLe)>=Date.parse(circuit.created_at) ? {envoye_le:distant.envoyeLe} : {}),
      erreur:etat === "a_verifier" ? "Ce circuit n’est pas actif chez le prestataire."
        : etat === "refuse" ? `Signature refusée. ${distant.decline_information?.reason?.replace(/[\u0000-\u001f]/g," ").slice(0,500) || "Consultez le motif dans le suivi du prestataire."}`
        : parties.some(s=>s.statut === "error") ? "Une invitation n’a pas pu être délivrée. Vérifiez les coordonnées avant de préparer un nouvel envoi." : null,updated_at:new Date().toISOString()}).eq("id",id).eq("verrou_jeton",jeton);
    if (miseAJour.error) throw new Error("La progression n’a pas pu être enregistrée.");
    if (distant.status !== "done") return;
    if (!circuit.external_document_id || parties.some(s=>s.statut !== "signed")) throw new Error("Le prestataire n’a pas confirmé toutes les signatures.");
    const racine = `${circuit.organization_id}/signature-bail/${id}/`;
    const archives: {path:string;size:number;hash:string}[] = [];
    // Séquentiel pour borner la mémoire et le quota prestataire.
    for (let i=0;i<=parties.length;i++) {
      if (i > 1 && config.prestataire === "zoho") {
        // La GED déduplique par empreinte. Tous les signataires Zoho référencent
        // donc le même certificat, sans recréer de document ni de fichier.
        archives.push({...archives[1]});
        continue;
      }
      await verifierAvantEffet(db,"signatures");
      const contenu = i === 0
        ? circuit.modele === "devis_artisan" && config.prestataire === "zoho"
          ? await telechargerDossierSigneZoho(config,circuit.external_request_id)
          : await telechargerDocumentSignature(config,circuit.external_request_id,circuit.external_document_id)
        : await telechargerPreuveSignature(config,circuit.external_request_id,parties[i-1].externalId!);
      const path = `${racine}${i === 0 ? "contrat.pdf" : `preuve-${i}.pdf`}`;
      const depot = await db.storage.from("documents").upload(path,contenu,{contentType:"application/pdf",upsert:true});
      if (depot.error) throw new Error("Une archive n’a pas pu être enregistrée. Le traitement reprendra.");
      archives.push({path,size:contenu.byteLength,hash:createHash("sha256").update(contenu).digest("hex")});
    }
    await verifierAvantEffet(db,"signatures");
    const classe = await db.rpc("archiver_signature_bail",{p_circuit:id,p_jeton:jeton,p_archives:archives});
    if (classe.error) throw new Error("Le classement des archives doit être repris.");
  } finally {
    await db.from("bail_signature_circuits").update({verrou_jeton:null,verrou_jusqua:null}).eq("id",id).eq("verrou_jeton",jeton);
  }
}
