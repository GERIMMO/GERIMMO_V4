import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eur, formaterDate, formaterDateHeure } from "@/lib/ged";
import { avantRendezVous } from "@/lib/rendez-vous-anticipe";
import {
  etatReglementFacture,
  imputationAuLocataire,
  LIBELLES_ETAT_REGLEMENT,
  MOYENS_REGLEMENT,
  phraseEtatReglement,
  type MoyenReglement,
} from "@/lib/reglement-facture";
import { ValidationFacture } from "./validation-facture";
import { FormulaireReglement, RetraitReglement } from "./reglement-facture";
import { EchecLecture } from "../documents/echec-lecture";

type MissionFacturee = {
  id: string;
  debut_prevu: string | null;
  terminee_le: string | null;
};

type Reglement = {
  id: string;
  facture_id: string;
  montant_cents: number | string;
  date_reglement: string;
  moyen: string;
  reference: string | null;
  created_at: string;
  retire_le: string | null;
  retrait_motif: string | null;
};

const COULEUR_ETAT: Record<string, string> = {
  deposee: "puce puce-rouge",
  validee: "puce puce-prep",
  partiellement_reglee: "puce puce-encre",
  reglee: "puce puce-loue",
};

export async function FacturesIncident({orgId,incidentId,imputation}:{orgId:string;incidentId:string;imputation?:string|null}) {
  const supabase = await createClient();
  // D20 (ART-21) : le rendez-vous prévu et la date de fin se lisent à côté de la facture, pour que le gérant voie
  // si le travail a été déclaré fait avant le rendez-vous confirmé avec le locataire.
  const {data: missions,error:em} = await supabase.from("incident_interventions").select("id,debut_prevu,terminee_le").eq("organization_id",orgId).eq("incident_id",incidentId);
  if(em) return <EchecLecture quoi={["les factures de cette intervention"]}/>;
  if(!missions?.length) return null;
  const missionDe = new Map((missions as MissionFacturee[]).map(m=>[m.id,m]));
  const {data: factures,error} = await supabase.from("intervention_factures").select("id,intervention_id,numero,montant_ttc_cents,montant_reference_cents,ecart_justification,document_id,validee_le,decision_motif,imputation_validee,reglee_le").eq("organization_id",orgId).in("intervention_id",missions.map(m=>m.id));
  if(error) return <EchecLecture quoi={["les factures de cette intervention"]}/>;
  if(!factures?.length) return null;
  // D23 : les règlements déclarés (lus par la politique de l'organisation ; l'écriture ne passe que par fonction).
  const {data: reglements,error:er} = await supabase.from("intervention_facture_reglements").select("id,facture_id,montant_cents,date_reglement,moyen,reference,created_at,retire_le,retrait_motif").eq("organization_id",orgId).in("facture_id",factures.map(f=>f.id)).order("date_reglement",{ascending:true}).order("created_at",{ascending:true});
  if(er) return <EchecLecture quoi={["les factures de cette intervention et leurs règlements"]}/>;
  const reglementsDe = (factureId:string) => ((reglements ?? []) as Reglement[]).filter(r=>r.facture_id===factureId);
  return <>{factures.map(f=>{
    const mission = missionDe.get(f.intervention_id);
    const termineLe = mission?.terminee_le ?? null;
    const termineAvant = termineLe !== null && avantRendezVous(mission?.debut_prevu, new Date(termineLe));
    const lignes = reglementsDe(f.id);
    const { etat, resteCents } = etatReglementFacture(f, lignes);
    return <section key={f.id} className="rounded-xl border border-[var(--filet)] bg-[var(--carte)] p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Facture {f.numero} — {eur(f.montant_ttc_cents / 100)} TTC</h3>
      <span className={COULEUR_ETAT[etat] ?? "puce puce-grise"}>{LIBELLES_ETAT_REGLEMENT[etat]}</span>
    </div>
    {(mission?.debut_prevu || termineLe) && <p className="text-sm text-muted-foreground">
      {mission?.debut_prevu && <>Rendez-vous prévu le {formaterDateHeure(mission.debut_prevu)}</>}
      {mission?.debut_prevu && termineLe && " · "}
      {termineLe && <>Intervention terminée le {formaterDateHeure(termineLe)}</>}
    </p>}
    {termineAvant && <p role="note" className="rounded-lg border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] px-3.5 py-3 text-sm text-[var(--warning-soft-foreground)]">
      L’artisan a déclaré l’intervention terminée avant le rendez-vous confirmé avec le locataire : contrôlez le travail avant de valider.
    </p>}
    <Link className="text-[var(--marque-sombre)] underline" href={`/agence/${orgId}/documents/${f.document_id}/fichier`}>Consulter la facture avant de décider</Link>
    {f.montant_reference_cents != null && f.montant_ttc_cents !== f.montant_reference_cents && <p>Écart avec le montant autorisé de {eur(f.montant_reference_cents / 100)} : {f.ecart_justification}</p>}
    {f.validee_le ? <>
      <p>Validée le {formaterDateHeure(f.validee_le)}. {f.decision_motif}</p>
      {/* D23 : le règlement se déclare ici, sur la facture validée ; il n'est jamais exécuté par Gerimmo. */}
      <div className="space-y-3" aria-label={`Règlement de la facture ${f.numero}`}>
        <p className="font-medium">{phraseEtatReglement(etat, resteCents, f.reglee_le)}</p>
        {lignes.length > 0 && <ul className="space-y-2 text-sm">
          {lignes.map(r => {
            const moyen = MOYENS_REGLEMENT[r.moyen as MoyenReglement] ?? r.moyen;
            return <li key={r.id} className={`rounded-lg border border-[var(--filet)] px-3 py-2 ${r.retire_le ? "text-muted-foreground" : ""}`}>
              <span className={r.retire_le ? "line-through" : ""}>{formaterDate(r.date_reglement)} · {moyen} · {eur(Number(r.montant_cents) / 100)}{r.reference ? ` · réf. ${r.reference}` : ""}</span>
              {r.retire_le
                ? <p>Retiré le {formaterDate(r.retire_le)} : « {r.retrait_motif} » (contre-écriture passée au journal).</p>
                : <RetraitReglement orgId={orgId} reglementId={r.id}/>}
            </li>;
          })}
        </ul>}
        {resteCents > 0
          ? <FormulaireReglement orgId={orgId} factureId={f.id} resteEuros={(resteCents / 100).toFixed(2).replace(".", ",")} imputationLocataire={imputationAuLocataire(imputation ?? f.imputation_validee)}/>
          : <p className="text-sm text-muted-foreground">La facture est réglée en totalité (déclaration, sans paiement bancaire par Gerimmo). L’artisan voit la date et le moyen de chaque règlement.</p>}
      </div>
    </> : <ValidationFacture orgId={orgId} factureId={f.id}/>}
  </section>;})}</>;
}
