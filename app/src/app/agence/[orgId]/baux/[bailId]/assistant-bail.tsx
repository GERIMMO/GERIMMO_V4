"use client";
import { useCallback, useRef, useEffect, useState, useTransition, type ReactNode } from "react";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { NavigationBail } from "./navigation-bail";
import styles from "@/components/presentation-parcours.module.css";
import { RubriquesDirectes } from "@/components/rubrique-dossier";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { CompletudeBail, SuiviEnregistrement } from "@/lib/suivi-enregistrement";
import { ArrowLeft, ArrowRight, House, FileText, UsersRound, Wallet, FolderOpen, ScrollText, ClipboardCheck, CircleCheck } from "lucide-react";
import { verifierDossierBail } from "./verifier-dossier";
import { ETAPES_BAIL, indexEtapeBail } from "@/lib/champs-etape-bail";
const icones = [FileText, UsersRound, House, Wallet, FolderOpen, ScrollText, ClipboardCheck];
export function AssistantBail({ orgId, bailId, contenus, formulaire, controleInitial }: {formulaire:ReactNode; orgId:string; bailId:string; contenus:ReactNode[]; controleInitial:{erreur?:string; manquants:string[]}}) {
  const etapes = ETAPES_BAIL;
  const positionChamp = (champ: string) => {
    const position = etapes.findIndex(e => e.id === cibleChampBail(champ, orgId).etape);
    return position >= 0 ? position : 5;
  };
  const [etape,setEtape]=useState(0);
  const [cibleNavigation,setCibleNavigation]=useState<{hash:string}|null>(null);
  const [enregistrement,setEnregistrement]=useState(false);
  const enregistrementRef=useRef(false);
  const etapeRef=useRef(0);
  const signalerEnregistrement=useCallback((enCours:boolean)=>{enregistrementRef.current=enCours;setEnregistrement(enCours);},[]);
  const [controle,setControle]=useState(controleInitial);
  const [chargement,demarrer]=useTransition();
  const requete = useRef(0);
  const [revision,setRevision]=useState(0);
  const verifier=useCallback((modifie = true)=>{
    const numero = ++requete.current;
    if (modifie) setRevision(v=>v+1);
    demarrer(async()=>{try {
      const resultat = await verifierDossierBail(orgId,bailId);
      if (numero === requete.current) setControle(resultat);
    } catch {if(numero === requete.current) setControle(c=>({...c,erreur:"La vérification est temporairement indisponible. Elle reprendra automatiquement après un enregistrement ou au retour sur cette page."}));}});
  }, [orgId,bailId]);
  useEffect(() => {
    let attente: ReturnType<typeof setTimeout>;
    const reprendre = () => {
      clearTimeout(attente);
      if (document.visibilityState === "visible") attente = setTimeout(() => verifier(false), 250);
    };
    window.addEventListener("focus", reprendre);
    window.addEventListener("online", reprendre);
    document.addEventListener("visibilitychange", reprendre);
    return () => {
      clearTimeout(attente);
      window.removeEventListener("focus", reprendre);
      window.removeEventListener("online", reprendre);
      document.removeEventListener("visibilitychange", reprendre);
    };
  }, [verifier]);
  const ouvrir=useCallback((hash:string)=>{
    const i=indexEtapeBail(hash);
    if(i>=0){etapeRef.current=i;setEtape(i);setCibleNavigation({hash});}
  },[]);
  // Chaque étape a son entrée d’historique : le bouton Retour du navigateur
  // revient à l’étape précédente au lieu de quitter l’assistant (CB-11).
  const allerA=useCallback((hash:string)=>{
    if(location.hash!==hash)history.pushState(null,"",`${location.pathname}${location.search}${hash}`);
    // Une ancre déjà courante doit aussi rouvrir et focaliser son champ.
    ouvrir(hash);
  },[ouvrir]);
  // Le formulaire du parcours retient un changement d’étape tant que l’étape
  // quittée a des modifications non enregistrées, le temps de proposer de les enregistrer (CB-05).
  const garde=useRef<((ancre:string)=>boolean)|null>(null);
  const definirGarde=useCallback((g:((ancre:string)=>boolean)|null)=>{garde.current=g;},[]);
  const demander=useCallback((hash:string)=>{
    if(indexEtapeBail(hash)!==etapeRef.current&&garde.current?.(hash))return;
    allerA(hash);
  },[allerA]);
  const [nonEnregistrees,setNonEnregistrees]=useState<string[]>([]);
  useEffect(()=>{
    const sync=(event?:Event)=>{
      if(enregistrementRef.current){history.replaceState(null,"",`${location.pathname}${location.search}#etape-bail-${etapeRef.current+1}`);return;}
      // Revenir à l’adresse ouverte sans étape rouvre la première étape.
      ouvrir(!location.hash&&event?.type==="popstate"?"#etape-bail-1":location.hash);
    };
    const clic=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const lien=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href]"):null;
      if(!lien||(lien.target&&lien.target!=="_self")||lien.hasAttribute("download"))return;
      const url=new URL(lien.href,location.href);
      if(url.origin!==location.origin||url.pathname!==location.pathname||url.search!==location.search||indexEtapeBail(url.hash)<0)return;
      if(enregistrementRef.current){event.preventDefault();return;}
      // Utiliser l’API publique permet à Next de synchroniser son URL canonique.
      // Recopier history.state transmettrait son marqueur interne __NA : Next
      // ignorerait alors ce changement et pourrait restaurer l’ancienne étape.
      // Annuler le saut natif évite une seconde navigation concurrente.
      event.preventDefault();
      demander(url.hash);
    };
    sync();document.addEventListener("click",clic,true);window.addEventListener("hashchange",sync);window.addEventListener("popstate",sync);
    return()=>{document.removeEventListener("click",clic,true);window.removeEventListener("hashchange",sync);window.removeEventListener("popstate",sync);};
  },[ouvrir,demander]);
  useEffect(()=>{
    if(!cibleNavigation)return;
    const frame=requestAnimationFrame(()=>{
      if(enregistrementRef.current)return;
      const racine=document.getElementById("assistant-bail-navigation");
      const cible=document.getElementById(decodeURIComponent(cibleNavigation.hash.slice(1)));
      if(!cible||!racine?.contains(cible)){
        document.getElementById("assistant-bail-titre")?.focus({preventScroll:true});
        racine?.scrollIntoView({block:"start"});
        return;
      }
      // Attendre le panneau actif avant de déplier et de placer le curseur.
      // Le toggle natif synchronise aussi les détails contrôlés du formulaire.
      let parent:HTMLElement|null=cible;
      while(parent&&parent!==racine){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}
      // Un champ d’un volet replié de la carte n’est pas focalisable : le titre de la carte le remplace (CB-12).
      const visible=(element:HTMLElement)=>!element.closest("[hidden], [inert], details:not([open])")&&!element.matches(":disabled")&&element.getClientRects().length>0;
      const champs='input:not([type="hidden"]), select, textarea';
      const scope=cible.matches(champs)?cible.closest("fieldset")??cible:cible;
      const champ=cible.matches(champs)&&visible(cible)?cible:Array.from(scope.querySelectorAll<HTMLElement>(champs)).find(visible);
      const titre=Array.from(cible.querySelectorAll<HTMLElement>("h2,h3,h4,legend")).find(visible);
      const focus=champ??titre??(visible(cible)?cible:document.getElementById("assistant-bail-titre"));
      if(!focus)return;
      if(!focus.matches(champs)&&!focus.hasAttribute("tabindex"))focus.setAttribute("tabindex","-1");
      focus.focus({preventScroll:true});
      focus.scrollIntoView({block:"center"});
    });
    return()=>cancelAnimationFrame(frame);
  },[etape,cibleNavigation]);
  function changer(i:number) {allerA(`#etape-bail-${i+1}`);}
  function demanderEtape(i:number) {demander(`#etape-bail-${i+1}`);}
  const manquantsEtape = controle.manquants.filter(m => positionChamp(m) === etape);
  const IconeEtape = icones[etape];
  const locataireAChoisir=controle.erreur==="Renseignez d'abord le locataire principal du bail.";
  return <SuiviEnregistrement.Provider value={verifier}><CompletudeBail.Provider value={controle}><RubriquesDirectes.Provider value={true}><div className={`assistant-location assistant-bail ${styles.presentation} ${styles.parcoursBail}`} id="assistant-bail-navigation" style={{scrollMarginTop:"calc(var(--hauteur-haut, 76px) + 20px)"}}>
    <NavigationBail etapes={etapes.map((e,i) => {
      const restant = controle.manquants.filter(m => positionChamp(m) === i).length;
      if (nonEnregistrees.includes(e.id)) return { ...e, statut: "incomplet" as const, statutLibelle: "Modifications non enregistrées" };
      // Le contrôle du texte du contrat ne certifie pas les pièces ni leurs échéances.
      if (i === 4) return { ...e, statutLibelle: restant ? `${restant} champs · pièces à vérifier` : "Pièces à vérifier" };
      return { ...e, ...(i < etapes.length-1 && !controle.erreur ? { statut: restant ? "incomplet" as const : "complet" as const, restant } : {}) };
    })} etape={etape} changer={i=>{if(!enregistrement)demanderEtape(i);}} />
    {etape === etapes.length-1 && nonEnregistrees.length > 0 && <p className={styles.verificationErreur} role="alert">Des modifications ne sont pas enregistrées ({nonEnregistrees.map(id => etapes.find(e => e.id === id)?.titre).join(", ")}) : ce récapitulatif et le contrat reprennent les valeurs enregistrées. <a href={`#etape-bail-${etapes.findIndex(e => e.id === nonEnregistrees[0])+1}`} className="underline">Revenir à l’étape {etapes.find(e => e.id === nonEnregistrees[0])?.titre} pour les enregistrer</a></p>}
    {chargement && <p className={styles.verification} role="status">Vérification automatique en cours…</p>}
    {controle.erreur && !chargement && (!locataireAChoisir||[1,6].includes(etape)) && <p className={locataireAChoisir?styles.verification:styles.verificationErreur} role={locataireAChoisir?"status":"alert"}>{controle.erreur}</p>}
    <div><div className={`assistant-carte ${styles.cadre}`}>
      <header className={styles.entete}>
        <span className={styles.icone}><IconeEtape size={23} aria-hidden="true" /></span>
        <div><span className={styles.surtitre}>Étape {String(etape+1).padStart(2,"0")} / {etapes.length}</span>
          <h2 id="assistant-bail-titre" tabIndex={-1}>{etapes[etape].titre}</h2>
          <p>{etapes[etape].detail}.</p>
        </div>
      </header>
      <div className={styles.corps}>
      {etape < etapes.length-1 && etape !== 4 && !controle.erreur && !manquantsEtape.length && <p className={styles.validee} role="status"><CircleCheck size={17} aria-hidden="true"/>Informations requises enregistrées.</p>}
      <EtapeComplementsBail.Provider value={{etape:etapes[etape].id, revision, signalerEnregistrement, ouvrir:(id)=>{const i=etapes.findIndex(e=>e.id===id);if(i>=0)changer(i);}, allerA, signalerNonEnregistrees:setNonEnregistrees, definirGarde}}>
        {formulaire}
        {contenus.map((c,i)=><section key={i} hidden={i!==etape} aria-label={etapes[i].titre} className="assistant-panneau">{c}</section>)}
      </EtapeComplementsBail.Provider>
      </div>
      {/* React réutilise le bouton en passant à une étape de saisie : annuler son action native avant qu’il ne devienne submit. */}
      <div className={`assistant-pied ${styles.pied}`}>{etape>0?<button type="button" disabled={enregistrement} className="btn-secondaire" onClick={()=>demanderEtape(etape-1)}><ArrowLeft size={16} aria-hidden="true"/>Précédent</button>:<span/>}{etape<etapes.length-1&&([0,3,4,5].includes(etape)?<BoutonEnvoi form="form-parcours-bail" name="continuer" value="1" className="btn-or" enCours={enregistrement} enCoursTexte="Enregistrement…">Enregistrer et continuer<ArrowRight size={16} aria-hidden="true"/></BoutonEnvoi>:<button type="button" className="btn-or" onClick={event=>{event.preventDefault();demanderEtape(etape+1);}}>Suivant<ArrowRight size={16} aria-hidden="true"/></button>)}</div>
    </div></div>
  </div></RubriquesDirectes.Provider></CompletudeBail.Provider></SuiviEnregistrement.Provider>;
}
