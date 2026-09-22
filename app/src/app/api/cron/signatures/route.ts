import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import {
  configurationYoutrust,
  telechargerDocumentSigneYoutrust,
  telechargerPreuveYoutrust,
} from "@/lib/youtrust";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Evenement = { event_id: string; event_name: string; request_id: string; tentatives: number };
type Demande = {
  organization_id: string;
  signee_le: string | null;
  external_document_id: string | null;
  external_signer_id: string | null;
};

function memeSecret(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni); const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ erreur: "CRON_SECRET absente." }, { status: 503 });
  if (!memeSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const config = configurationYoutrust();
  if (!config || config.environnement !== "production") {
    return Response.json({ erreur: "Youtrust production non configuré." }, { status: 503 });
  }
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  const { data, error } = await supabase.from("signature_evenements")
    .select("event_id,event_name,request_id,tentatives")
    .in("etat", ["a_traiter", "echec"]).lt("tentatives", 20)
    .order("recu_le").limit(10);
  if (error) return Response.json({ erreur: "File de signatures indisponible." }, { status: 500 });

  let traites = 0; const echecs: string[] = [];
  for (const evenement of (data ?? []) as Evenement[]) {
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
        const cheminSigne = `${racine}-signe.pdf`; const cheminPreuve = `${racine}-preuve.pdf`;
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
        const statut = evenement.event_name.replace("signature_request.", "");
        const { error: erreurClassement } = await supabase.rpc("classer_echec_signature_youtrust", {
          p_request: evenement.request_id, p_statut: statut,
        });
        if (erreurClassement) throw new Error(erreurClassement.message);
      }
      await supabase.from("signature_evenements").update({ etat: "traite", erreur: null, traite_le: new Date().toISOString() }).eq("event_id", evenement.event_id);
      traites++;
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 300) : "Erreur inconnue";
      echecs.push(message);
      await supabase.from("signature_evenements").update({ etat: "echec", erreur: message, tentatives: evenement.tentatives + 1 }).eq("event_id", evenement.event_id);
    }
  }
  await consignerTache(supabase, "signatures", { traites, echecs: echecs.length });
  return Response.json({ traites, echecs: echecs.length });
}

