"use client";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {useActionFormulaire} from "@/lib/use-action-formulaire";
import {commencerBail} from "@/app/actions/etapes-bail";
import type {EtatBail} from "@/app/actions/baux";
import {BoutonEnvoi} from "@/components/ui/bouton-envoi";
import { useBaseEspace } from "@/components/racine-espace-contexte";
export function FormulaireBailLot({orgId,bienId,lotId}:{parcours?:boolean;orgId:string;bienId:string;lotId:string;personnes:{id:string;nom:string;prenom:string|null}[];chambres?:{id:string;nom:string}[]}){
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
 const router=useRouter();
 const {etat,soumettre,enCours}=useActionFormulaire<EtatBail>(async()=>{
  const res=await commencerBail(orgId,lotId,bienId);
  if(res.bailCree)router.push(`${base}/baux/${res.bailCree}#etape-bail-1`);
  return res;
 });
 return <form data-saisie-libre onSubmit={soumettre} className="space-y-3"><p className="text-sm text-muted-foreground">Préparez votre contrat en 7 étapes : bail, personnes, logement, loyer, documents, clauses et récapitulatif. Les informations de votre logement seront reprises automatiquement.</p>{etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.bailCree&&<p role="status">Brouillon créé. <Link className="underline" href={`${base}/baux/${etat.bailCree}#etape-bail-1`}>Ouvrir le bail</Link></p>}<BoutonEnvoi enCours={enCours} disabled={Boolean(etat.bailCree)} enCoursTexte="Ouverture du parcours…">Commencer le bail</BoutonEnvoi></form>;
}
