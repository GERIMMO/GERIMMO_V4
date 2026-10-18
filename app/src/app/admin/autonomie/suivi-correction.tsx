import {lireRapportCorrection} from '@/lib/suivi-corrections';
import {PreparationCorrection} from './preparation-correction';
import {ActualiserCorrection} from './formulaire-delegation';
export function SuiviCorrection({id,rapport,statut,autoriseeLe,publieeLe,preuvePublication,revision,demande}:{id:string;rapport:unknown;statut:string;autoriseeLe:string|null;publieeLe?:string|null;preuvePublication?:{deploiement?:string;fusion?:string;controle_le?:string};revision?:string|null;demande:string}){
 const r=lireRapportCorrection(rapport);
 const phases=['Besoin','Préparation','Contrôles','Votre accord','Publication'];
 const pos=({detectee:0,a_etudier:0,en_developpement:1,en_test:2,autorisation:3,preproduction:3,publiee:4} as Record<string,number>)[statut]??-1;
 return <div className="mt-3 space-y-3 border-t pt-3">
  <ol className="flex flex-wrap gap-2 text-xs" aria-label="Progression de l’amélioration">{phases.map((p,i)=><li key={p} aria-current={i===pos?"step":undefined} className={`rounded-lg px-2 py-1 ${i<=pos?"bg-[var(--marque-clair)] text-[var(--marque-sombre)]":"bg-muted text-muted-foreground"}`}>{i+1} · {p}{i===pos?" ←":""}</li>)}</ol>
  {revision&&<p className="text-xs break-all">Version examinée : {revision}</p>}
  {statut==="publiee"&&<p className="text-sm">{publieeLe?`Publication constatée le ${new Date(publieeLe).toLocaleString("fr-FR",{timeZone:"Europe/Paris"})}.`:"État publié, mais date de publication non renseignée : preuve à vérifier."}</p>}
  {preuvePublication?.deploiement&&<p className="text-xs break-all">Preuve Vercel : {preuvePublication.deploiement} · version intégrée : {preuvePublication.fusion}. Constat daté, sans garantie que cette version soit encore celle actuellement servie.</p>}
  {r&&<><p className={`rounded-lg p-3 text-sm ${r.resultat==='echec'?'bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]':'bg-[var(--marque-clair)] text-[var(--marque-sombre)]'}`}>{r.message}</p><div className="flex flex-wrap gap-3 text-sm">{r.demonstration&&<a className="btn-secondaire" href={r.demonstration} target="_blank" rel="noopener noreferrer">Essayer la démonstration</a>}<a className="underline" href={`https://github.com/GERIMMO/GERIMMO_V4/pull/${r.proposition}`} target="_blank" rel="noopener noreferrer">Voir les changements proposés</a>{r.tests&&<a className="underline" href={`https://github.com/GERIMMO/GERIMMO_V4/actions/runs/${r.tests}`} target="_blank" rel="noopener noreferrer">Voir le résultat des contrôles</a>}</div></>}
  {autoriseeLe&&statut!=="publiee"&&<p className="text-sm">Accord enregistré le {new Date(autoriseeLe).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'})}. La version n’est pas encore déclarée publiée.</p>}
  {['a_etudier','detectee'].includes(statut)&&<PreparationCorrection id={id} demande={demande}/>}
  {!['annulee','publiee','retour_arriere','detectee','a_etudier'].includes(statut)&&<ActualiserCorrection id={id}/>}
 </div>;
}
