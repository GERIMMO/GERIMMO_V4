import { clientDeService } from "@/lib/supabase/service";
import { configurationYoutrust, webhookYoutrustValide } from "@/lib/youtrust";
import { traiterEvenementSignature } from "@/lib/signature-worker";

export const dynamic = "force-dynamic";

const EVENEMENTS = new Set([
  "signature_request.done",
  "signature_request.declined",
  "signature_request.expired",
  "signature_request.canceled",
  "signature_request.rejected",
]);

type Evenement = {
  event_id?: string;
  event_name?: string;
  data?: { signature_request?: { id?: string } };
};

export async function POST(request: Request) {
  const secret = process.env.YOUTRUST_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ erreur: "Réception Youtrust non configurée." }, { status: 503 });
  const brut = await request.text();
  if (!webhookYoutrustValide(brut, request.headers.get("x-yousign-signature-256"), secret)) {
    return Response.json({ erreur: "Signature refusée." }, { status: 400 });
  }
  let evenement: Evenement;
  try { evenement = JSON.parse(brut) as Evenement; }
  catch { return Response.json({ erreur: "Corps invalide." }, { status: 400 }); }
  if (!evenement.event_name || !EVENEMENTS.has(evenement.event_name)) {
    return Response.json({ ignore: evenement.event_name ?? "inconnu" });
  }
  const requestId = evenement.data?.signature_request?.id;
  if (!evenement.event_id || !requestId) {
    return Response.json({ erreur: "Événement incomplet." }, { status: 400 });
  }
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  const { error } = await supabase.from("signature_evenements").insert({
    event_id: evenement.event_id,
    event_name: evenement.event_name,
    request_id: requestId,
    payload: evenement,
  });
  if (error && error.code !== "23505") return Response.json({ erreur: "Mise en file impossible." }, { status: 500 });
  // Classement immédiat. La tâche quotidienne du compte Vercel Hobby reprend
  // automatiquement un éventuel échec de réseau ou de stockage.
  const config = configurationYoutrust();
  if (config?.environnement === "production") {
    await traiterEvenementSignature(supabase, config, {
      event_id: evenement.event_id,
      event_name: evenement.event_name,
      request_id: requestId,
      tentatives: 0,
    });
  }
  return Response.json(error ? { deja_recu: evenement.event_id } : { recu: evenement.event_id }, { status: 202 });
}

export function GET() {
  return Response.json({ message: "Adresse de réception signée de Youtrust." }, { status: 405 });
}
