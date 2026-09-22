"use client";
import { useActionState } from "react";
import { actualiserDossiers, creerDelegation, revoquerDelegation, deciderAmelioration, type EtatAutonomie } from "@/app/actions/autonomie";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
function Retour({etat}:{etat:EtatAutonomie}) { return <>{etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}</>; }
export function FormulaireDelegation() {
  const [etat, action] = useActionState<EtatAutonomie, FormData>(creerDelegation, {});
  return <form action={action} className="space-y-3">
    <label className="block text-sm">Adresse du remplaçant<Input name="email" type="email" required autoComplete="email" className="mt-1" /></label>
    <label className="block text-sm">Durée en jours<Input name="jours" type="number" min={1} max={90} defaultValue={7} required className="mt-1" /></label>
    <label className="block text-sm">Motif<Input name="motif" required minLength={5} maxLength={500} className="mt-1" /></label>
    <p className="text-xs text-muted-foreground">Le relais peut consulter les priorités de Gerimmo. Les accès aux données des clients et les décisions financières restent soumis à leurs droits habituels.</p>
    <Retour etat={etat} /><BoutonEnvoi enCoursTexte="Enregistrement…">Ouvrir le relais de suivi</BoutonEnvoi>
  </form>;
}
export function BoutonAutonomie({action,children}:{action:()=>Promise<EtatAutonomie>;children:React.ReactNode}) {
  const [etat,envoyer] = useActionState<EtatAutonomie,FormData>(action,{});
  return <form action={envoyer} className="space-y-2"><BoutonEnvoi variant="outline" enCoursTexte="En cours…">{children}</BoutonEnvoi><Retour etat={etat} /></form>;
}
export function ActualiserDossiers() {return <BoutonAutonomie action={actualiserDossiers}>Actualiser les prochaines étapes</BoutonAutonomie>;}
export function RevoquerDelegation({id}:{id:string}) {return <BoutonAutonomie action={revoquerDelegation.bind(null,id)}>Retirer l’accès</BoutonAutonomie>;}
export function DecisionAmelioration({id,revision}:{id:string;revision:string}) {return <div className="flex flex-wrap gap-2"><BoutonAutonomie action={deciderAmelioration.bind(null,id,revision,true)}>Autoriser cette version</BoutonAutonomie><BoutonAutonomie action={deciderAmelioration.bind(null,id,revision,false)}>Refuser</BoutonAutonomie></div>;}
