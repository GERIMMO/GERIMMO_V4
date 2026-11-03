"use client";
import { useState } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { activerPlanApurement, annulerPlanApurement, genererProtocolePlan, proposerPlanApurement, type EtatPlanApurement } from "@/app/actions/plan-apurement";
import { eur, formaterDate } from "@/lib/ged";
import { lireDecimal, lireMontantFacultatif } from "@/lib/saisie-montant";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ApercuDocumentEspace } from "./apercu-document-espace";
import { OuvrirSignatureDocument } from "./ouvrir-signature-document";

export type TranchePlan = { id: string; rang: number; echeance: string; montant: number | string; statut: "a_venir" | "honoree" | "manquee" | "annulee"; constatee_le: string | null; en_retard: boolean };
export type PlanApurementLu = {
  plan_id: string; etat: "propose" | "actif" | "en_defaut" | "caduc" | "solde" | "annule"; date_arrete: string; dette_initiale: number | string; acompte: number | string;
  mensualite: number | string; nombre_tranches: number; premiere_echeance: string; tolerance_jours: number; seuil_caducite: number; conditions: string | null;
  document_id: string | null; document_signe_id: string | null; date_acceptation: string | null; clos_le: string | null; motif_cloture: string | null;
  dette_restante: number | string | null; tranches: TranchePlan[];
};

const ETATS: Record<PlanApurementLu["etat"], { libelle: string; classe: string }> = {
  propose: { libelle: "Proposé — en attente de l’accord du locataire", classe: "bg-amber-100 text-amber-900" },
  actif: { libelle: "Actif — relances suspendues", classe: "bg-emerald-100 text-emerald-900" },
  en_defaut: { libelle: "En défaut — une tranche n’a pas été réglée", classe: "bg-red-100 text-red-900" },
  caduc: { libelle: "Caduc — les relances ont repris", classe: "bg-red-100 text-red-900" },
  solde: { libelle: "Soldé", classe: "bg-emerald-100 text-emerald-900" },
  annule: { libelle: "Annulé", classe: "bg-muted text-muted-foreground" },
};
const STATUTS_TRANCHE: Record<TranchePlan["statut"], string> = { a_venir: "à venir", honoree: "honorée", manquee: "manquée", annulee: "annulée" };

export function PlanApurementFormulaires({ orgId, bailId, base, plan, detteEchue, aujourdhui }: { orgId: string; bailId: string; base: string; plan: PlanApurementLu | null; detteEchue: number; aujourdhui: string }) {
  const vivant = plan && ["propose", "actif", "en_defaut"].includes(plan.etat);
  return <div id="plan-apurement" className="scroll-mt-24 space-y-3 border-t border-border pt-4">
    <p className="text-sm font-medium">Plan d’apurement</p>
    {plan && <PlanEnCours orgId={orgId} bailId={bailId} base={base} plan={plan} />}
    {!vivant && (detteEchue > 0
      ? <Proposition orgId={orgId} bailId={bailId} detteEchue={detteEchue} aujourdhui={aujourdhui} />
      : <p className="text-sm text-muted-foreground">{plan ? "Aucune dette échue : un nouveau plan n’a pas lieu d’être." : "Aucune dette échue sur ce bail. Un plan d’apurement se propose quand des loyers restent dus après leur échéance."}</p>)}
  </div>;
}

