'use client';
import {useActionState} from 'react';
import {demanderCorrection,type RetourMission} from '@/app/actions/equipes';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
export function PreparationCorrection({id,demande}:{id:string;demande:string}){
 const [etat,action]=useActionState<RetourMission,FormData>(demanderCorrection,{});
 return <details><summary className="cursor-pointer font-medium text-sm">Autoriser la préparation d’une correction</summary><form action={action} className="mt-3 space-y-3"><input type="hidden" name="proposition" value={id}/><label className="block text-sm">Demande à préparer, sans donnée personnelle<textarea name="demande" required minLength={10} maxLength={12000} defaultValue={demande} className="mt-1 min-h-24 w-full rounded-lg border p-3"/></label><p className="text-xs text-muted-foreground">L’atelier peut préparer des corrections d’interface. Une évolution des règles métier, des droits ou des finances demande un développement encadré séparément. Aucun changement n’est publié par ce bouton.</p><BoutonEnvoi>Autoriser cette préparation</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form></details>;
}
