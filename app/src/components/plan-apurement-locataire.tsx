"use client";
import { useState } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { demanderPlanApurement, type EtatPlanApurement } from "@/app/actions/plan-apurement";
import { eur, formaterDate } from "@/lib/ged";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { Button } from "./ui/button";

export type MonPlanApurement = {
  plan_id: string; etat: "propose" | "actif" | "en_defaut" | "caduc" | "solde" | "annule"; date_arrete: string; dette_initiale: number | string; acompte: number | string;
  mensualite: number | string; nombre_tranches: number; premiere_echeance: string; date_acceptation: string | null; conditions: string | null;
  document_id: string | null; document_signe_id: string | null; dette_restante: number | string | null;
  tranches: { rang: number; echeance: string; montant: number | string; statut: "a_venir" | "honoree" | "manquee" | "annulee"; constatee_le: string | null; en_retard: boolean }[];
  demande_en_cours: boolean;
};

const ETATS: Record<MonPlanApurement["etat"], { libelle: string; tag: string }> = {
  propose: { libelle: "Proposé par votre gestionnaire", tag: "bleu" },
  actif: { libelle: "En cours", tag: "vert" },
  en_defaut: { libelle: "Une tranche est en retard", tag: "rouge" },
  caduc: { libelle: "Terminé sans être respecté", tag: "rouge" },
  solde: { libelle: "Soldé", tag: "vert" },
  annule: { libelle: "Annulé", tag: "ambre" },
};

// « Mon plan » dans l'espace locataire (02/11/2026) : le plan vivant, sa progression, la prochaine tranche ;
// sinon, la demande d'un plan quand des loyers sont en retard.
export function PlanApurementLocataire({ orgId, plan, demandeEnCours, detteEchue }: { orgId: string; plan: MonPlanApurement | null; demandeEnCours: boolean; detteEchue: number }) {
  const vivant = plan && ["propose", "actif", "en_defaut"].includes(plan.etat);
  if (!vivant && detteEchue <= 0 && !demandeEnCours) return null;
  return <div className="loc-carte scroll-mt-20" id="plan-apurement">
    <div className="entete-carte !mb-1">
      <h2 className="titre-carte text-base font-medium">{vivant ? "Mon plan de paiement" : "Difficultés de paiement"}</h2>
      {plan && vivant && <span className={`loc-tag ${ETATS[plan.etat].tag}`}>{ETATS[plan.etat].libelle}</span>}
    </div>
    {plan && vivant ? <Plan plan={plan} /> : <Demande orgId={orgId} demandeEnCours={demandeEnCours} detteEchue={detteEchue} />}
  </div>;
}

function Plan({ plan }: { plan: MonPlanApurement }) {
  const tranches = plan.tranches ?? [];
  const honorees = tranches.filter((t) => t.statut === "honoree").length;
  const prochaine = tranches.find((t) => t.statut === "a_venir" || t.statut === "manquee");
  const total = Number(plan.dette_initiale) - Number(plan.acompte);
  const restant = plan.dette_restante == null ? null : Number(plan.dette_restante);
  const progression = restant == null || total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(((total - Math.min(restant, total)) / total) * 100)));
  return <div className="space-y-3 text-sm">
    <p className="text-muted-foreground">Dette arrêtée au {formaterDate(plan.date_arrete)} : {eur(plan.dette_initiale)}{Number(plan.acompte) > 0 && ` dont ${eur(plan.acompte)} d’acompte`} · {plan.nombre_tranches} tranche{plan.nombre_tranches > 1 ? "s" : ""} de {eur(plan.mensualite)}, à régler en plus de votre loyer courant.</p>
    {plan.etat === "propose" && <p>Votre gestionnaire vous a proposé ce plan. Lisez le protocole, signez-le ou donnez votre accord par message : le plan démarre à son activation.</p>}
    {restant != null && <div>
      <div className="flex items-baseline justify-between"><span>Reste à régler</span><strong>{eur(restant)}</strong></div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progression} aria-valuemin={0} aria-valuemax={100} aria-label="Progression du plan"><div className="h-full rounded-full bg-success" style={{ width: `${progression}%` }} /></div>
      <p className="mt-1 text-xs text-muted-foreground">{honorees}/{tranches.length} tranches honorées</p>
    </div>}
    {prochaine && <p className={prochaine.statut === "manquee" ? "text-destructive" : ""}>{prochaine.statut === "manquee" ? "Tranche en retard" : "Prochaine tranche"} : <strong>{eur(prochaine.montant)}</strong> le {formaterDate(prochaine.echeance)}.{prochaine.statut === "manquee" && " Réglez-la au plus vite : à plusieurs tranches manquées, le plan prend fin et les relances reprennent."}</p>}
    <details><summary className="cursor-pointer text-xs text-muted-foreground">Voir toutes les tranches</summary>
      <ul className="mt-2 divide-y divide-border text-xs">{tranches.map((t) => <li key={t.rang} className="flex justify-between py-1"><span>{t.rang}. {formaterDate(t.echeance)}</span><span>{eur(t.montant)} · {({ a_venir: "à venir", honoree: "honorée", manquee: "en retard", annulee: "annulée" })[t.statut]}</span></li>)}</ul>
    </details>
    {plan.conditions && <p className="text-xs text-muted-foreground">Conditions convenues : {plan.conditions}</p>}
    <p className="text-xs text-muted-foreground">Le protocole figure dans Mes documents dès que votre gestionnaire l’a partagé.</p>
  </div>;
}

function Demande({ orgId, demandeEnCours, detteEchue }: { orgId: string; demandeEnCours: boolean; detteEchue: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, submit, pending] = useActionStateProtegee(demanderPlanApurement.bind(null, orgId), {} as EtatPlanApurement);
  if (demandeEnCours || etat.succes) return <p className="text-sm text-muted-foreground" role="status">{etat.succes ?? "Votre demande de plan de paiement est transmise à votre gestionnaire. Sa réponse arrivera dans votre messagerie."}</p>;
  return <div className="space-y-2 text-sm">
    <p>Des loyers restent dus ({eur(detteEchue)}). Si vous traversez une période difficile, vous pouvez proposer de régler cette somme en plusieurs fois, en plus de votre loyer courant.</p>
    {!ouvert ? <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(true)}>Demander un plan de paiement</Button>
      : <form data-saisie-confirmee action={submit} className="space-y-2">
        <label className="block text-xs text-muted-foreground" htmlFor="pa-message">Expliquez votre situation et ce que vous pouvez régler chaque mois (facultatif)</label>
        <textarea id="pa-message" name="message" rows={3} maxLength={2000} defaultValue={etat.valeurs?.message} className="w-full rounded-md border border-input bg-background p-2 text-sm" />
        {etat.erreur && <p role="alert" className="text-destructive">{etat.erreur}</p>}
        <div className="flex gap-2"><BoutonEnvoi size="sm" enCours={pending} enCoursTexte="Envoi…">Envoyer la demande</BoutonEnvoi><Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button></div>
      </form>}
  </div>;
}
