import { ArretSupervision, verifierAvantEffet } from "@/lib/controle-effets";
import { timingSafeEqual } from "node:crypto";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import { configurationYoutrust } from "@/lib/youtrust";
import { traiterEvenementSignature, type EvenementSignature } from "@/lib/signature-worker";
import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";


function memeSecret(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni); const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function traiterSignatures(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ erreur: "CRON_SECRET absente." }, { status: 503 });
  if (!memeSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  const configsBail = [configurationSuiviSignatureBail(process.env,"zoho"), configurationSuiviSignatureBail(process.env,"youtrust")].filter(c => c !== null);
  const config = configurationYoutrust();
  const traiterYoutrust = Boolean(config && (config.environnement === "production" || configsBail.some(c => c.prestataire === "youtrust")));
  if (!traiterYoutrust && !configsBail.length) {
    // Consigné AVANT de s'arrêter (25/09) : le 503 sans journal laissait la
    // tâche « aucune exécution » à vie dans Santé et « À vérifier » chaque
    // nuit dans Équipes, alors que la sandbox est un choix, dit par la ligne
    // de configuration. La passe est un 200 sans rien traiter.
    await consignerTache(supabase, "signatures", {
      ignores: 0,
      non_configuree: true,
      motif: config ? "youtrust_sandbox" : "youtrust_absent",
    });
    return Response.json({ ignores: 0, non_configuree: true, motif: "Service de signature non activé." });
  }
  const { data, error } = traiterYoutrust ? await supabase.from("signature_evenements")
    .select("event_id,event_name,request_id,tentatives")
    .in("etat", ["a_traiter", "echec"]).lt("tentatives", 20)
    .order("recu_le").limit(10) : {data:[],error:null};
  if (error) return Response.json({ erreur: "File de signatures indisponible." }, { status: 500 });

  let traites = 0; const echecs: string[] = [];
  for (const evenement of (data ?? []) as EvenementSignature[]) {
    const resultat = await traiterEvenementSignature(supabase, config!, evenement, () => verifierAvantEffet(supabase, "signatures"));
    if (resultat.ok) traites++;
    else echecs.push(resultat.erreur ?? "Erreur inconnue");
  }
  // Rapproche aussi les circuits si un webhook a été perdu. La plus ancienne
  // vérification est prioritaire ; un échec ne monopolise pas toute la file.
  for (const configBail of configsBail) {
    const circuits = await supabase.from("bail_signature_circuits").select("id").eq("environnement",configBail.environnement).eq("prestataire",configBail.prestataire)
      .in("etat",["preparation","en_cours","a_verifier"]).not("external_request_id","is",null).order("updated_at").limit(10);
    if (circuits.error) echecs.push("Circuits indisponibles");
    for (const circuit of circuits.data ?? []) {
      await verifierAvantEffet(supabase,"signatures");
      try { await synchroniserCircuitSignatureBail(supabase,configBail,circuit.id); traites++; }
      catch(e) { if(e instanceof ArretSupervision)throw e; echecs.push("Circuit à reprendre"); await supabase.from("bail_signature_circuits").update({updated_at:new Date().toISOString(),erreur:"Le rapprochement automatique doit être repris."}).eq("id",circuit.id).in("etat",["preparation","en_cours","a_verifier"]); }
    }
  }
  await consignerTache(supabase, "signatures", { traites, echecs: echecs.length });
  return Response.json({ traites, echecs: echecs.length });
}
