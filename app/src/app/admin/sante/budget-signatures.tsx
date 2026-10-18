"use client";
import {reglerBudgetSignatures} from "@/app/actions/budget-signatures";
import {BoutonEnvoi} from "@/components/ui/bouton-envoi";
import {useActionFormulaire} from "@/lib/use-action-formulaire";
export type BudgetSignature={mois:string;plafond:number;utilise:number;envois:number;revision:number;seuil:number;a_verifier:number;en_cours:number;essais:number};
export function BudgetSignatures({budget,actif}:{budget:BudgetSignature|null;actif:boolean}){
 const {etat,soumettre,enCours}=useActionFormulaire(reglerBudgetSignatures);
 if(!budget)return <section id="budget-signatures" className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Signatures · budget et suivi</h2><p className="mt-2 text-sm text-muted-foreground">Le budget n’est pas disponible pour ce compte ou cet environnement.</p></section>;
 const alerte=budget.plafond===0||budget.utilise*100>=budget.plafond*budget.seuil;
 return <section id="budget-signatures" className="space-y-4 rounded-2xl border border-border bg-card p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Signatures · budget et suivi</h2><span className="rounded-full bg-muted px-3 py-1 text-xs">{actif?"Envois clients activés":"Envois clients désactivés"}</span></div>
  <p className="text-sm text-muted-foreground">Mois de {new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(`${budget.mois}T12:00:00Z`))}. Estimation réservée à chaque envoi : 5 crédits par document, plus un premier SMS de 0,5 crédit par signataire.</p>
  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Crédits réservés",budget.utilise/2],["Plafond mensuel",budget.plafond/2],["Envois réservés",budget.envois],["À vérifier",budget.a_verifier]].map(([titre,n])=><div key={titre} className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{titre}</dt><dd className="mt-1 text-xl font-semibold">{Number(n).toLocaleString("fr-FR")}</dd></div>)}</dl>
  {alerte&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm">{budget.plafond===0?"Choisissez un plafond avant d’ouvrir la signature aux clients. Un plafond de zéro bloque les nouveaux envois payants.":"Le seuil d’alerte est atteint. Vérifiez vos crédits Zoho avant d’augmenter la limite."}</p>}
  <form data-saisie-confirmee onSubmit={soumettre} className="flex flex-wrap items-end gap-3"><input type="hidden" name="revision" value={budget.revision}/><label className="text-sm font-medium space-y-1"><span className="block">Plafond mensuel en crédits</span><input key={budget.revision} type="text" inputMode="decimal" name="credits" required defaultValue={budget.plafond/2} className="rounded-lg border border-input bg-background p-2 w-44"/></label><BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…">Enregistrer le plafond</BoutonEnvoi></form>
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm text-success">{etat.succes}</p>}
  <p className="text-xs text-muted-foreground">{budget.en_cours} circuit(s) en cours · {budget.essais} essai(s) ce mois, hors plafond. Une annulation ne restitue pas automatiquement la réservation. Les renvois de SMS et les essais peuvent consommer des crédits supplémentaires chez Zoho : cette estimation ne remplace ni leur solde ni leur facture. Baisser le plafond n’interrompt pas les signatures déjà envoyées.</p>
 </section>;
}
