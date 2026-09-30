import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eur, formaterDateHeure } from "@/lib/ged";
import { ValidationFacture } from "./validation-facture";
import { EchecLecture } from "../documents/echec-lecture";
export async function FacturesIncident({orgId,incidentId}:{orgId:string;incidentId:string}) {
  const supabase = await createClient();
  const {data: missions,error:em} = await supabase.from("incident_interventions").select("id").eq("organization_id",orgId).eq("incident_id",incidentId);
  if(em) return <EchecLecture quoi={["les factures de cette intervention"]}/>;
  if(!missions?.length) return null;
  const {data: factures,error} = await supabase.from("intervention_factures").select("id,numero,montant_ttc_cents,montant_reference_cents,ecart_justification,document_id,validee_le,decision_motif,imputation_validee").eq("organization_id",orgId).in("intervention_id",missions.map(m=>m.id));
  if(error) return <EchecLecture quoi={["les factures de cette intervention"]}/>;
  return <>{factures?.map(f=><section key={f.id} className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
    <h3 className="font-semibold">Facture {f.numero} — {eur(f.montant_ttc_cents / 100)}</h3>
    <Link className="text-blue-700 underline" href={`/agence/${orgId}/documents/${f.document_id}/fichier`}>Consulter la facture avant de décider</Link>
    {f.montant_reference_cents != null && f.montant_ttc_cents !== f.montant_reference_cents && <p>Écart avec le montant autorisé de {eur(f.montant_reference_cents / 100)} : {f.ecart_justification}</p>}
    {f.validee_le ? <p>Validée le {formaterDateHeure(f.validee_le)}. {f.decision_motif} Le paiement reste à effectuer et à enregistrer dans la comptabilité.</p> : <ValidationFacture orgId={orgId} factureId={f.id}/>}
  </section>)}</>;
}
