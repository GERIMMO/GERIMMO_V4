'use client';
import {useActionState} from 'react';
import {commanderMission,type RetourMission} from '@/app/actions/equipes';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
export function Commandes({mission,active,lancement=true}:{mission:string;active:boolean;lancement?:boolean}){
 const [etat,action]=useActionState<RetourMission,FormData>(commanderMission,{});
 return <form action={action} className="mt-4 space-y-2"><input type="hidden" name="mission" value={mission}/><div className="flex flex-wrap gap-2"><BoutonEnvoi name="commande" value={active?'pause':'reprendre'} variant="outline">{active?'Mettre en pause':'Reprendre'}</BoutonEnvoi>{active&&lancement&&<BoutonEnvoi name="commande" value="lancer">Lancer maintenant</BoutonEnvoi>}</div>{etat.erreur&&<p className="err" role="alert">{etat.erreur}</p>}{etat.succes&&<p className="text-sm" role="status">{etat.succes}</p>}</form>;
}
