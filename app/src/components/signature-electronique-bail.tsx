"use client";

import { useContext, useEffect, useState, useTransition } from "react";
import { CheckCircle2, FileSignature, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBaseEspace, useRacineEspace } from "@/components/racine-espace-contexte";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { actualiserSignatureBail, annulerSignatureBail, envoyerSignatureBail, lireSignatureBail, preparerSignatureBail, activerBailApresSignature, type VueSignatureBail } from "@/app/actions/signature-bail";

const ETATS = { pret:"Prêt à relire",preparation:"Préparation de l’envoi",en_cours:"Signatures en cours",a_verifier:"Envoi à vérifier",termine:"Toutes les signatures reçues",annule:"Circuit annulé",refuse:"Signature refusée",expire:"Demande expirée" };
const PERSONNES: Record<string,string> = { signed:"Signé",notified:"Invitation envoyée",initiated:"À son tour",verified:"Identité vérifiée",processing:"Signature en cours",declined:"Refusé",error:"Invitation à vérifier",aborted:"Interrompu",consent_given:"Signature en cours" };

export function SignatureElectroniqueBail({orgId,bailId}:{orgId:string;bailId:string}) {
  const base = useBaseEspace(orgId);
  const racine = useRacineEspace();
  const parcours = useContext(EtapeComplementsBail);
  const visible = !parcours || parcours.etape === "recapitulatif";
  const revision = parcours?.revision;
  const [vue,setVue] = useState<VueSignatureBail | null>(null);
  const [occupe,demarrer] = useTransition();
  const [relu,setRelu] = useState(false);
  const [confirmerAnnulation,setConfirmerAnnulation] = useState(false);
  useEffect(()=>{
    if (!visible) return;
    let vivant=true;
    lireSignatureBail(orgId,bailId).then(v=>{if(vivant)setVue(v);}).catch(()=>{if(vivant)setVue({erreur:"Le suivi des signatures n’a pas pu être chargé."});});
    return ()=>{vivant=false;};
  },[orgId,bailId,visible,revision]);
  function agir(action:()=>Promise<VueSignatureBail>) {
    demarrer(async()=>{
      try {const res=await action();setVue(v=>({...v,erreur:undefined,succes:undefined,...res}));setConfirmerAnnulation(false);}
      catch {setVue(v=>({...v,erreur:"La confirmation n’a pas été reçue. Actualisez le suivi avant de réessayer."}));}
    });
  }
  const c=vue?.circuit;
  const actif=c && ["preparation","en_cours","a_verifier"].includes(c.etat);
  const parties=c && !["annule","refuse","expire"].includes(c.etat)?c.signataires:vue?.signataires??[];
  const signes=parties.filter(p=>p.statut==="signed").length;
  const annexes=c && !["annule","refuse","expire"].includes(c.etat)?c.annexes:vue?.annexes??[];
  function corriger(champ:string) {
    if (/annexe|notice|règlement|version PDF|diagnostic|étape Documents/i.test(champ)) return "#etape-bail-5";
    if (/signataire|propriétaire|locataire|rôles|e-mail|SMS|représentant/i.test(champ)) return "#etape-bail-2";
    return cibleChampBail(champ,orgId,racine).href;
  }
  return <section aria-labelledby="titre-signature-electronique" className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary h-fit"><FileSignature size={22}/></span><div>
        <h4 id="titre-signature-electronique" className="font-semibold text-base">Signer le bail en ligne</h4>
        <p className="text-sm text-muted-foreground">Un contrat commun, les propriétaires signent en dernier.</p>
      </div></div>
      {c&&<span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.etat==="termine"?"bg-success-soft text-foreground":"bg-primary/10 text-primary"}`}>{ETATS[c.etat]}</span>}
    </header>
    {!vue&&<p role="status" className="text-sm text-muted-foreground">Chargement des signataires…</p>}
    {vue?.mode==="indisponible"&&<p className="rounded-xl bg-warning-soft p-3 text-sm"><strong>Signature en ligne en préparation.</strong> Vous pouvez vérifier les personnes et préparer le PDF. L’envoi sera disponible après la connexion et les essais du prestataire. Aucun e-mail ne part pendant cette préparation.</p>}
    {vue?.mode==="sandbox"&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-medium">Environnement d’essai : documents fictifs uniquement.</p>}
    {vue?.essai&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-medium">Essai sans engagement · le document et les invitations sont fictifs. Cet essai ne met aucun logement en location.</p>}
    {!!parties.length&&<ol className="divide-y divide-border rounded-xl border border-border">
      {parties.map((p,i)=><li key={p.personId} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 p-3 md:flex md:flex-wrap md:gap-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.statut==="signed"?"bg-success-soft":"bg-muted"}`}>{p.statut==="signed"?<CheckCircle2 size={18}/>:i+1}</span>
        <div className="min-w-0 flex-1"><p className="font-medium text-sm break-words">{p.prenom} {p.nom} <span className="font-normal text-muted-foreground">· {p.qualite}</span></p>
        <p className="text-xs text-muted-foreground break-all"><span>{p.email||"E-mail manquant"}</span><span className="block whitespace-nowrap md:inline"><span className="hidden md:inline"> · </span>{p.telephone||"Téléphone manquant"}</span></p></div>
        <span className="col-start-2 text-xs text-muted-foreground">{p.statut?PERSONNES[p.statut]??"À vérifier":"À vérifier avant l’envoi"}</span>
        {p.preuveDocumentId&&<a className="col-start-2 text-xs underline" href={`${base}/documents/${p.preuveDocumentId}/fichier`} target="_blank" rel="noreferrer">Preuve de signature<span className="sr-only"> de {p.prenom} {p.nom}</span></a>}
      </li>)}
    </ol>}
    {!!vue?.manquants?.length&&!actif&&c?.etat!=="termine"&&<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"><strong>À compléter avant l’envoi</strong><ul className="mt-2 list-disc pl-5 space-y-1">{vue.manquants.map((m,i)=><li key={i}><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={corriger(m)}>{m} →</a></li>)}</ul></div>}
    {!!annexes.length&&<div className="text-sm"><p className="font-medium">Annexes jointes au contrat · {annexes.length}</p><ul className="mt-1 grid gap-x-4 sm:grid-cols-2">{annexes.map(a=><li key={a.id}><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`${base}/documents/${a.id}/fichier`} target="_blank" rel="noreferrer">{a.titre}</a></li>)}</ul></div>}
    {actif&&<div className="space-y-2"><div className="flex justify-between text-sm"><span>Progression</span><span>{signes} / {parties.length} signatures</span></div><progress className="h-2 w-full accent-primary" max={Math.max(1,parties.length)} value={signes} aria-label="Signatures reçues"/><p className="text-xs text-muted-foreground">Le PDF envoyé reste inchangé. Chaque personne reçoit son invitation lorsque vient son tour.</p></div>}
    {c?.etat==="pret"&&<div className="rounded-xl bg-muted/40 p-3 space-y-3">
      {vue?.versionDepassee&&<p role="alert" className="text-sm text-destructive">Le dossier a changé ou la préparation est trop ancienne. Actualisez le PDF et relisez la nouvelle version avant l’envoi.</p>}
      <a className="font-medium text-sm underline" href={`${base}/documents/${c.document_id}/fichier`} target="_blank" rel="noreferrer">1. Ouvrir et relire le PDF à signer</a>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1 size-4 accent-primary" type="checkbox" checked={relu} onChange={e=>setRelu(e.target.checked)} disabled={occupe}/><span>J’ai relu ce PDF et vérifié l’identité, les coordonnées et l’ordre de tous les signataires.</span></label>
      <Button disabled={occupe||!relu||vue?.versionDepassee||vue?.mode==="indisponible"} onClick={()=>agir(()=>envoyerSignatureBail(orgId,bailId,c.id))}><Mail size={16}/>{occupe?"Traitement…":"2. Envoyer ce bail pour signature"}</Button>
    </div>}
    {c?.etat==="termine"&&<div className="rounded-xl bg-success-soft p-3 space-y-3"><p className="flex items-center gap-2 font-medium text-sm"><ShieldCheck size={18}/>Contrat signé et preuves enregistrés dans Documents.</p>
      <a className="block underline text-sm" href={`${base}/documents/${c.document_signe}/fichier`} target="_blank" rel="noreferrer">Télécharger le contrat signé</a>
      {c.environnement==="production"&&!vue?.essai&&<Button disabled={occupe} onClick={()=>agir(()=>activerBailApresSignature(orgId,bailId,c.id))}>Activer le bail signé</Button>}
      <p className="text-xs text-muted-foreground">La mise en location applique les contrôles habituels du dossier. Un document d’essai n’active jamais un bail réel.</p>
    </div>}
    {(vue?.erreur||c?.erreur)&&<p role="alert" className="text-sm text-destructive">{vue?.erreur||c?.erreur}</p>}
    {vue?.succes&&<p role="status" className="text-sm font-medium">{vue.succes}</p>}
    <div className="flex flex-wrap gap-2">
      {!actif&&c?.etat!=="termine"&&<Button variant="outline" disabled={occupe||!vue?.signataires?.length||Boolean(vue.manquants?.length)} onClick={()=>{setRelu(false);agir(()=>preparerSignatureBail(orgId,bailId));}}>{c?.etat==="pret"?"Actualiser le PDF préparé":"Préparer le PDF et son circuit"}</Button>}
      <Button variant="outline" disabled={occupe} onClick={()=>agir(()=>c?actualiserSignatureBail(orgId,bailId,c.id):lireSignatureBail(orgId,bailId))}><RefreshCw size={14}/>Actualiser le suivi</Button>
      {c&&(actif||c.etat==="pret")&&<Button variant="ghost" disabled={occupe} onClick={()=>setConfirmerAnnulation(true)}>Annuler le circuit</Button>}
    </div>
    {confirmerAnnulation&&c&&<div role="group" aria-label="Confirmation d’annulation" className="rounded-xl border border-destructive/30 p-3 text-sm space-y-2"><p>Arrêter ce circuit et ses invitations ? Le contrat déjà signé par toutes les parties ne peut plus être annulé ici.</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={occupe} onClick={()=>agir(()=>annulerSignatureBail(orgId,bailId,c.id))}>Confirmer l’annulation</Button><Button variant="outline" disabled={occupe} onClick={()=>setConfirmerAnnulation(false)}>Conserver le circuit</Button></div></div>}
    <p className="text-xs text-muted-foreground">Le lien de signature et le code SMS ne nécessitent pas de compte Gerimmo. L’acte de cautionnement reste un document distinct. L’état des lieux se signe sur place lors de la remise des clés.</p>
  </section>;
}
