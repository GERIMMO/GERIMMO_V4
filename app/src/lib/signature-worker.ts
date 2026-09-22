import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telechargerDocumentSigneYoutrust, telechargerPreuveYoutrust, type ConfigurationYoutrust } from "@/lib/youtrust";

export type EvenementSignature = { event_id: string; event_name: string; request_id: string; tentatives: number };
type Demande = { organization_id: string; signee_le: string | null; external_document_id: string | null; external_signer_id: string | null };

/** Traite un événement de façon idempotente et conserve l'erreur pour reprise. */
export async function traiterEvenementSignature(
  supabase: SupabaseClient,
  config: ConfigurationYoutrust,
  evenement: EvenementSignature,
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    const { data: demande, error: erreurDemande } = await supabase.from("demandes_signature")
      .select("organization_id,signee_le,external_document_id,external_signer_id")
      .eq("external_request_id", evenement.request_id).maybeSingle();
    if (erreurDemande || !demande) throw new Error("Demande Gerimmo inconnue");
    const d = demande as Demande;
    if (evenement.event_name === "signature_request.done" && !d.signee_le) {
      if (!d.external_document_id || !d.external_signer_id) throw new Error("Identifiants Youtrust incomplets");
      const [signe, preuve] = await Promise.all([
        telechargerDocumentSigneYoutrust(config, evenement.request_id, d.external_document_id),
        telechargerPreuveYoutrust(config, evenement.request_id, d.external_signer_id),
      ]);
      if (signe.byteLength > 10_485_760 || preuve.byteLength > 10_485_760) throw new Error("Archive trop volumineuse");
      const racine = `${d.organization_id}/signature-youtrust/${randomUUID()}`;
      const cheminSigne = `${racine}-signe.pdf`;
      const cheminPreuve = `${racine}-preuve.pdf`;
      const [depotSigne, depotPreuve] = await Promise.all([
        supabase.storage.from("documents").upload(cheminSigne, signe, { contentType: "application/pdf" }),
        supabase.storage.from("documents").upload(cheminPreuve, preuve, { contentType: "application/pdf" }),
      ]);
      if (depotSigne.error || depotPreuve.error) {
        await supabase.storage.from("documents").remove([cheminSigne, cheminPreuve]);
        throw new Error("Archivage des PDF impossible");
      }
      const { error: erreurFinale } = await supabase.rpc("finaliser_signature_youtrust", {
        p_request: evenement.request_id,
        p_signed_path: cheminSigne,
        p_signed_size: signe.byteLength,
        p_signed_hash: createHash("sha256").update(signe).digest("hex"),
        p_proof_path: cheminPreuve,
        p_proof_size: preuve.byteLength,
        p_proof_hash: createHash("sha256").update(preuve).digest("hex"),
      });
      if (erreurFinale) {
        await supabase.storage.from("documents").remove([cheminSigne, cheminPreuve]);
        throw new Error(erreurFinale.message);
      }
    } else if (evenement.event_name !== "signature_request.done") {
      const { error } = await supabase.rpc("classer_echec_signature_youtrust", {
        p_request: evenement.request_id,
        p_statut: evenement.event_name.replace("signature_request.", ""),
      });
      if (error) throw new Error(error.message);
    }
    await supabase.from("signature_evenements").update({ etat: "traite", erreur: null, traite_le: new Date().toISOString() }).eq("event_id", evenement.event_id);
    return { ok: true };
  } catch (e) {
    const erreur = e instanceof Error ? e.message.slice(0, 300) : "Erreur inconnue";
    await supabase.from("signature_evenements").update({ etat: "echec", erreur, tentatives: evenement.tentatives + 1 }).eq("event_id", evenement.event_id);
    return { ok: false, erreur };
  }
}
