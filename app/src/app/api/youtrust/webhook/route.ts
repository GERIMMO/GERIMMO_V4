import { clientDeService } from "@/lib/supabase/service";
import { configurationYoutrust, webhookYoutrustValide } from "@/lib/youtrust";
import { traiterEvenementSignature } from "@/lib/signature-worker";
import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { verifierAvantEffet } from "@/lib/controle-effets";

export const dynamic = "force-dynamic";

const EVENEMENTS = new Set([
  "signature_request.done",
  "signature_request.declined",
  "signature_request.expired",
  "signature_request.canceled",
  "signature_request.rejected",
  "signer.done",
  "signer.notified",
  "signer.declined",
  "signer.notification_delivery_failed",
]);

type Evenement = {
  event_id?: string;
  event_name?: string;
  data?: { signature_request?: { id?: string } };
};

export async function POST(request: Request) {
  const secret = process.env.YOUTRUST_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ erreur: "Réception Youtrust non configurée." }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 1_048_576) return Response.json({erreur:"Corps trop volumineux."},{status:413});
  const reader = request.body?.getReader();
  if (!reader) return Response.json({erreur:"Corps absent."},{status:400});
  const morceaux: Uint8Array[] = []; let taille=0;
  for (;;) {
    const {done,value} = await reader.read(); if (done) break;
    taille+=value.byteLength;
    if (taille>1_048_576) {await reader.cancel();return Response.json({erreur:"Corps trop volumineux."},{status:413});}
    morceaux.push(value);
  }
  const brut = Buffer.concat(morceaux).toString("utf8");
  if (!webhookYoutrustValide(brut, request.headers.get("x-yousign-signature-256"), secret)) {
    return Response.json({ erreur: "Signature refusée." }, { status: 400 });
  }
  let evenement: Evenement;
  try { evenement = JSON.parse(brut) as Evenement; }
  catch { return Response.json({ erreur: "Corps invalide." }, { status: 400 }); }
  if (!evenement || typeof evenement !== "object") return Response.json({erreur:"Corps invalide."},{status:400});
  if (!evenement.event_name || !EVENEMENTS.has(evenement.event_name)) {
    return Response.json({ ignore: evenement.event_name ?? "inconnu" });
  }
  const requestId = evenement.data?.signature_request?.id;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!evenement.event_id || !requestId || !uuid.test(evenement.event_id) || !uuid.test(requestId)) {
    return Response.json({ erreur: "Événement incomplet." }, { status: 400 });
  }
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  const { error } = await supabase.from("signature_evenements").insert({
    event_id: evenement.event_id,
    event_name: evenement.event_name,
    request_id: requestId,
    // Le registre ne conserve pas de coordonnées ou de contenu contractuel.
    payload: {event_id:evenement.event_id,event_name:evenement.event_name,request_id:requestId},
  });
  if (error && error.code !== "23505") return Response.json({ erreur: "Mise en file impossible." }, { status: 500 });
  // Classement immédiat. La tâche quotidienne du compte Vercel Hobby reprend
  // automatiquement un éventuel échec de réseau ou de stockage.
  const bailConfig = configurationSuiviSignatureBail(process.env,"youtrust");
  const config = bailConfig?.prestataire === "youtrust" ? bailConfig : configurationYoutrust();
  if (config && (config.environnement === "production" || bailConfig)) {
    try {
    await traiterEvenementSignature(supabase, config, {
      event_id: evenement.event_id,
      event_name: evenement.event_name,
      request_id: requestId,
      tentatives: 0,
    },()=>verifierAvantEffet(supabase,"signatures"));
    } catch {
      // La file reste à reprendre après la levée de l'arrêt de supervision.
    }
  }
  return Response.json(error ? { deja_recu: evenement.event_id } : { recu: evenement.event_id }, { status: 202 });
}

export function GET() {
  return Response.json({ message: "Adresse de réception signée de Youtrust." }, { status: 405 });
}
