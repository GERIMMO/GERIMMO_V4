'use client';
import {useActionState} from 'react';
import {commanderMission,type RetourMission} from '@/app/actions/equipes';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
// « Lancer maintenant » depuis la ligne rouge de Santé (audit 25/09, C5) : la
// même commande que « Travail des équipes », par la route cron existante.
export function LancerMission({mission,libelle='Lancer maintenant'}:{mission:string;libelle?:string}){
 const [etat,action]=useActionState<RetourMission,FormData>(commanderMission,{});
 return <form action={action} className="flex flex-wrap items-center gap-2"><input type="hidden" name="mission" value={mission}/><input type="hidden" name="commande" value="lancer"/><BoutonEnvoi size="sm" variant="outline" enCoursTexte="Lancement…">{libelle}</BoutonEnvoi>{etat.erreur&&<p className="err text-xs" role="alert">{etat.erreur}</p>}{etat.succes&&<p className="text-xs" role="status">{etat.succes}</p>}</form>;
}
