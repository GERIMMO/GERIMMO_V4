import {lireRapportCorrection} from '@/lib/suivi-corrections';
import {PreparationCorrection} from './preparation-correction';
import {ActualiserCorrection} from './formulaire-delegation';
export function SuiviCorrection({id,rapport,statut,autoriseeLe,demande}:{id:string;rapport:unknown;statut:string;autoriseeLe:string|null;demande:string}){
 const r=lireRapportCorrection(rapport);
 return <div className="mt-3 space-y-3 border-t pt-3">
  {r&&<><p className={`rounded-lg p-3 text-sm ${r.resultat==='echec'?'bg-amber-50 text-amber-950':'bg-blue-50 text-blue-950'}`}>{r.message}</p><div className="flex flex-wrap gap-3 text-sm">{r.demonstration&&<a className="btn-secondaire" href={r.demonstration} target="_blank" rel="noopener noreferrer">Essayer la démonstration</a>}<a className="underline" href={`https://github.com/GERIMMO/GERIMMO_V4/pull/${r.proposition}`} target="_blank" rel="noopener noreferrer">Voir les changements proposés</a>{r.tests&&<a className="underline" href={`https://github.com/GERIMMO/GERIMMO_V4/actions/runs/${r.tests}`} target="_blank" rel="noopener noreferrer">Voir le résultat des contrôles</a>}</div></>}
  {autoriseeLe&&<p className="text-sm">Accord enregistré le {new Date(autoriseeLe).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}. La version n’est pas encore déclarée publiée.</p>}
  {['a_etudier','detectee'].includes(statut)&&<PreparationCorrection id={id} demande={demande}/>}
  {!['annulee','publiee','retour_arriere','detectee','a_etudier'].includes(statut)&&<ActualiserCorrection id={id}/>}
 </div>;
}
