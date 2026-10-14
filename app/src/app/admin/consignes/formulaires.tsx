'use client';
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { enregistrerConsigne, commanderConsigne, type RetourSupervision } from '@/app/actions/consignes-vacances';
import { MISSIONS } from '@/lib/missions';
import { champParis } from '@/lib/dates-supervision';
export type CompteResponsable = { id: string; email: string };
export type VersionConsigne = { id: string; consigne_id: string; numero: number; titre: string; texte: string; mission: string; debut: string; fin: string; responsable: string; budget_total: number; budget_mensuel: number };
export function MessageSupervision({ etat }: { etat: RetourSupervision }) { return <div aria-live="polite">{etat.erreur && <p role="alert" className="err mt-3">{etat.erreur}</p>}{etat.succes && <p className="mt-3 text-sm">{etat.succes}</p>}</div>; }
export function FormulaireConsigne({ comptes, version }: { comptes: CompteResponsable[]; version?: VersionConsigne }) {
 const [etat, action, pending] = useActionState(enregistrerConsigne, {});
 return <form data-saisie-confirmee action={action} onReset={e=>e.preventDefault()} className="space-y-4">
 <input type="hidden" name="id" value={version?.consigne_id ?? ''}/><input type="hidden" name="version" value={version?.numero ?? 0}/>
 <label className="block">Titre<input className="champ mt-1 w-full" name="titre" required minLength={3} maxLength={120} defaultValue={version?.titre}/></label>
 <label className="block">Consigne et contexte<textarea className="champ mt-1 w-full" name="texte" required minLength={3} maxLength={4000} defaultValue={version?.texte}/></label>
 <p className="text-sm text-muted-foreground">Le texte est conservé comme contexte. Seules les lectures cochées ci-dessous seront proposées ; aucune opération de paiement, de droit ou de communication ne peut en être déduite.</p>
 <div className="grid gap-4 sm:grid-cols-2"><label>Mission observée<select className="champ mt-1 w-full" name="mission" defaultValue={version?.mission ?? 'quittances'}>{Object.entries(MISSIONS).map(([id,m])=><option key={id} value={id}>{m.nom}</option>)}</select></label>
 <label>Responsable déjà habilité<select name="responsable" required className="champ mt-1 w-full" defaultValue={version?.responsable ?? ''}><option value="">Choisir un responsable</option>{comptes.map(c=><option key={c.id} value={c.id}>{c.email}</option>)}</select></label>
 <label>Début — heure de Paris<input name="debut" type="datetime-local" required className="champ mt-1 w-full" defaultValue={version?champParis(version.debut):undefined}/></label>
 <label>Fin — heure de Paris<input name="fin" type="datetime-local" required className="champ mt-1 w-full" defaultValue={version?champParis(version.fin):undefined}/></label>
 <label>Plafond total de lectures<input name="budget_total" type="number" min={1} max={100} defaultValue={version?.budget_total ?? 2} required className="champ mt-1 w-full"/></label>
 <label>Plafond mensuel de lectures<input name="budget_mensuel" type="number" min={1} max={100} defaultValue={version?.budget_mensuel ?? 2} required className="champ mt-1 w-full"/></label></div>
 <fieldset className="space-y-2"><legend className="font-semibold">Tâches proposées à l’activation</legend><label className="block"><input type="checkbox" name="types" value="lecture_missions"/> Lire l’état actif ou en pause de la mission</label><label className="block"><input type="checkbox" name="types" value="lecture_passages"/> Compter les passages et ceux à reprendre pendant la période</label></fieldset>
 <p className="text-sm text-muted-foreground">Sans tâche cochée, la consigne reste une note à préciser. Une nouvelle version annule les tâches non exécutées de la précédente et exige une nouvelle activation. Les plafonds portent sur toutes les versions de la consigne.</p>
 <button className="btn-or" disabled={pending}>{pending?'Enregistrement…':version?'Préparer une nouvelle version':'Préparer la consigne'}</button><MessageSupervision etat={etat}/></form>;
}
export function CommandeConsigne({ id, commande, enfants }: { id: string; commande: string; enfants: string }) {
 const [etat,action,pending]=useActionState(commanderConsigne,{});
 return <form data-saisie-confirmee action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="commande" value={commande}/><button className="btn btn-secondaire" disabled={pending}>{pending?'Patientez…':enfants}</button><MessageSupervision etat={etat}/></form>;
}
