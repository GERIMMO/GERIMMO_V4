import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eur, formaterDateHeure } from "@/lib/ged";
import { avantRendezVous } from "@/lib/rendez-vous-anticipe";
import { ValidationFacture } from "./validation-facture";
import { EchecLecture } from "../documents/echec-lecture";
import { baseEspace } from "@/lib/racine-espace";

type MissionFacturee = {
  id: string;
  debut_prevu: string | null;
  terminee_le: string | null;
};

// `base` : « /espace/<id> » chez le propriétaire direct, « /agence/<id> » chez une agence (décision D27) ; la fiche
// d'incident le transmet.
export async function FacturesIncident({orgId,incidentId,base=baseEspace(orgId,false)}:{orgId:string;incidentId:string;base?:string}) {
  const supabase = await createClient();
  // D20 (ART-21) : le rendez-vous prévu et la date de fin se lisent à côté de la facture, pour que le gérant voie
  // si le travail a été déclaré fait avant le rendez-vous confirmé avec le locataire.
  const {data: missions,error:em} = await supabase.from("incident_interventions").select("id,debut_prevu,terminee_le").eq("organization_id",orgId).eq("incident_id",incidentId);
  if(em) return <EchecLecture quoi={["les factures de cette intervention"]}/>;
  if(!missions?.length) return null;
  const missionDe = new Map((missions as MissionFacturee[]).map(m=>[m.id,m]));
  const {data: factures,error} = await supabase.from("intervention_factures").select("id,intervention_id,numero,montant_ttc_cents,montant_reference_cents,ecart_justification,document_id,validee_le,decision_motif,imputation_validee").eq("organization_id",orgId).in("intervention_id",missions.map(m=>m.id));
  if(error) return <EchecLecture quoi={["les factures de cette intervention"]}/>;
  return <>{factures?.map(f=>{
    const mission = missionDe.get(f.intervention_id);
    const termineLe = mission?.terminee_le ?? null;
    const termineAvant = termineLe !== null && avantRendezVous(mission?.debut_prevu, new Date(termineLe));
    return <section key={f.id} className="rounded-xl border border-[var(--filet)] bg-[var(--carte)] p-4 space-y-3">
    <h3 className="font-semibold">Facture {f.numero} — {eur(f.montant_ttc_cents / 100)}</h3>
    {(mission?.debut_prevu || termineLe) && <p className="text-sm text-muted-foreground">
      {mission?.debut_prevu && <>Rendez-vous prévu le {formaterDateHeure(mission.debut_prevu)}</>}
      {mission?.debut_prevu && termineLe && " · "}
      {termineLe && <>Intervention terminée le {formaterDateHeure(termineLe)}</>}
    </p>}
    {termineAvant && <p role="note" className="rounded-lg border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] px-3.5 py-3 text-sm text-[var(--warning-soft-foreground)]">
      L’artisan a déclaré l’intervention terminée avant le rendez-vous confirmé avec le locataire : contrôlez le travail avant de valider.
    </p>}
    <Link className="text-[var(--marque-sombre)] underline" href={`${base}/documents/${f.document_id}/fichier`}>Consulter la facture avant de décider</Link>
    {f.montant_reference_cents != null && f.montant_ttc_cents !== f.montant_reference_cents && <p>Écart avec le montant autorisé de {eur(f.montant_reference_cents / 100)} : {f.ecart_justification}</p>}
    {f.validee_le ? <p>Validée le {formaterDateHeure(f.validee_le)}. {f.decision_motif} Le paiement reste à effectuer et à enregistrer dans la comptabilité.</p> : <ValidationFacture orgId={orgId} factureId={f.id}/>}
  </section>;})}</>;
}
