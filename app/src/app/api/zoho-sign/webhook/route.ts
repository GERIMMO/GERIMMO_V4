import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { clientDeService } from "@/lib/supabase/service";
import { webhookZohoValide } from "@/lib/zoho-sign";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EVENEMENTS = new Set(["RequestSubmitted", "RequestViewed", "RequestSigningSuccess", "RequestCompleted", "RequestRejected", "RequestRecalled", "RequestForwarded", "RequestExpired"]);
export async function POST(request: Request) {
  const secret = process.env.ZOHO_SIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ erreur: "Réception non configurée." }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 1_048_576) return Response.json({ erreur: "Corps trop volumineux." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ erreur: "Corps absent." }, { status: 400 });
  const morceaux: Uint8Array[] = []; let taille = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    taille += value.byteLength;
    if (taille > 1_048_576) { await reader.cancel(); return Response.json({ erreur: "Corps trop volumineux." }, { status: 413 }); }
    morceaux.push(value);
  }
  const brut = Buffer.concat(morceaux).toString("utf8");
  if (!webhookZohoValide(brut, request.headers.get("x-zs-webhook-signature"), secret)) return Response.json({ erreur: "Signature refusée." }, { status: 400 });
  let evenement;
  try { evenement = JSON.parse(brut); } catch { return Response.json({ erreur: "Corps invalide." }, { status: 400 }); }
  if (!evenement || typeof evenement !== "object") return Response.json({ erreur: "Corps invalide." }, { status: 400 });
  if (!EVENEMENTS.has(evenement.notifications?.operation_type)) return Response.json({ ignore: true });
  const id = evenement.requests?.request_id;
  if (typeof id !== "string" || !/^\d{1,30}$/.test(id)) return Response.json({ erreur: "Référence invalide." }, { status: 400 });
  const config = configurationSuiviSignatureBail(process.env, "zoho");
  const db = clientDeService();
  if (!config || !db) return Response.json({ erreur: "Suivi temporairement indisponible." }, { status: 503 });
  const circuit = await db.from("bail_signature_circuits").select("id,etat").eq("prestataire", "zoho").eq("environnement", config.environnement).eq("external_request_id", id).maybeSingle();
  if (circuit.error) return Response.json({ erreur: "Suivi indisponible." }, { status: 503 });
  // Aucun événement ni identité externe n'est enregistré. Les demandes étrangères sont ignorées.
  if (!circuit.data) return Response.json({ ignore: true });
  if (circuit.data.etat === "termine") return Response.json({ recu: true });
  const circuitId = circuit.data.id;
  // Zoho exige un accusé sous cinq secondes. Le circuit existe déjà en base :
  // les téléchargements se poursuivent après réponse, avec reprise par le cron
  // si le prestataire, le stockage ou cette invocation deviennent indisponibles.
  after(async () => {
    try {
      await synchroniserCircuitSignatureBail(db, config, circuitId);
    } catch {
      await db.from("bail_signature_circuits").update({ erreur: "Le suivi Zoho Sign doit être repris." })
        .eq("id", circuitId).in("etat", ["preparation", "en_cours", "a_verifier"]);
    }
  });
  return Response.json({ recu: true });
}
