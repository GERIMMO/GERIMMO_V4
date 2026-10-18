import { assemblerSignatureDevis } from "./signature-devis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELES, type Modele } from "./documents/modeles";
import { chargerContexteBail } from "./documents/modeles/communs";
import { refusDocumentIncomplet } from "./documents/completude";
import { ajouterPagesSignature, assemblerSignatureBail, empreinteSignatureBail, partiesSignatureBail, type CircuitBail, type AnnexeSignature } from "./signature-bail";
import { DOCUMENTS_ZOHO, selectionSignatureValide, type SelectionSignature } from "./politique-signature";
import { marquerDocumentEssai, signatureEnEssai } from "./signature-essai";

export function selectionDuCircuit(c: CircuitBail): SelectionSignature {
  return { code: c.modele ?? "bail", cibleId: c.cible_id ?? c.bail_id ?? c.document_id, options: c.options ?? {} };
}
export async function assemblerSignatureDocument(db: SupabaseClient, org: string, brut: SelectionSignature) {
  const selection = selectionSignatureValide(brut);
  if (selection.code === "bail") return { ...await assemblerSignatureBail(db,org,selection.cibleId), bailId: selection.cibleId, selection };
  if (selection.code === "devis_artisan") return assemblerSignatureDevis(db,org,selection);
  let bailId = selection.cibleId;
  if (selection.code === "edl") {
    const r = await db.from("etats_des_lieux").select("bail_id,etat,date_edl").eq("id",selection.cibleId).eq("organization_id",org).single();
    if (r.error || !r.data) throw new Error("État des lieux inaccessible.");
    if (r.data.etat === "signe") throw new Error("Cet état des lieux est déjà signé.");
    bailId = r.data.bail_id;
  }
  const ctx = await chargerContexteBail(db,org,bailId);
  if ("erreur" in ctx) throw new Error(ctx.erreur);
  const personnes = await db.from("bail_personnes").select("date_depart").eq("bail_id",bailId).eq("organization_id",org);
  if (personnes.error) throw new Error("Les parties du document ne peuvent pas être vérifiées.");
  if ((personnes.data ?? []).some(p=>p.date_depart)) throw new Error("Le bail contient une personne sortie : vérifiez les parties de ce document avant de demander leur signature.");
  // Les garants ne signent pas tous les documents du ménage : un acte par caution.
  const garant = selection.code === "cautionnement" ? ctx.garants.find(g=>g.id===selection.options?.garant) : undefined;
  if (selection.code === "cautionnement" && !garant) throw new Error("Choisissez un garant rattaché à ce bail.");
  const parties = partiesSignatureBail({ ...ctx, garants: garant ? [garant] : [] }, selection.code !== "cautionnement");
  const signataires = selection.code === "cautionnement" ? parties.signataires.filter(s=>s.qualite==="Garant"||s.qualite==="Propriétaire") : parties.signataires;
  const modele: Modele = MODELES[selection.code];
  const assemblage = await modele.assembler(db,org,selection.cibleId,selection.options);
  if ("erreur" in assemblage) throw new Error(assemblage.erreur);
  const manquants = [...parties.manquants, ...(refusDocumentIncomplet(assemblage.document)?.manquants ?? [])];
  if (selection.code === "cautionnement") {
    if (!assemblage.mentionCaution) manquants.push("Complétez le plafond et la mention personnelle de la caution.");
    else if (assemblage.mentionCaution.length > 1000) manquants.push("La mention de caution dépasse la place disponible pour la signature en ligne. Contactez l’assistance pour adapter cet acte.");
    for (const s of signataires) if (s.qualite === "Garant") s.mentionCaution = assemblage.mentionCaution;
  }
  const annexes: AnnexeSignature[] = [];
  if (selection.code === "cautionnement") {
    const circuit = await db.from("bail_signature_circuits").select("document_id,document_signe").eq("organization_id",org).eq("bail_id",bailId).eq("modele","bail").in("etat",["pret","preparation","en_cours","termine"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (circuit.error) throw new Error("La copie du bail ne peut pas être vérifiée.");
    const id = circuit.data?.document_signe ?? circuit.data?.document_id;
    if (!id) manquants.push("Préparez le PDF du bail pour en joindre une copie à la caution.");
    else {
      const piece = await db.from("documents").select("id,titre,storage_path,empreinte,mime_type").eq("id",id).eq("organization_id",org).is("purged_at",null).single();
      if (piece.error || !piece.data || piece.data.mime_type!=="application/pdf" || !piece.data.empreinte) throw new Error("La copie du bail n’est plus disponible.");
      annexes.push({id:piece.data.id,titre:piece.data.titre,storage_path:piece.data.storage_path,empreinte:piece.data.empreinte});
    }
  }
  const signatureDoc = signatureEnEssai(org) ? marquerDocumentEssai(assemblage.document) : assemblage.document;
  const document = ajouterPagesSignature(signatureDoc,signataires,annexes,DOCUMENTS_ZOHO[selection.code],selection.code === "cautionnement");
  const empreinte = empreinteSignatureBail(document.html,signataires);
  return { ...assemblage, document, empreinte, signataires, manquants, annexes, bailId, selection };
}
