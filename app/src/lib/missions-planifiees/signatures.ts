import { ArretSupervision, verifierAvantEffet } from "@/lib/controle-effets";
import { timingSafeEqual } from "node:crypto";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache } from "@/lib/tache";
import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { alerterSignature, rapprocherSignatureInterrompue, relancerSignature } from "@/lib/signature-suivi";


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
  const config = configurationSuiviSignatureBail(process.env, "zoho");
  if (!config) {
    await consignerTache(supabase, "signatures", { ignores: 0, non_configuree: true, motif: "zoho_absent" });
    return Response.json({ ignores: 0, non_configuree: true, motif: "Service de signature non activé." });
  }
  let traites = 0, rapproches=0, rappels=0; const echecs: string[] = [];
  const echeanceMs=Date.now()+50_000;
  // Rapproche aussi les circuits si un webhook a été perdu. La plus ancienne
  // vérification est prioritaire ; un échec ne monopolise pas toute la file.
  for (const configBail of [{...config,echeanceMs}]) {
    const circuits = await supabase.rpc("circuits_signature_a_suivre", {
      p_environnement: configBail.environnement, p_prestataire: configBail.prestataire,
    });
    if (circuits.error) echecs.push("Circuits indisponibles");
    for (const circuit of circuits.data ?? []) {
      if(Date.now()>echeanceMs-5000)break;
      await verifierAvantEffet(supabase,"signatures");
      try {
        if(["refuse","expire"].includes(circuit.etat)){
          await alerterSignature(supabase,circuit.id);
        } else {
          if(circuit.external_request_id)await synchroniserCircuitSignatureBail(supabase,configBail,circuit.id);
          else if(await rapprocherSignatureInterrompue(supabase,configBail,circuit.id))rapproches++;
          await alerterSignature(supabase,circuit.id);
          if(await relancerSignature(supabase,configBail,circuit.id))rappels++;
        }
        traites++;
      }
      catch(e) {
        if(e instanceof ArretSupervision)throw e;
        echecs.push("Circuit à reprendre");
        // Ne pas écraser un envoi/rapprochement concurrent après libération du verrou.
        let erreur = supabase.from("bail_signature_circuits").update({updated_at:new Date().toISOString(),
          ...(!circuit.external_request_id?{etat:"a_verifier"}:{}),erreur:"Le rapprochement automatique doit être repris."})
          .eq("id",circuit.id).is("verrou_jeton",null).in("etat",["preparation","en_cours","a_verifier"]);
        erreur=circuit.external_request_id?erreur.eq("external_request_id",circuit.external_request_id):erreur.is("external_request_id",null);
        await erreur;
        try{await alerterSignature(supabase,circuit.id);}catch{/* L'échec de la passe reste consigné et sera repris. */}
      }
    }
  }
  await consignerTache(supabase, "signatures", { traites, rapproches, rappels, echecs: echecs.length });
  return Response.json({ traites, rapproches, rappels, echecs: echecs.length });
}
