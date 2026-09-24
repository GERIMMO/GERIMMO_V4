"use client";
import { useState } from "react";
import Link from "next/link";
import { envoyerRetour, soutenirRetour } from "@/app/actions/retours";
import { useActionRetour } from "@/lib/use-action-retour";
import { ACTIONS_RETOUR, NATURES_RETOUR } from "@/lib/retours";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const champ="w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
// `retour` et `contexte` ne servent qu'aux liens de l'écran de succès : ni
// l'un ni l'autre n'est envoyé avec la demande (24/09).
export function FormulaireRetour({ecran,action,cle,organisations,contestation=false,idee=false,retour='',contexte=''}:{ecran:string;action:string;cle:string;organisations:{id:string;nom:string}[];contestation?:boolean;idee?:boolean;retour?:string;contexte?:string}){
 const [cleEnvoi]=useState(cle);
 const [nature,setNature]=useState(contestation?'contestation':idee?'idee':'bug');
 const {etat,soumettre,enCours}=useActionRetour(envoyerRetour);
 if(etat.id)return <div role="status" className="rounded-xl border border-[var(--filet)] bg-[var(--success-soft)] p-5 space-y-3">
  <p className="font-medium">Votre demande est enregistrée.</p><p>La supervision Gerimmo peut maintenant l’examiner. Son suivi conserve toutes les réponses.</p>
  <p className="flex flex-wrap gap-x-4 gap-y-2"><Link className="underline" href={`/assistance?sel=${etat.id}${contexte?`&${contexte}`:''}#mes-demandes`}>Consulter ma demande</Link>
  <a className="underline" href={`/assistance${contexte?`?${contexte}`:''}#nouvelle`}>Nouvelle demande</a>
  {retour&&<Link className="underline" href={retour}>← Retour à la page précédente</Link>}</p>
 </div>;
 return <form onSubmit={soumettre} className="space-y-4">
  <input type="hidden" name="cle_envoi" value={cleEnvoi}/><input type="hidden" name="ecran" value={ecran}/><input type="hidden" name="action_origine" value={action}/>
  <div className="space-y-2"><Label htmlFor="retour-nature">Votre demande</Label>
   <select id="retour-nature" name="nature" className={champ} value={nature} onChange={e=>setNature(e.target.value)}>
    {Object.entries(NATURES_RETOUR).filter(([k])=>k!=='contestation'||contestation).map(([k,v])=><option key={k} value={k}>{v}</option>)}
   </select></div>
  {nature!=='contestation'&&<div className="space-y-2"><Label htmlFor="retour-org">Espace concerné</Label>
   <select id="retour-org" name="organization_id" className={champ} defaultValue={organisations.length===1?organisations[0].id:''}>
    <option value="">Mon compte / hors organisation</option>{organisations.map(o=><option key={o.id} value={o.id}>{o.nom}</option>)}
   </select></div>}
  <div className="space-y-2"><Label htmlFor="retour-titre">{nature==='idee'?'Le besoin en une phrase':'Titre'}</Label><Input id="retour-titre" name="titre" minLength={5} maxLength={160} required/></div>
  <div className="space-y-2"><Label htmlFor="retour-description">{nature==='idee'?'Dans quelle situation cela vous serait-il utile ?':nature==='contestation'?'Quels faits souhaitez-vous faire réexaminer ?':'Ce qui se passe'}</Label>
   <textarea id="retour-description" name="description" minLength={15} maxLength={6000} required rows={5} className={champ}/></div>
  {nature==='bug'&&<div className="space-y-2"><Label htmlFor="retour-attendu">Le résultat attendu</Label><textarea id="retour-attendu" name="attendu" minLength={5} maxLength={3000} required rows={2} className={champ}/></div>}
  <div className="rounded-lg bg-[var(--creme)] p-3 text-xs text-[var(--texte-secondaire)] space-y-1">
   <p className="font-medium">Contexte joint à la demande</p>
   {/* Plus de chemin technique à l'écran (« /agence/[dossier]/… », 24/09) :
       il ne parlait ni à un locataire ni à un artisan. Il part toujours, seul,
       dans le champ caché `ecran`. */}
   <p>La page d’où vous écrivez est jointe automatiquement, sans son contenu.</p><p>Dernière interaction : {ACTIONS_RETOUR[action]}</p>
   <p>Aucune capture d’écran, valeur de champ, pièce, nom de dossier ni paramètre d’URL n’est collecté automatiquement. Évitez les données personnelles dans votre description.</p>
  </div>
  {nature==='bug'&&<p className="text-xs text-muted-foreground">Les signalements de problème et leurs réponses sont conservés six mois, puis supprimés.</p>}
  {nature==='idee'?<label className="flex items-start gap-2 text-sm"><input type="checkbox" name="partage" required className="mt-1"/>Je comprends que cette idée sera visible des membres de l’espace choisi et de la supervision. Sans organisation, elle reste visible de moi et de la supervision.</label>:
   <p className="text-xs text-muted-foreground">{nature==='contestation'?'Cette demande est examinée uniquement par la supervision Gerimmo, jamais par l’agence qui a évalué votre travail.':'Votre demande est visible de vous, de la supervision et de l’administrateur de l’agence concernée.'}</p>}
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
  <BoutonEnvoi enCours={enCours} enCoursTexte="Envoi…">Envoyer ma demande</BoutonEnvoi>
 </form>;
}
export function SoutenirIdee({id}:{id:string}){
 const {etat,soumettre,enCours}=useActionRetour(soutenirRetour.bind(null,id));
 return <form onSubmit={soumettre} className="mt-3"><BoutonEnvoi size="sm" variant="outline" enCours={enCours} disabled={Boolean(etat.succes)}>Soutenir cette idée</BoutonEnvoi>
 {etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}{etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}</form>;
}
