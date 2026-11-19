import {paiementsInterdits,MESSAGE_PAIEMENT_PILOTE} from "@/lib/verrou-pilote";
import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { clientDeService } from "@/lib/supabase/service";
import { cleLivraisonWebhookZoho, webhookZohoValide } from "@/lib/zoho-sign";
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
  if(paiementsInterdits())return Response.json({erreur:MESSAGE_PAIEMENT_PILOTE},{status:403});
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
  // UNE LIVRAISON NE SERT QU'UNE FOIS (TEC-4, 19/11/2026). La signature prouve l'origine du corps, pas sa fraîcheur : un
  // corps intercepté (journal, relais) se rejouait à volonté, et chaque répétition relançait la relecture du dossier chez
  // Zoho. Le risque est borné — la relecture ne croit pas le webhook, elle relit l'état chez le prestataire — d'où une
  // garde à sa mesure : la même livraison (demande, opération, empreinte du corps) n'est traitée qu'une fois par heure.
  // Pas de limite par circuit : la consultation puis les signatures d'un même dossier arrivent à quelques secondes
  // d'intervalle, et chacune doit être suivie. Pas de table nouvelle : la limite à clé existante (`demandes_lien_mot_de_passe`
  // via `autoriser_lien_mot_de_passe_cle`, déjà partagée avec les confirmations de mobile des garants) compte sur une heure
  // glissante, ne garde qu'une empreinte de la clé, purge après un jour, sérialise deux livraisons simultanées et n'est
  // ouverte qu'au service. Une répétition reçoit le même accusé qu'une première livraison (Zoho ne la renvoie pas) ; une
  // relecture manquée reste couverte par le passage planifié des signatures.
  const livraison = await db.rpc("autoriser_lien_mot_de_passe_cle", {
    p_cle: cleLivraisonWebhookZoho(id, evenement.notifications.operation_type, brut),
    p_max: 1,
  });
  if (livraison.error) return Response.json({ erreur: "Suivi indisponible." }, { status: 503 });
  if (livraison.data !== true) {
    console.warn("[zoho-webhook]", "livraison_repetee");
    return Response.json({ recu: true });
  }
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
