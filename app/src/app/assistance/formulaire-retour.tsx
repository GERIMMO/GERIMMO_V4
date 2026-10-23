"use client";
import { useState } from "react";
import { Bug, CircleHelp, Lightbulb, MessageSquareWarning, ShieldCheck, Send } from "lucide-react";
import styles from "./assistance.module.css";
import Link from "next/link";
import { envoyerRetour, soutenirRetour } from "@/app/actions/retours";
import { useActionRetour } from "@/lib/use-action-retour";
import { ACTIONS_RETOUR, NATURES_RETOUR } from "@/lib/retours";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const champ="w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const ICONES = { bug: Bug, question: CircleHelp, idee: Lightbulb, reclamation: MessageSquareWarning, contestation: ShieldCheck };
// `retour` et `contexte` ne servent qu'aux liens de l'écran de succès : ni
// l'un ni l'autre n'est envoyé avec la demande (24/09).
export function FormulaireRetour({ecran,action,cle,organisations,contestation=false,idee=false,retour='',contexte='',cheminAssistance='/assistance'}:{ecran:string;action:string;cle:string;organisations:{id:string;nom:string}[];contestation?:boolean;idee?:boolean;retour?:string;contexte?:string;cheminAssistance?:string}){
 const [cleEnvoi]=useState(cle);
 const [nature,setNature]=useState(contestation?'contestation':idee?'idee':'bug');
 const {etat,soumettre,enCours}=useActionRetour(envoyerRetour);
 if(etat.id)return <div role="status" className="rounded-xl border border-[var(--filet)] bg-[var(--success-soft)] p-5 space-y-3">
  <p className="font-medium">Votre demande est enregistrée.</p><p>L’équipe Gerimmo peut maintenant l’examiner. Son suivi conserve toutes les réponses.</p>
  <p className="flex flex-wrap gap-x-4 gap-y-2"><Link className="underline" href={`${cheminAssistance}?sel=${etat.id}${contexte?`&${contexte}`:''}#mes-demandes`}>Consulter ma demande</Link>
  <a className="underline" href={`${cheminAssistance}${contexte?`?${contexte}`:''}#nouvelle`}>Nouvelle demande</a>
  {retour&&<Link className="underline" href={retour}>← Retour à la page précédente</Link>}</p>
 </div>;
 return <form data-saisie-confirmee onSubmit={soumettre} className={styles.formulaire} aria-busy={enCours}>
  <input type="hidden" name="cle_envoi" value={cleEnvoi}/><input type="hidden" name="ecran" value={ecran}/><input type="hidden" name="action_origine" value={action}/>
  <fieldset className={styles.natures}><legend>Quel est votre besoin ?</legend><div>
   {Object.entries(NATURES_RETOUR).filter(([k])=>k!=='contestation'||contestation).map(([k,v])=>{
    const Icone=ICONES[k as keyof typeof ICONES];
    return <label key={k} className={styles.nature} data-active={nature===k}><input type="radio" name="nature" value={k} checked={nature===k} onChange={()=>setNature(k)} className="sr-only"/><Icone size={21} aria-hidden="true"/><span>{v}</span></label>;
   })}
  </div></fieldset>
  {nature!=='contestation'&&<div className="space-y-2"><Label htmlFor="retour-org">Espace concerné</Label>
   <select id="retour-org" name="organization_id" className={champ} defaultValue={organisations.length===1?organisations[0].id:''}>
    <option value="">Mon compte / hors organisation</option>{organisations.map(o=><option key={o.id} value={o.id}>{o.nom}</option>)}
   </select></div>}
  <div className="space-y-2"><Label htmlFor="retour-titre">{nature==='idee'?'Le besoin en une phrase':'Sujet'}</Label><Input id="retour-titre" name="titre" minLength={5} maxLength={160} required placeholder={nature==='idee'?"Ex. Retrouver plus vite un document":"Résumez votre demande en quelques mots"} aria-describedby="retour-titre-aide"/><p id="retour-titre-aide" className={styles.indication}>Entre 5 et 160 caractères.</p></div>
  <div className="space-y-2"><Label htmlFor="retour-description">{nature==='idee'?'Dans quelle situation cela vous serait-il utile ?':nature==='contestation'?'Quels faits souhaitez-vous faire réexaminer ?':'Votre message'}</Label>
   <textarea id="retour-description" name="description" minLength={15} maxLength={6000} required rows={5} className={champ} placeholder={nature==='bug'?"Que cherchiez-vous à faire ? Que se passe-t-il à l’écran ?":nature==='idee'?"Expliquez votre besoin et ce que cela vous permettrait de faire.":"Décrivez votre demande pour nous aider à vous répondre."} aria-describedby="retour-description-aide"/><p id="retour-description-aide" className={styles.indication}>Au moins 15 caractères. Évitez les données personnelles dans votre message.</p></div>
  {nature==='bug'&&<div className="space-y-2"><Label htmlFor="retour-attendu">Le résultat attendu</Label><textarea id="retour-attendu" name="attendu" minLength={5} maxLength={3000} required rows={2} className={champ} placeholder="Que devait-il se passer ? (au moins 5 caractères)"/></div>}
  <div className="rounded-lg bg-[var(--creme)] p-3 text-xs text-[var(--texte-secondaire)] space-y-1">
   <details><summary className="cursor-pointer font-medium">Informations jointes automatiquement</summary><div className="mt-2 space-y-1">
   {/* Plus de chemin technique à l'écran (« /agence/[dossier]/… », 24/09) :
       il ne parlait ni à un locataire ni à un artisan. Il part toujours, seul,
       dans le champ caché `ecran`. */}
   <p>La page d’où vous écrivez est jointe automatiquement, sans son contenu.</p><p>Dernière interaction : {ACTIONS_RETOUR[action] ?? ACTIONS_RETOUR.navigation}</p>
   <p>Aucune capture d’écran, valeur de champ, pièce, nom de dossier ni paramètre d’URL n’est collecté automatiquement. Évitez les données personnelles dans votre description.</p></div></details>
  </div>
  {nature==='bug'&&<p className="text-xs text-muted-foreground">Les signalements de problème et leurs réponses sont conservés six mois, puis supprimés.</p>}
  {nature==='idee'?<label className="flex items-start gap-2 text-sm"><input type="checkbox" name="partage" required className="mt-1"/>Je comprends que cette idée sera visible des membres de l’espace choisi et de l’équipe Gerimmo. Sans organisation, elle reste visible de moi et de l’équipe Gerimmo.</label>:
   <p className="text-xs text-muted-foreground">{nature==='contestation'?'Cette demande est examinée uniquement par l’équipe Gerimmo, jamais par le gestionnaire qui a évalué votre travail.':'Votre demande est visible de vous, de l’équipe Gerimmo et, le cas échéant, du gestionnaire concerné.'}</p>}
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
  <div className={styles.envoi}><span>Les champs affichés sont obligatoires, sauf le choix d’un espace.</span><BoutonEnvoi enCours={enCours} enCoursTexte="Envoi…"><Send size={15} aria-hidden="true"/> Envoyer ma demande</BoutonEnvoi></div>
 </form>;
}
export function SoutenirIdee({id}:{id:string}){
 const {etat,soumettre,enCours}=useActionRetour(soutenirRetour.bind(null,id));
 return <form data-saisie-libre onSubmit={soumettre} className="mt-3"><BoutonEnvoi size="sm" variant="outline" enCours={enCours} disabled={Boolean(etat.succes)}>Soutenir cette idée</BoutonEnvoi>
 {etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}{etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}</form>;
}
