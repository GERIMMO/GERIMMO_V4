'use client';
import {useActionState} from 'react';
import {verifierConnexionMarque} from '@/app/actions/verification-marque';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
export function Verification({id,type}:{id:string;type:'site'|'email'}){const [etat,action]=useActionState(verifierConnexionMarque,{});return <form action={action} className="mt-3 space-y-2"><input type="hidden" name="organisation" value={id}/><input type="hidden" name="type" value={type}/><BoutonEnvoi enCoursTexte="Vérification…">Vérifier {type==='site'?'le site':'l’adresse d’envoi'}</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form>;}