function Proposition({ orgId, bailId, detteEchue, aujourdhui }: { orgId: string; bailId: string; detteEchue: number; aujourdhui: string }) {
  const [etat, submit, pending] = useActionStateProtegee(proposerPlanApurement.bind(null, orgId, bailId), {} as EtatPlanApurement);
  const [tranches, setTranches] = useState(etat.valeurs?.tranches ?? "3");
  const [acompte, setAcompte] = useState(etat.valeurs?.acompte ?? "");
  const tranchesLues = lireDecimal(tranches);
  const n = "erreur" in tranchesLues || !Number.isInteger(tranchesLues.valeur) ? 0 : tranchesLues.valeur;
  const acompteLu = lireMontantFacultatif(acompte);
  const acompteMontant = "erreur" in acompteLu ? 0 : acompteLu.montant ?? 0;
  const reste = Math.max(0, detteEchue - acompteMontant);
  const apercu = n > 0 ? Math.floor((reste * 100) / n) / 100 : null;
  return <details className="rounded-lg border border-border bg-muted/25 p-3" open={Boolean(etat.erreur)}>
    <summary className="cursor-pointer text-sm">Proposer un plan d’apurement · dette échue {eur(detteEchue)}</summary>
    <form data-saisie-confirmee action={submit} className="mt-3 space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">La dette est arrêtée en base au jour de la proposition, à partir des termes échus. Les loyers courants restent dus en plus des tranches.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="pa-tranches">Nombre de tranches mensuelles</Label><Input id="pa-tranches" name="tranches" type="number" min={1} max={60} required value={tranches} onChange={(e) => setTranches(e.target.value)} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="pa-premiere">Première tranche le</Label><Input id="pa-premiere" name="premiere_echeance" type="date" required min={aujourdhui} defaultValue={etat.valeurs?.premiere_echeance ?? aujourdhui} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="pa-acompte">Acompte à la signature (facultatif)</Label><Input id="pa-acompte" name="acompte" type="text" inputMode="decimal" placeholder="0,00" value={acompte} onChange={(e) => setAcompte(e.target.value)} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="pa-tolerance">Tolérance après l’échéance (jours)</Label><Input id="pa-tolerance" name="tolerance_jours" type="number" min={0} max={30} defaultValue={etat.valeurs?.tolerance_jours ?? "5"} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="pa-seuil">Tranches manquées avant caducité</Label><Input id="pa-seuil" name="seuil_caducite" type="number" min={1} max={6} defaultValue={etat.valeurs?.seuil_caducite ?? "2"} className="h-9" /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="pa-conditions">Conditions particulières (facultatif)</Label><textarea id="pa-conditions" name="conditions" rows={2} maxLength={2000} defaultValue={etat.valeurs?.conditions} className="w-full rounded-md border border-input bg-background p-2 text-sm" /></div>
      </div>
      {apercu !== null && <p className="text-xs text-muted-foreground">Aperçu : {n} tranche{n > 1 ? "s" : ""} d’environ {eur(apercu)} ({eur(reste)} à étaler{acompteMontant > 0 ? ` après l’acompte` : ""}).</p>}
      {etat.erreur && <p role="alert" className="text-destructive">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-success-soft-foreground">{etat.succes}</p>}
      <BoutonEnvoi size="sm" enCours={pending} enCoursTexte="Proposition…">Proposer ce plan</BoutonEnvoi>
    </form>
  </details>;
}

function PlanEnCours({ orgId, bailId, base, plan }: { orgId: string; bailId: string; base: string; plan: PlanApurementLu }) {
  const e = ETATS[plan.etat];
  const tranches = plan.tranches ?? [];
  const honorees = tranches.filter((t) => t.statut === "honoree").length;
  return <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.classe}`}>{e.libelle}</span>
      <span className="text-xs text-muted-foreground">Dette arrêtée au {formaterDate(plan.date_arrete)} : {eur(plan.dette_initiale)}{Number(plan.acompte) > 0 && ` · acompte ${eur(plan.acompte)}`} · {plan.nombre_tranches} tranche{plan.nombre_tranches > 1 ? "s" : ""} de {eur(plan.mensualite)}</span>
    </div>
    {plan.dette_restante != null && <p>Dette échue aujourd’hui : <strong>{eur(plan.dette_restante)}</strong> · {honorees}/{tranches.length} tranches honorées</p>}
    {plan.motif_cloture && <p className="text-xs text-muted-foreground">Clos le {formaterDate(plan.clos_le)} · {plan.motif_cloture}</p>}
    <ul className="divide-y divide-border">
      {tranches.map((t) => <li key={t.id} className="flex items-center gap-2 py-1 text-xs">
        <span className="w-6 shrink-0 text-muted-foreground">{t.rang}</span>
        <span className="w-24 shrink-0">{formaterDate(t.echeance)}</span>
        <span className="w-20 shrink-0 text-right">{eur(t.montant)}</span>
        <span className={t.statut === "manquee" ? "text-destructive" : t.statut === "honoree" ? "text-success-soft-foreground" : "text-muted-foreground"}>{STATUTS_TRANCHE[t.statut]}{t.en_retard && " (en retard)"}{t.constatee_le && t.statut !== "a_venir" && ` · ${formaterDate(t.constatee_le)}`}</span>
      </li>)}
    </ul>
    {plan.conditions && <p className="text-xs text-muted-foreground">Conditions : {plan.conditions}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {plan.document_id && <ApercuDocumentEspace fichier={`${base}/documents/${plan.document_id}/fichier`} titre="Protocole d’apurement" />}
      {plan.document_signe_id && <ApercuDocumentEspace fichier={`${base}/documents/${plan.document_signe_id}/fichier`} titre="Protocole signé" />}
      {["propose", "actif", "en_defaut"].includes(plan.etat) && <Protocole orgId={orgId} bailId={bailId} planId={plan.plan_id} base={base} dejaGenere={Boolean(plan.document_id)} />}
      {["propose", "actif", "en_defaut"].includes(plan.etat) && <OuvrirSignatureDocument orgId={orgId} selection={{ code: "protocole_apurement", cibleId: bailId, options: { plan_id: plan.plan_id } }} />}
    </div>
    {plan.etat === "propose" && <Activation orgId={orgId} bailId={bailId} planId={plan.plan_id} />}
    {["propose", "actif", "en_defaut"].includes(plan.etat) && <Annulation orgId={orgId} bailId={bailId} planId={plan.plan_id} />}
    {plan.etat === "actif" && <p className="text-xs text-muted-foreground">Le plan est respecté tant que la dette échue reste au niveau prévu après chaque tranche (loyers courants compris). Les relances automatiques se taisent ; l’alerte d’impayé reste visible.</p>}
    {plan.etat === "en_defaut" && <p className="text-xs text-destructive">Une tranche est manquée. À {plan.seuil_caducite} tranche{plan.seuil_caducite > 1 ? "s" : ""} manquée{plan.seuil_caducite > 1 ? "s" : ""}, le plan devient caduc et les relances reprennent.</p>}
  </div>;
}

function Protocole({ orgId, bailId, planId, base, dejaGenere }: { orgId: string; bailId: string; planId: string; base: string; dejaGenere: boolean }) {
  const [etat, submit, pending] = useActionStateProtegee(async () => genererProtocolePlan(orgId, bailId, planId, `${base}/baux/${bailId}`), {} as EtatPlanApurement);
  return <form data-saisie-confirmee action={submit} className="contents">
    <BoutonEnvoi size="sm" variant="outline" enCours={pending} enCoursTexte="Génération…">{dejaGenere ? "Régénérer le protocole" : "Générer le protocole"}</BoutonEnvoi>
    {etat.erreur && <p role="alert" className="w-full text-xs text-destructive">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="w-full text-xs text-success-soft-foreground">{etat.succes}</p>}
  </form>;
}

function Activation({ orgId, bailId, planId }: { orgId: string; bailId: string; planId: string }) {
  const [etat, submit, pending] = useActionStateProtegee(activerPlanApurement.bind(null, orgId, bailId, planId), {} as EtatPlanApurement);
  return <form data-saisie-confirmee action={submit} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-2">
    <div className="space-y-1"><Label htmlFor="pa-accept" className="text-xs">Accepté par le locataire le</Label><Input id="pa-accept" name="date_acceptation" type="date" required defaultValue={etat.valeurs?.date_acceptation} className="h-9" /></div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="accepte" required />Le locataire a accepté le plan (protocole signé ou accord écrit).</label>
    <BoutonEnvoi size="sm" enCours={pending} enCoursTexte="Activation…">Activer le plan</BoutonEnvoi>
    {etat.erreur && <p role="alert" className="w-full text-xs text-destructive">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="w-full text-xs text-success-soft-foreground">{etat.succes}</p>}
  </form>;
}

function Annulation({ orgId, bailId, planId }: { orgId: string; bailId: string; planId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, submit, pending] = useActionStateProtegee(annulerPlanApurement.bind(null, orgId, bailId, planId), {} as EtatPlanApurement);
  if (!ouvert) return <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOuvert(true)}>Annuler le plan…</Button>;
  return <form data-saisie-confirmee action={submit} className="flex flex-wrap items-end gap-2">
    <div className="min-w-56 flex-1 space-y-1"><Label htmlFor="pa-motif" className="text-xs">Motif de l’annulation</Label><Input id="pa-motif" name="motif" required minLength={3} maxLength={500} defaultValue={etat.valeurs?.motif} className="h-9" /></div>
    <BoutonEnvoi size="sm" variant="outline" enCours={pending} enCoursTexte="Annulation…">Confirmer l’annulation</BoutonEnvoi>
    <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>Garder le plan</Button>
    {etat.erreur && <p role="alert" className="w-full text-xs text-destructive">{etat.erreur}</p>}
  </form>;
}
