"use client";

import { useId, useState } from "react";
import { preparerRecommande, confirmerEnvoiRecommande, actualiserRecommande, chargerRecommande, type EtatRecommande } from "@/app/actions/recommandes";
import { ETATS_RECOMMANDE, type RecommandePrepare } from "@/lib/recommandes";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { eur } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function RecommandeElectronique({orgId,bailId,delai,idExistant,libelle="Préparer l’envoi AR24"}:{orgId:string;bailId:string;delai:number;idExistant?:string;libelle?:string}) {
 const [courrier,setCourrier]=useState<RecommandePrepare|null>(null);
 const [repreparer,setRepreparer]=useState(false);
 const [remplaceId,setRemplaceId]=useState<string|undefined>();
 const {etat,enCours,soumettre}=useActionFormulaire<EtatRecommande>(async()=>{
  const resultat=idExistant&&!repreparer?await chargerRecommande(orgId,idExistant):await preparerRecommande(orgId,bailId,delai,remplaceId);
  if(resultat.courrier) setCourrier(resultat.courrier);
  return resultat;
 });
 return <div className="space-y-3">
  {!courrier&&<form data-saisie-confirmee onSubmit={soumettre}><BoutonEnvoi variant="outline" enCours={enCours} disabled={!Number.isInteger(delai)||delai<1||delai>90} enCoursTexte="Vérification…">{repreparer ? remplaceId ? "Préparer la nouvelle lettre" : "Actualiser la préparation" : libelle}</BoutonEnvoi></form>}
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
  {courrier&&<FicheRecommande key={`${courrier.id}:${courrier.empreinte}`} orgId={orgId} courrierInitial={courrier} onRepreparer={precedent=>{setRepreparer(true);setRemplaceId(precedent??courrier.remplace_id??undefined);setCourrier(null);}} />}
 </div>;
}
function FicheRecommande({orgId,courrierInitial,onRepreparer}:{orgId:string;courrierInitial:RecommandePrepare;onRepreparer:(remplaceId?:string)=>void}) {
 const uid=useId();
 const [courrier,setCourrier]=useState(courrierInitial);
 const {etat,enCours,soumettre}=useActionFormulaire<EtatRecommande>(async(_precedent,donnees)=>{
  const resultat=courrier.statut==="prepare"?await confirmerEnvoiRecommande(orgId,courrier.id,donnees):await actualiserRecommande(orgId,courrier.id);
  if(resultat.courrier) setCourrier(resultat.courrier);
  return resultat;
 });
 const peutEnvoyer=courrier.statut==="prepare";
 return <section aria-label="Recommandé électronique" className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><strong>{ETATS_RECOMMANDE[courrier.statut]}</strong>{courrier.environnement==="sandbox"&&<span className="text-sm font-semibold">Environnement de test AR24</span>}</div>
  <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Destinataire</dt><dd>{courrier.destinataire.prenom} {courrier.destinataire.nom}<br/><span className="break-all">{courrier.destinataire.email}</span></dd></div><div><dt className="text-muted-foreground">Coût de l’envoi</dt><dd className="font-semibold">{eur(courrier.tarif_ttc_centimes/100)} TTC</dd></div><div><dt className="text-muted-foreground">Solde échu à recevoir</dt><dd>{eur(Number(courrier.dette.total_centimes)/100)}</dd></div><div><dt className="text-muted-foreground">Délai de règlement</dt><dd>{courrier.delai} jours à compter de la réception</dd></div></dl>
  <details open={peutEnvoyer}><summary className="cursor-pointer font-medium">Relire le courrier</summary><iframe title="Courrier adressé au locataire" className="mt-2 h-80 w-full rounded-lg border border-border bg-white" sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:15px/1.6 system-ui,sans-serif;padding:16px;color:#1c2024;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:6px;text-align:left;border-bottom:1px solid #ddd}h1{font-size:20px}h2,h3{font-size:17px}</style></head><body>${courrier.contenu}</body></html>`}/></details>
  {courrier.statut==="a_authentifier"&&<p className="text-sm">Le courrier est en brouillon chez AR24. Finalisez l’authentification de l’expéditeur dans votre compte AR24 sous 7 jours, puis actualisez ce suivi. Il n’est pas encore envoyé.</p>}
  {["a_verifier","en_cours"].includes(courrier.statut)&&<p className="text-sm">Le résultat doit être vérifié auprès d’AR24 avec la référence ci-dessous. Le courrier peut avoir été accepté : ne créez pas un deuxième envoi.</p>}
  {courrier.statut==="en_attente"&&<p className="text-sm">AR24 a pris en charge le courrier. L’envoi et la réception seront confirmés par le suivi et les preuves.</p>}
  {courrier.statut==="echec"&&<p className="text-sm">{courrier.echec_definitif_confirme_le?"L’échec définitif de ce courrier a été vérifié auprès d’AR24. Vous pouvez préparer une nouvelle lettre ; son contenu, son destinataire et son coût devront être confirmés à nouveau.":"AR24 signale un échec. Faites vérifier son caractère définitif avant toute nouvelle lettre, afin d’éviter un double envoi."}</p>}
  {courrier.statut==="echec"&&courrier.echec_definitif_confirme_le&&<button type="button" className="btn-secondaire" disabled={enCours} onClick={()=>onRepreparer(courrier.id)}>Préparer une nouvelle lettre</button>}
  <form data-saisie-confirmee onSubmit={soumettre} className="space-y-3">
   {peutEnvoyer?<>
    <input type="hidden" name="empreinte" value={courrier.empreinte}/><input type="hidden" name="email" value={courrier.destinataire.email}/><input type="hidden" name="tarif" value={courrier.tarif_ttc_centimes}/>
    <label htmlFor={`${uid}-confirmation`} className="flex items-start gap-2 text-sm"><input id={`${uid}-confirmation`} type="checkbox" name="confirme" value="oui" required className="mt-1"/>Je confirme que ce solde reste non reçu. J’ai relu le courrier et son destinataire ; j’accepte le coût de {eur(courrier.tarif_ttc_centimes/100)} TTC.</label>
    <label htmlFor={`${uid}-otp`} className="block text-sm font-medium">Code d’authentification AR24<input id={`${uid}-otp`} type="password" name="otp" autoComplete="one-time-code" required maxLength={128} className="mt-1 block w-full rounded-lg border border-border p-2" aria-describedby={`${uid}-code-aide`}/></label><p id={`${uid}-code-aide`} className="text-sm text-muted-foreground">Utilisez le code de votre identité d’expéditeur AR24. Il n’est pas conservé par Gerimmo.</p>
    <div className="flex flex-wrap gap-2"><BoutonEnvoi enCours={enCours} enCoursTexte="Envoi en cours…">{`Confirmer l’envoi · ${eur(courrier.tarif_ttc_centimes/100)}`}</BoutonEnvoi><button type="button" className="btn-secondaire" disabled={enCours} onClick={()=>onRepreparer()}>Actualiser la préparation</button></div>
   </>:<BoutonEnvoi variant="outline" enCours={enCours} enCoursTexte="Actualisation…">Actualiser le suivi</BoutonEnvoi>}
  </form>
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm">{etat.succes}</p>}
  {courrier.preuves.length>0&&<ul className="flex flex-wrap gap-3 text-sm">{courrier.preuves.map(preuve=><li key={preuve.type}><a href={preuve.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">Preuve de {({depot:"dépôt",envoi:"envoi",reception:"réception",refus:"refus",negligence:"non-réclamation"})[preuve.type]}</a></li>)}</ul>}
  <p className="break-all text-xs text-muted-foreground">Référence : {courrier.id}{courrier.ar24_id&&` · AR24 ${courrier.ar24_id}`}</p>
  {courrier.remplace_id&&<p className="break-all text-xs text-muted-foreground">Nouvelle préparation après l’échec vérifié du courrier {courrier.remplace_id}.</p>}
 </section>;
}
