"use client";

import { useContext, useEffect, useId, useState, useTransition } from "react";
import { CheckCircle2, FileSignature, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBaseEspace, useRacineEspace } from "@/components/racine-espace-contexte";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { actualiserSignatureBail, annulerSignatureBail, envoyerSignatureBail, lireSignatureBail, preparerSignatureBail, activerBailApresSignature, type VueSignatureBail } from "@/app/actions/signature-bail";

import { DOCUMENTS_ZOHO, estimationSignature, type SelectionSignature } from "@/lib/politique-signature";
import { formaterDate } from "@/lib/ged";
import { confirmationEdlSurPlace, dateVisiteFr } from "@/lib/textes-signature-actes";

/** Le jour de Paris, « AAAA-MM-JJ » : borne de la date de la visite (jamais dans le futur). */
const aujourdhuiIso = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const instant = (iso: string) => new Date(iso).toLocaleString("fr-FR",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"});

const ETATS = { pret:"Prêt à relire",preparation:"Préparation de l’envoi",en_cours:"Signatures en cours",a_verifier:"Envoi à vérifier",termine:"Toutes les signatures reçues",annule:"Circuit annulé",refuse:"Signature refusée",expire:"Demande expirée" };
const PERSONNES: Record<string,string> = { signed:"Signé",notified:"Invitation envoyée",initiated:"À son tour",verified:"Identité vérifiée",processing:"Signature en cours",declined:"Refusé",error:"Invitation à vérifier",aborted:"Interrompu",consent_given:"Signature en cours" };

export function SignatureElectroniqueBail({orgId,bailId,selection,apresSignature}:{orgId:string;bailId:string;selection?:SelectionSignature;apresSignature?:React.ReactNode}) {
  const titreId = useId();
  const cleSelection = JSON.stringify(selection);
  const base = useBaseEspace(orgId);
  const racine = useRacineEspace();
  const parcours = useContext(EtapeComplementsBail);
  const visible = Boolean(selection) || !parcours || parcours.etape === "recapitulatif";
  const revision = parcours?.revision;
  const [vue,setVue] = useState<VueSignatureBail | null>(null);
  const [occupe,demarrer] = useTransition();
  const [versionRelue,setVersionRelue] = useState<string | null>(null);
  const [confirmerAnnulation,setConfirmerAnnulation] = useState(false);
  // État des lieux (décision du 23/10) : date de la visite et case « établi contradictoirement, sur place ».
  const [visiteLe,setVisiteLe] = useState("");
  const [surPlace,setSurPlace] = useState(false);
  useEffect(()=>{
    if (!visible) return;
    let vivant=true;
    lireSignatureBail(orgId,bailId,cleSelection ? JSON.parse(cleSelection) : undefined).then(v=>{if(vivant)setVue(v);}).catch(()=>{if(vivant)setVue({erreur:"Le suivi des signatures n’a pas pu être chargé."});});
    return ()=>{vivant=false;};
  },[orgId,bailId,visible,revision,cleSelection]);
  function agir(action:()=>Promise<VueSignatureBail>) {
    demarrer(async()=>{
      try {const res=await action();setVue(v=>({...v,erreur:undefined,succes:undefined,...res}));setConfirmerAnnulation(false);}
      catch {setVue(v=>({...v,erreur:"La confirmation n’a pas été reçue. Actualisez le suivi avant de réessayer."}));}
    });
  }
  const c=vue?.circuit;
  const versionPdf = c ? `${cleSelection}:${c.id}:${c.document_id}:${c.pdf_hash}` : null;
  const relu = Boolean(versionPdf && versionRelue === versionPdf && !vue?.versionDepassee);
  const contratId = vue?.bailId ?? bailId;
  const code = selection?.code ?? "bail";
  const estBail = code === "bail";
  const actif=c && ["preparation","en_cours","a_verifier"].includes(c.etat);
  // Cautionnement (décision du 23/10) : tant que la caution n'a pas confirmé son mobile, « envoyer » lui adresse le lien.
  const attente = code==="cautionnement" && c?.etat==="pret" ? vue?.attenteCaution : undefined;
  const mobileCautionConfirme = code==="cautionnement" && Boolean(vue?.signataires?.some(p=>p.qualite==="Garant"&&p.telephoneConfirmeLe));
  const edlConfirme = code!=="edl" || (surPlace && Boolean(dateVisiteFr(visiteLe)) && visiteLe<=aujourdhuiIso());
  const parties=c && !["annule","refuse","expire"].includes(c.etat)?c.signataires:vue?.signataires??[];
  const signes=parties.filter(p=>p.statut==="signed").length;
  const annexes=c && !["annule","refuse","expire"].includes(c.etat)?c.annexes:vue?.annexes??[];
  function corriger(champ:string) {
    if (/annexe|notice|règlement|version PDF|diagnostic|étape Documents/i.test(champ)) return "#etape-bail-5";
    if (/signataire|propriétaire|locataire|rôles|e-mail|SMS|représentant/i.test(champ)) return "#etape-bail-2";
    return cibleChampBail(champ,orgId,racine).href;
  }
  if (!visible) return null;
  return <section aria-labelledby={titreId} className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4 [&_button]:h-auto [&_button]:min-h-10 [&_button]:max-w-full [&_button]:whitespace-normal">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3"><span className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary h-fit"><FileSignature size={22}/></span><div className="min-w-0">
        <h4 id={titreId} className="font-semibold text-base">Signature · {DOCUMENTS_ZOHO[code]}</h4>
        <p className="text-sm text-muted-foreground">{code === "devis_artisan" ? "L’offre validée par l’artisan est jointe sans modification. Les propriétaires signent leur acceptation." : "Un document commun, les propriétaires signent en dernier."}</p>
      </div></div>
      {c&&<span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.etat==="termine"?"bg-success-soft text-foreground":"bg-primary/10 text-primary"}`}>{attente?.etat==="en_attente"&&!mobileCautionConfirme?"En attente de la caution":ETATS[c.etat]}</span>}
    </header>
    {!vue&&<p role="status" className="text-sm text-muted-foreground">Chargement des signataires…</p>}
    {vue?.mode==="indisponible"&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm">{vue.fermeture ?? <><strong>Signature en ligne en préparation.</strong> Vous pouvez vérifier les personnes et préparer le PDF. L’envoi sera disponible après la connexion et les essais du prestataire. Aucun e-mail ne part pendant cette préparation.</>}</p>}
    {vue?.mode==="sandbox"&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-medium">Environnement d’essai : documents fictifs uniquement.</p>}
    {vue?.essai&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm font-medium">Essai sans engagement · le document et les invitations sont fictifs. Cet essai ne met aucun logement en location.</p>}
    {!!parties.length&&parties.length<=25&&!vue?.fermeture&&<p className="text-xs text-muted-foreground">Estimation : {estimationSignature(parties.length).credits.toLocaleString("fr-FR")} crédits Zoho pour cet envoi et un premier SMS par signataire. Les renvois de SMS peuvent s’ajouter.</p>}
    {code==="cautionnement"&&<p className="rounded-xl bg-primary/5 p-3 text-sm">Avant l’envoi, la caution confirme elle-même son numéro de mobile, par un lien reçu par e-mail : le numéro de sa fiche n’est pas utilisé. Elle renseigne ensuite elle-même la mention de caution dans Zoho ; le bailleur la vérifie avant de signer à son tour. Une copie du bail est jointe.</p>}
    {!!parties.length&&<ol className="divide-y divide-border rounded-xl border border-border">
      {parties.map((p,i)=><li key={p.personId} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 p-3 md:flex md:flex-wrap md:gap-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.statut==="signed"?"bg-success-soft":"bg-muted"}`}>{p.statut==="signed"?<CheckCircle2 size={18}/>:i+1}</span>
        <div className="min-w-0 flex-1"><p className="font-medium text-sm break-words">{p.prenom} {p.nom} <span className="font-normal text-muted-foreground">· {p.qualite}</span></p>
        <p className="text-xs text-muted-foreground break-all"><span>{p.email||"E-mail manquant"}</span><span className="block whitespace-nowrap md:inline"><span className="hidden md:inline"> · </span>{code==="cautionnement"&&p.qualite==="Garant"&&(!c||c.etat==="pret")?(p.telephoneConfirmeLe?`${p.telephone} · confirmé par la caution`:"Mobile à confirmer par la caution"):p.telephone||"Téléphone manquant"}</span></p></div>
        <span className="col-start-2 text-xs text-muted-foreground">{p.statut?PERSONNES[p.statut]??"À vérifier":"À vérifier avant l’envoi"}</span>
        {p.preuveDocumentId&&<a className="col-start-2 text-xs underline" href={`${base}/documents/${p.preuveDocumentId}/fichier`} target="_blank" rel="noreferrer">Preuve de signature<span className="sr-only"> de {p.prenom} {p.nom}</span></a>}
      </li>)}
    </ol>}
    {!!vue?.manquants?.length&&!actif&&c?.etat!=="termine"&&<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"><strong>À compléter avant l’envoi</strong><ul className="mt-2 list-disc pl-5 space-y-1">{vue.manquants.map((m,i)=><li key={i}>{estBail ? <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={corriger(m)}>{m} →</a> : m}</li>)}</ul></div>}
    {!!annexes.length&&<div className="text-sm"><p className="font-medium">Annexes jointes au contrat · {annexes.length}</p><ul className="mt-1 grid gap-x-4 sm:grid-cols-2">{annexes.map(a=><li key={a.id}><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`${base}/documents/${a.id}/fichier`} target="_blank" rel="noreferrer">{a.titre}</a></li>)}</ul></div>}
    {actif&&<div className="space-y-2"><div className="flex justify-between text-sm"><span>Progression</span><span>{signes} / {parties.length} signatures</span></div><progress className="h-2 w-full accent-primary" max={Math.max(1,parties.length)} value={signes} aria-label="Signatures reçues"/><p className="text-xs text-muted-foreground">Le PDF envoyé reste inchangé. Chaque personne reçoit son invitation lorsque vient son tour.</p></div>}
    {c?.etat==="pret"&&<div className="rounded-xl bg-muted/40 p-3 space-y-3">
      {vue?.versionDepassee&&<p role="alert" className="text-sm text-destructive">Le dossier a changé ou la préparation est trop ancienne. Actualisez le PDF et relisez la nouvelle version avant l’envoi.</p>}
      <a className="font-medium text-sm underline" href={`${base}/documents/${c.document_id}/fichier`} target="_blank" rel="noreferrer">1. Ouvrir et relire le PDF à signer</a>
      <p className="text-xs text-muted-foreground">Les signatures devront être recueillies avant le {formaterDate(c.expire_le)}.</p>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1 size-4 accent-primary" type="checkbox" checked={relu} onChange={e=>setVersionRelue(e.target.checked ? versionPdf : null)} disabled={occupe||vue?.versionDepassee}/><span>J’ai relu ce PDF et vérifié l’identité, les coordonnées et l’ordre de tous les signataires.</span></label>
      {code==="edl"&&<div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
        <label className="block space-y-1"><span className="font-medium">Date de la visite</span>
          <input type="date" className="block h-10 rounded-md border border-input bg-transparent px-2" value={visiteLe} max={aujourdhuiIso()} onChange={e=>{setVisiteLe(e.target.value);setSurPlace(false);}} disabled={occupe}/></label>
        {vue?.dateEdl&&<p className="text-xs text-muted-foreground">Date portée par l’état des lieux : {formaterDate(vue.dateEdl)}.</p>}
        <label className="flex items-start gap-2"><input className="mt-1 size-4 accent-primary" type="checkbox" checked={surPlace} onChange={e=>setSurPlace(e.target.checked)} disabled={occupe||!dateVisiteFr(visiteLe)}/><span>{confirmationEdlSurPlace(dateVisiteFr(visiteLe)||"…")}</span></label>
        <p className="text-xs text-muted-foreground">La date, votre confirmation et son heure sont conservées avec le document signé.</p>
      </div>}
      {attente&&!mobileCautionConfirme&&<p role="status" className="rounded-xl bg-warning-soft p-3 text-sm">{attente.etat==="expire"
        ?<>Le lien envoyé à la caution le {instant(attente.envoyeLe)} a expiré sans confirmation. Envoyez-lui un nouveau lien.</>
        :<><strong>En attente de la caution.</strong> Un lien lui a été envoyé le {instant(attente.envoyeLe)} ; il expire le {instant(attente.expireLe)}. Dès qu’elle aura confirmé son numéro de mobile, l’acte lui sera envoyé en signature.</>}</p>}
      <Button disabled={occupe||!relu||!edlConfirme||vue?.versionDepassee||vue?.mode==="indisponible"} onClick={()=>agir(()=>envoyerSignatureBail(orgId,contratId,c.id,code==="edl"?{visiteLe}:undefined))}><Mail size={16}/>{occupe?"Traitement…":code==="cautionnement"&&!mobileCautionConfirme?(attente?"2. Renvoyer le lien à la caution":"2. Envoyer le lien de confirmation à la caution"):"2. Envoyer ce document pour signature"}</Button>
    </div>}
    {c?.etat==="termine"&&<div className="rounded-xl bg-success-soft p-3 space-y-3"><p className="flex items-center gap-2 font-medium text-sm"><ShieldCheck size={18}/>Document signé et preuves enregistrés dans Documents.</p>
      <a className="block underline text-sm" href={`${base}/documents/${c.document_signe}/fichier`} target="_blank" rel="noreferrer">Télécharger le document signé</a>
      {code==="devis_artisan"&&c.environnement==="production"&&!vue?.essai&&apresSignature}
      {estBail&&c.environnement==="production"&&!vue?.essai&&<Button disabled={occupe} onClick={()=>agir(()=>activerBailApresSignature(orgId,contratId,c.id))}>Activer le bail signé</Button>}
      {estBail&&<p className="text-xs text-muted-foreground">La mise en location applique les contrôles habituels du dossier. Un document d’essai n’active jamais un bail réel.</p>}
    </div>}
    {(vue?.erreur||c?.erreur)&&<p role="alert" className="text-sm text-destructive">{vue?.erreur||c?.erreur}</p>}
    {vue?.succes&&<p role="status" className="text-sm font-medium">{vue.succes}</p>}
    <div className="flex flex-wrap gap-2">
      {!actif&&(c?.etat!=="termine"||(!estBail&&code!=="edl"&&code!=="devis_artisan"))&&<Button variant="outline" disabled={occupe||!vue?.signataires?.length||Boolean(vue.manquants?.length)} onClick={()=>{setVersionRelue(null);agir(()=>preparerSignatureBail(orgId,contratId,selection));}}>{c?.etat==="pret"?"Actualiser le PDF préparé":c?.etat==="termine"?"Préparer un nouveau document":"Préparer le PDF et son circuit"}</Button>}
      <Button variant="outline" disabled={occupe} onClick={()=>agir(()=>c?actualiserSignatureBail(orgId,contratId,c.id):lireSignatureBail(orgId,contratId,selection))}><RefreshCw size={14}/>Actualiser le suivi</Button>
      {c&&(actif||c.etat==="pret")&&<Button variant="ghost" disabled={occupe} onClick={()=>setConfirmerAnnulation(true)}>Annuler le circuit</Button>}
    </div>
    {confirmerAnnulation&&c&&<div role="group" aria-label="Confirmation d’annulation" className="rounded-xl border border-destructive/30 p-3 text-sm space-y-2"><p>Arrêter ce circuit et ses invitations ? Le contrat déjà signé par toutes les parties ne peut plus être annulé ici.</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={occupe} onClick={()=>agir(()=>annulerSignatureBail(orgId,contratId,c.id))}>Confirmer l’annulation</Button><Button variant="outline" disabled={occupe} onClick={()=>setConfirmerAnnulation(false)}>Conserver le circuit</Button></div></div>}
    <p className="text-xs text-muted-foreground">Le lien de signature et le code SMS ne nécessitent pas de compte Gerimmo. {code !== "devis_artisan" && "L’acte de cautionnement reste un document distinct. L’état des lieux se signe lors de la visite contradictoire."}</p>
  </section>;
}
