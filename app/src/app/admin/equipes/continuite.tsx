'use client';
import {useActionState} from 'react';
import {enregistrerContinuite,type RetourMission} from '@/app/actions/equipes';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
import {Input} from '@/components/ui/input';
export function PlanContinuite({jours,email,consignes}:{jours:number;email:string;consignes:string}){
 const [etat,action]=useActionState<RetourMission,FormData>(enregistrerContinuite,{});
 return <form action={action} className="mt-4 space-y-3"><label className="block text-sm">Autre superviseur déjà habilité<Input type="email" name="email" defaultValue={email}/></label><label className="block text-sm">Absence à signaler après combien de jours ?<Input name="jours" type="number" min={1} max={90} required defaultValue={jours}/></label><label className="block text-sm">Consignes en cas d’absence<textarea name="consignes" maxLength={3000} defaultValue={consignes} className="mt-1 min-h-24 w-full rounded-lg border p-3"/></label><p className="text-sm text-muted-foreground">Ce plan n’accorde aucun accès supplémentaire. Les actions déjà autorisées continuent ; les décisions sensibles attendent un responsable habilité.</p><BoutonEnvoi>Enregistrer le plan</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form>;
}
