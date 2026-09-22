"use client";
import {useActionState} from 'react';
import {enregistrerBilanContact,type EtatAutonomie} from '@/app/actions/autonomie';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
export function BilanContactIncident({orgId,incidentId}:{orgId:string;incidentId:string}){
 const [etat,action]=useActionState<EtatAutonomie,FormData>(enregistrerBilanContact.bind(null,orgId,incidentId),{});
 return <details className="loc-carte"><summary className="cursor-pointer font-semibold">Bilan : ce dossier a-t-il nécessité un appel ?</summary><form action={action} className="mt-4 space-y-3"><fieldset><legend className="text-sm">Confirmez le déroulement réel du dossier</legend><label className="mt-2 flex gap-2 text-sm"><input type="radio" name="appel" value="non" required/>Tout a été traité sur le site, sans appel</label><label className="mt-2 flex gap-2 text-sm"><input type="radio" name="appel" value="oui" required/>Au moins un appel a été nécessaire</label></fieldset><label className="block text-sm">Une précision<textarea name="note" required minLength={5} maxLength={1000} className="mt-1 w-full rounded border p-2"/></label><BoutonEnvoi enCoursTexte="Enregistrement…">Enregistrer le bilan</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm">{etat.succes}</p>}</form></details>;
}
