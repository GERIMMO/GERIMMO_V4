'use client';
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { commanderRelais } from '@/app/actions/consignes-vacances';
import { MessageSupervision } from '../consignes/formulaires';
import { MISSIONS } from '@/lib/missions';
import { nomArret } from '@/lib/nom-arret-supervision';
export type PlanVacances={id:string;titre:string;debut:string;fin:string;responsable:string;consigne_version:string|null;delai_minutes:number;numero:number;etat:string;arrete:boolean;};
export {FormulaireVacances} from "./parcours-vacances";
export function CommandeRelais({commande,id,label}:{commande:string;id?:string;label:string}){
 const [etat,action,pending]=useActionState(commanderRelais,{});return <form data-saisie-confirmee action={action}><input type="hidden" name="commande" value={commande}/><input type="hidden" name="id" value={id??''}/><button disabled={pending} className="btn btn-secondaire">{label}</button><MessageSupervision etat={etat}/></form>;
}
// D46 (IA-06) : « Sauvegarde » n'est plus proposé, la sauvegarde ne lit aucun arrêt. Une ligne déjà enregistrée
// reste levable : l'option ne réapparaît que tant qu'un arrêt « sauvegarde » est en cours.
export function FormulaireArret({plan,arrete,sauvegardeArretee}:{plan?:string;arrete?:boolean;sauvegardeArretee?:boolean}){
 const [etat,action,pending]=useActionState(commanderRelais,{});return <form data-saisie-confirmee action={action} className="space-y-3"><input type="hidden" name="plan" value={plan??''}/>{plan?<><input type="hidden" name="portee" value="plan"/><input type="hidden" name="commande" value={arrete?'reprendre':'arreter'}/></>:<div className="grid gap-3 sm:grid-cols-2"><label>Périmètre<select className="champ w-full" name="portee"><option value="global">Tous les traitements contrôlés</option><option value="consignes">Lectures des consignes seulement</option>{Object.keys(MISSIONS).map(k=><option key={k} value={k}>{nomArret(k)}</option>)}<option value="orchestrateur">Suivi des dossiers</option>{sauvegardeArretee&&<option value="sauvegarde">Sauvegarde (sans effet, à lever)</option>}</select></label><label>Décision<select className="champ w-full" name="commande"><option value="arreter">Arrêter avant le prochain effet</option><option value="reprendre">Reprendre explicitement</option></select></label></div>}<label className="block">Motif<input className="champ mt-1 w-full" name="motif" required minLength={5} maxLength={1000}/></label><button className="btn btn-secondaire" disabled={pending}>{plan?arrete?'Reprendre ce plan':'Arrêter ce plan':'Enregistrer la décision'}</button><MessageSupervision etat={etat}/></form>;
}
export function UrgenceInterne({plan}:{plan:string}){
 const [etat,action,pending]=useActionState(commanderRelais,{});return <form data-saisie-confirmee action={action} className="space-y-3"><input type="hidden" name="commande" value="urgence"/><input type="hidden" name="plan" value={plan}/><label className="block">Référence stable de l’événement<input className="champ mt-1 w-full" name="cle" required maxLength={160}/></label><label className="block">Urgence à examiner<input className="champ mt-1 w-full" name="titre" required minLength={3} maxLength={240}/></label><p className="text-sm text-muted-foreground">La même référence conserve une seule alerte, et un seul e-mail. Si le relais est configuré, un e-mail immédiat part vers ses adresses, sans le texte saisi (il dit seulement « urgence signalée à la main dans la console ») ; tant qu’elle n’est pas accusée, l’alerte est aussi comptée dans l’alerte e-mail quotidienne de 5 h. Elle peut être acquittée par un superviseur habilité.</p><button className="btn btn-secondaire" disabled={pending}>Signaler dans le relais</button><MessageSupervision etat={etat}/></form>;
}
