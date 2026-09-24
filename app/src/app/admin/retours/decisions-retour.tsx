"use client";
import { useState } from "react";
import { cloreRevue, deciderRetour, regrouperRetours } from "@/app/actions/retours";
import { useActionRetour } from "@/lib/use-action-retour";
import { ETATS_RETOUR, GRAVITES_RETOUR, type RetourUtilisateur } from "@/lib/retours";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
const champ="w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
export function DecisionRetour({retour}:{retour:RetourUtilisateur}){
 const [decision,setDecision]=useState('en_examen');
 const {etat,soumettre,enCours}=useActionRetour(deciderRetour.bind(null,retour.id,retour.version));
 const etats=retour.nature==='idee'?['en_examen','retenue','non_retenue','deja_couverte']:['en_examen','en_cours','resolu'];
 return <form onSubmit={soumettre} className="mt-5 space-y-3 border-t border-[var(--filet)] pt-4">
  <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Décision</span><select name="etat" className={champ} value={decision} onChange={e=>setDecision(e.target.value)}>{etats.map(e=><option key={e} value={e}>{ETATS_RETOUR[e]}</option>)}</select></label>
   <label className="space-y-1 text-sm"><span>Gravité</span><select name="gravite" className={champ} defaultValue={retour.gravite}>{Object.entries(GRAVITES_RETOUR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
  <label className="block space-y-1 text-sm"><span>Réponse visible dans le suivi</span><textarea name="reponse" className={champ} rows={3} required minLength={5} maxLength={6000}/></label>
  {decision==='non_retenue'&&<label className="block space-y-1 text-sm"><span>Date de réexamen</span><input name="reexaminer_le" type="date" required className={champ}/></label>}
  {retour.nature==='contestation'&&<p className="text-xs text-muted-foreground">Cette réponse reste entre l’artisan et la supervision. La décision de support ne retire pas automatiquement une évaluation.</p>}
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  <BoutonEnvoi size="sm" enCours={enCours} enCoursTexte="Enregistrement…">Enregistrer la décision</BoutonEnvoi>
 </form>;
}
export function RegrouperIdees({retour,idees}:{retour:RetourUtilisateur;idees:RetourUtilisateur[]}){
 const {etat,soumettre,enCours}=useActionRetour(regrouperRetours.bind(null,retour.id));
 const autres=idees.filter(i=>i.id!==retour.id&&i.groupe_id!==retour.groupe_id);if(!autres.length)return null;
 return <details className="mt-4 text-sm"><summary className="cursor-pointer">Rapprocher une idée similaire</summary><form onSubmit={soumettre} className="mt-3 space-y-2"><label><span>Idée du même besoin</span><select name="cible" required className={champ} defaultValue=""><option value="" disabled>Choisir une idée</option>{autres.map(i=><option key={i.id} value={i.id}>{i.titre}</option>)}</select></label><p className="text-xs text-muted-foreground">Les soutiens sont rapprochés pour la revue ; les descriptions restent privées entre les organisations.</p><BoutonEnvoi size="sm" variant="outline" enCours={enCours}>Regrouper les idées</BoutonEnvoi>{etat.erreur&&<p role="alert">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form></details>;
}

export function CloreRevue(){
 const {etat,soumettre,enCours}=useActionRetour(cloreRevue);
 return <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Enregistrer le bilan de la revue</summary><form onSubmit={soumettre} className="mt-3 space-y-3"><label className="block">Bilan et prochaines étapes<textarea name="bilan" minLength={15} maxLength={6000} required rows={3} className={champ}/></label><BoutonEnvoi enCours={enCours} size="sm">Terminer la revue du mois</BoutonEnvoi>{etat.erreur&&<p role="alert">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form></details>;
}
