import { timingSafeEqual } from "node:crypto";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import { configurationYoutrust } from "@/lib/youtrust";
import { traiterEvenementSignature, type EvenementSignature } from "@/lib/signature-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  const config = configurationYoutrust();
  if (!config || config.environnement !== "production") {
    // Consigné AVANT de s'arrêter (25/09) : le 503 sans journal laissait la
    // tâche « aucune exécution » à vie dans Santé et « À vérifier » chaque
    // nuit dans Équipes, alors que la sandbox est un choix, dit par la ligne
    // de configuration. La passe est un 200 sans rien traiter.
    await consignerTache(supabase, "signatures", {
      ignores: 0,
      non_configuree: true,
      motif: config ? "youtrust_sandbox" : "youtrust_absent",
    });
    return Response.json({ ignores: 0, non_configuree: true, motif: "Youtrust production non configuré." });
  }
  const { data, error } = await supabase.from("signature_evenements")
    .select("event_id,event_name,request_id,tentatives")
    .in("etat", ["a_traiter", "echec"]).lt("tentatives", 20)
    .order("recu_le").limit(10);
  if (error) return Response.json({ erreur: "File de signatures indisponible." }, { status: 500 });

  let traites = 0; const echecs: string[] = [];
  for (const evenement of (data ?? []) as EvenementSignature[]) {
    const resultat = await traiterEvenementSignature(supabase, config, evenement);
    if (resultat.ok) traites++;
    else echecs.push(resultat.erreur ?? "Erreur inconnue");
  }
  await consignerTache(supabase, "signatures", { traites, echecs: echecs.length });
  return Response.json({ traites, echecs: echecs.length });
}
