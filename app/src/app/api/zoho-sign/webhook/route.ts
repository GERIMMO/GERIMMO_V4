import { corpsAnnonceTropGrand, LIMITE_CORPS_WEBHOOK, lireCorpsBorne } from "@/lib/corps-borne";
import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { clientDeService } from "@/lib/supabase/service";
import { webhookZohoValide } from "@/lib/zoho-sign";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EVENEMENTS = new Set(["RequestSubmitted", "RequestViewed", "RequestSigningSuccess", "RequestCompleted", "RequestRejected", "RequestRecalled", "RequestForwarded", "RequestExpired"]);
type MotifRefus = "signature_absente" | "signature_invalide" | "corps_invalide" | "reference_invalide";
function refuser(motif: MotifRefus, erreur: string) {
  // Codes fixes uniquement : ni clé, ni signature, ni contenu ou identité du document.
  console.warn("[zoho-webhook]", motif);
  return Response.json({ erreur }, { status: 400 });
}
export async function POST(request: Request) {
  const secret = process.env.ZOHO_SIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ erreur: "Réception non configurée." }, { status: 503 });
  if (corpsAnnonceTropGrand(request, LIMITE_CORPS_WEBHOOK)) return Response.json({ erreur: "Corps trop volumineux." }, { status: 413 });
  let brut: string;
  try { brut = (await lireCorpsBorne(request.body, LIMITE_CORPS_WEBHOOK)).toString("utf8"); }
  catch (e) {
    if ((e as Error).message === "corps_trop_grand") return Response.json({ erreur: "Corps trop volumineux." }, { status: 413 });
    // Corps absent, ou flux coupé en cours de lecture : l'expéditeur réessaie (tout code autre que 2xx).
    return Response.json({ erreur: "Corps absent ou illisible." }, { status: 400 });
  }
  const signature = request.headers.get("x-zs-webhook-signature");
  if (!webhookZohoValide(brut, signature, secret)) return refuser(signature ? "signature_invalide" : "signature_absente", "Signature refusée.");
  let evenement;
  try { evenement = JSON.parse(brut); } catch { return refuser("corps_invalide", "Corps invalide."); }
  if (!evenement || typeof evenement !== "object") return refuser("corps_invalide", "Corps invalide.");
  if (!EVENEMENTS.has(evenement.notifications?.operation_type)) return Response.json({ ignore: true });
  const id = evenement.requests?.request_id;
  if (typeof id !== "string" || !/^\d{1,30}$/.test(id)) return refuser("reference_invalide", "Référence invalide.");
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
