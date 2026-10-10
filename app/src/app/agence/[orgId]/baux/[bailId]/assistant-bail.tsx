"use client";
import { useCallback, useRef, useEffect, useState, useTransition, type ReactNode } from "react";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
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
  useEffect(()=>{
    const sync=()=>{const i=indexEtapeBail(location.hash);if(i>=0)setEtape(i);};
    const clic=(e:MouseEvent)=>{const a=(e.target as Element).closest('a[href^="#"]');if(a){const i=indexEtapeBail(a.getAttribute("href") ?? "");if(i>=0)setEtape(i);}};
    sync();document.addEventListener("click",clic);window.addEventListener("hashchange",sync);
    return()=>{document.removeEventListener("click",clic);window.removeEventListener("hashchange",sync);};
  },[]);
  function changer(i:number) {setEtape(i); history.replaceState(null,"",`${location.pathname}${location.search}#etape-bail-${i+1}`); document.getElementById("assistant-bail-titre")?.focus({preventScroll:true}); document.getElementById("assistant-bail-navigation")?.scrollIntoView({block:"start"});}
  const manquantsEtape = controle.manquants.filter(m => positionChamp(m) === etape);
  const IconeEtape = icones[etape];
  return <SuiviEnregistrement.Provider value={verifier}><CompletudeBail.Provider value={controle}><RubriquesDirectes.Provider value={true}><div className={`assistant-location assistant-bail ${styles.presentation}`} id="assistant-bail-navigation" style={{scrollMarginTop:"calc(var(--hauteur-haut, 76px) + 20px)"}}>
    <NavigationBail etapes={etapes.map((e,i) => {
      const restant = controle.manquants.filter(m => positionChamp(m) === i).length;
      return { ...e, ...(i < etapes.length-1 && !controle.erreur ? { statut: restant ? "incomplet" as const : "complet" as const, restant } : {}) };
    })} etape={etape} changer={changer} />
    {chargement && <p className={styles.verification} role="status">Vérification automatique en cours…</p>}
    {controle.erreur && !chargement && <p className={styles.verificationErreur} role="alert">{controle.erreur}</p>}
    <div><div className={`assistant-carte ${styles.cadre}`}>
      {["conditions","paiement","precedent","travaux","honoraires"].map(id=><span key={id} id={`complements-${id}`} className="block scroll-mt-24"/>)}
      <header className={styles.entete}>
        <span className={styles.icone}><IconeEtape size={23} aria-hidden="true" /></span>
        <div><span className={styles.surtitre}>Étape {String(etape+1).padStart(2,"0")} / {etapes.length}</span>
          <h2 id="assistant-bail-titre" tabIndex={-1}>{etapes[etape].titre}</h2>
          <p>{etapes[etape].detail}.</p>
        </div>
      </header>
      <div className={styles.corps}>
      {etape < etapes.length-1 && !controle.erreur && !manquantsEtape.length && <p className={styles.validee} role="status"><CircleCheck size={17} aria-hidden="true"/>Les mentions requises pour le PDF sont enregistrées.</p>}
      {etape < etapes.length-1 && <p className={styles.aide}><span className={styles.legendePastille} aria-hidden="true"/> Pastille rouge : information obligatoire à compléter. Mise à jour après chaque enregistrement.</p>}
      <EtapeComplementsBail.Provider value={{etape:etapes[etape].id, revision, ouvrir:(id)=>{const i=etapes.findIndex(e=>e.id===id);if(i>=0)changer(i);}}}>
        {formulaire}
        {contenus.map((c,i)=><section key={i} hidden={i!==etape} aria-label={etapes[i].titre} className="assistant-panneau">{c}</section>)}
      </EtapeComplementsBail.Provider>
      </div>
      <div className={`assistant-pied ${styles.pied}`}>{etape>0?<button type="button" className="btn-secondaire" onClick={()=>changer(etape-1)}><ArrowLeft size={16} aria-hidden="true"/>Précédent</button>:<span/>}{etape<etapes.length-1&&([0,3,4,5].includes(etape)?<button type="submit" form="form-parcours-bail" name="continuer" value="1" className="btn-or">Enregistrer et continuer<ArrowRight size={16} aria-hidden="true"/></button>:<button type="button" className="btn-or" onClick={()=>changer(etape+1)}>Suivant<ArrowRight size={16} aria-hidden="true"/></button>)}</div>
    </div></div>
  </div></RubriquesDirectes.Provider></CompletudeBail.Provider></SuiviEnregistrement.Provider>;
}
