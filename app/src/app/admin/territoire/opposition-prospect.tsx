'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {enregistrerOppositionProspect} from '@/app/actions/prospects-supervision';

/** « Stop » du prospect : deux gestes (demander, confirmer) ; la fiche est alors supprimée, l'écran revient au suivi commercial. */
export function OppositionProspect({id}:{id:string}){
 const router=useRouter();const [confirmer,setConfirmer]=useState(false);const [enCours,lancer]=useTransition();const [message,setMessage]=useState<{erreur?:string;succes?:string}>({});
 return <div className="space-y-2">
  {!confirmer?<Button type="button" variant="outline" onClick={()=>{setMessage({});setConfirmer(true);}}>Enregistrer son opposition (« Stop »)</Button>
  :<div className="flex flex-wrap items-center gap-2"><p className="text-sm">Sa fiche, son historique et toute fiche de la même adresse seront supprimés aussitôt ; plus aucun message ne pourra lui être préparé.</p>
   <Button type="button" variant="destructive" disabled={enCours} onClick={()=>lancer(async()=>{try{const r=await enregistrerOppositionProspect(id);setMessage(r);if(r.succes){setConfirmer(false);if(r.supprime)router.push('/admin/territoire?opposition=1#prospects');else router.refresh();}}catch{setMessage({erreur:'L’opposition n’a pas pu être confirmée. Vérifiez votre connexion, puis réessayez.'});}})}>{enCours?'Enregistrement…':'Confirmer l’opposition'}</Button>
   <Button type="button" variant="ghost" disabled={enCours} onClick={()=>setConfirmer(false)}>Annuler</Button></div>}
  {message.erreur&&<p role="alert" className="err">{message.erreur}</p>}{message.succes&&<p role="status" className="text-sm">{message.succes}</p>}
 </div>;
}
