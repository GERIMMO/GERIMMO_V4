"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Sparkles, CheckCircle2, Save, CircleDashed, Send, FileDown } from "lucide-react";
import { EtapesSaisie } from "@/components/etapes-saisie";
import { contenuDevisLocal, sauverDevisLocal, effacerDevisLocal, type BrouillonDevisLocal } from "@/lib/brouillon-devis-local";
import { calculerDevis } from "@/lib/devis-structure";
import type { PreparationDevis } from "@/lib/parcours-devis-artisan";
import { declinerMaSollicitation } from "@/app/actions/artisan";
import { preparerPropositionDevis, enregistrerBrouillonDevis, envoyerDevisValide } from "../actions-preparation";
import { LignesDevis } from "../../lignes-devis";
import { euros } from "../../libelles";
import { ApercuDevis } from "./apercu-devis";
import styles from "./devis.module.css";
import { CLASSE_AIDE, CLASSE_BOUTON_PRINCIPAL, CLASSE_BOUTON_SOBRE, CLASSE_CHAMP, CLASSE_LIBELLE, CLASSE_ZONE_TEXTE, Erreur } from "../../ui";
function Envoyer({valide}: {valide:boolean}) {const {pending}=useFormStatus();return <button type="submit" disabled={!valide||pending} className={`${CLASSE_BOUTON_PRINCIPAL} ${styles.boutonEnvoi}`}><Send size={17} aria-hidden/>{pending?"Envoi…":"Envoyer le devis par e-mail"}</button>;}

// Le sélecteur d’étape mobile n’est pas une modification du devis.
function estSaisieDevis(cible: EventTarget) {
  if (!(cible instanceof HTMLInputElement || cible instanceof HTMLSelectElement || cible instanceof HTMLTextAreaElement)) return false;
  return ["diagnostic", "delai", "duree", "contraintes", "observations", "valide_jusqu_au"].includes(cible.name) || Boolean(cible.closest("[data-lignes-devis]"));
}
export function FormulaireDevis({sollicitationId,echeanceParDefaut,initiale,erreurPreparation,cleLocale,copieInitiale}: {sollicitationId:string;echeanceParDefaut:string;initiale?:PreparationDevis|null;erreurPreparation?:string;cleLocale:string;copieInitiale?:BrouillonDevisLocal}) {
  const [etat,action]=useActionState(envoyerDevisValide.bind(null,sollicitationId),{});
  const [refus,actionRefus]=useActionState(declinerMaSollicitation.bind(null,sollicitationId),{});
  const [refusOuvert,setRefusOuvert]=useState(false);
  const [preparation,setPreparation]=useState(initiale??null);
  const [revision,setRevision]=useState(initiale?.revision??0);
  const [valide,setValide]=useState(!copieInitiale && initiale?.statut==="valide");
  const [chargement,setChargement]=useState(!initiale&&!erreurPreparation);
  const [erreur,setErreur]=useState(erreurPreparation??"");
  const [sauvegarde,setSauvegarde]=useState(copieInitiale ? "Modifications non enregistrées" : "");
  const [enregistrement,setEnregistrement]=useState(false);
  const [cle,setCle]=useState(0);
  const form=useRef<HTMLFormElement>(null);const modifie=useRef(Boolean(copieInitiale));const demarre=useRef(false);
  const revisionCourante = useRef(copieInitiale?.revision ?? initiale?.revision ?? 0);
  const versionSaisie = useRef(0);
  const occupation = useRef(false);
  const derniereCopie = useRef<BrouillonDevisLocal | null>(copieInitiale ?? null);
  const frame = useRef(0);
  const copieId = useRef(copieInitiale?.copieId ?? "");
  const stockageRefuse = useRef(false);
  const [copieLocale, setCopieLocale] = useState(copieInitiale ? "Saisie reprise sur cet appareil. Pensez à enregistrer sur Gerimmo." : "");
  function conserver(afficher = true) {
    if (!modifie.current || !form.current) return;
    try {
      copieId.current ||= crypto.randomUUID();
      const copie: BrouillonDevisLocal = { version: 1, copieId: copieId.current, enregistreLe: Date.now(), revision: revisionCourante.current, contenu: contenuDevisLocal(new FormData(form.current)) };
      const ok = sauverDevisLocal(cleLocale, copie);
      stockageRefuse.current = !ok;
      if (ok) derniereCopie.current = copie;
      if (afficher) setCopieLocale(ok ? "Saisie conservée sur cet appareil pendant 7 jours. À enregistrer sur Gerimmo." : "La copie sur cet appareil est indisponible. Enregistrez le brouillon avant de quitter.");
    } catch {
      stockageRefuse.current = true;
      if (afficher) setCopieLocale("La copie sur cet appareil est indisponible. Enregistrez le brouillon avant de quitter.");
    }
  }
  const conserverRef = useRef(conserver);
  useEffect(() => { conserverRef.current = conserver; });
  useEffect(() => {
    const sortie = () => conserverRef.current(false);
    const avantSortie = (e: BeforeUnloadEvent) => {
      sortie();
      if (modifie.current && stockageRefuse.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("pagehide", sortie);
    window.addEventListener("beforeunload", avantSortie);
    return () => { cancelAnimationFrame(frame.current); sortie(); window.removeEventListener("pagehide", sortie); window.removeEventListener("beforeunload", avantSortie); };
  }, []);
  function revisionRecue(r: number, confirme: boolean) {
    revisionCourante.current = r; setRevision(r); setValide(false);
    if (confirme) {
      modifie.current = false;
      if (derniereCopie.current) effacerDevisLocal(cleLocale, derniereCopie.current);
      derniereCopie.current = null; setCopieLocale("");
    } else conserver();
  }
  useEffect(()=>{
    if(demarre.current||initiale||erreurPreparation)return;
    demarre.current=true;
    void preparerPropositionDevis(sollicitationId).then(r=>{
      if(r.preparation){revisionCourante.current=r.preparation.revision;setRevision(r.preparation.revision);if(!modifie.current){setPreparation(r.preparation);setCle(c=>c+1);}else conserverRef.current();}
      if(r.erreur)setErreur(r.erreur);
    }).catch(()=>setErreur("La proposition automatique est indisponible. Vous pouvez saisir votre devis.")).finally(()=>setChargement(false));
  },[initiale,sollicitationId,erreurPreparation]);
  function modification() {
    const confirmation=form.current?.elements.namedItem("validation_artisan");
    if(confirmation instanceof HTMLInputElement) confirmation.checked=false;
    modifie.current=true; versionSaisie.current += 1; setValide(false); setSauvegarde("Modifications non enregistrées");
    cancelAnimationFrame(frame.current);
    frame.current=requestAnimationFrame(() => conserverRef.current());
  }
  async function sauver() {
    if(!form.current || occupation.current) return;
    occupation.current=true; setEnregistrement(true); setErreur("");
    const version=versionSaisie.current;
    conserver();
    try {
      const r=await enregistrerBrouillonDevis(sollicitationId,new FormData(form.current));
      if(r.erreur) setErreur(r.erreur);
      else if(r.revision) {
        const confirme=version===versionSaisie.current;
        revisionRecue(r.revision,confirme);
        setSauvegarde(confirme ? "Brouillon enregistré sur Gerimmo" : "Modifications non enregistrées");
      }
    } catch { setErreur("La réponse n’est pas arrivée. Votre saisie reste conservée sur cet appareil si la copie locale est disponible. Rouvrez le devis pour vérifier la version Gerimmo."); }
    finally {occupation.current=false;setEnregistrement(false);}
  }
  const saisie=copieInitiale ? {...copieInitiale.contenu, valideJusquAu:copieInitiale.contenu.valide_jusqu_au, lignes:undefined} : preparation?.saisie;
  const proposition=preparation?.proposition;
  const texteSauvegarde = sauvegarde || (valide ? "PDF validé et enregistré" : initiale ? "Brouillon enregistré" : "Enregistrez pour reprendre plus tard");
  const nonEnregistre = sauvegarde === "Modifications non enregistrées" || sauvegarde === "Modifications à valider";
  return <div className={styles.editeur}>
    <form data-protection-saisie="locale" ref={form} action={action} onReset={e=>e.preventDefault()} onChange={e=>{if(estSaisieDevis(e.target))modification();}} onClick={e=>{const button=(e.target as HTMLElement).closest("button");if(button&&/Ajouter une prestation|Retirer cette ligne/.test(button.textContent??""))modification();}}>
      <input type="hidden" name="revision" value={revision}/>
      <EtapesSaisie titre="Préparer mon devis" etapes={[
        {titre:"Proposition",statut:valide?"complet":undefined,statutLibelle:valide?"Validée":"À relire",detail:"Gerimmo prépare une base de devis. Ajustez les prestations, les quantités et les prix."},
        {titre:"Conditions",statut:valide?"complet":undefined,statutLibelle:valide?"Validées":"À préciser",detail:"Précisez votre organisation et la durée de validité."},
        {titre:"Validation",statut:valide?"complet":undefined,statutLibelle:valide?"PDF enregistré":"Votre accord",detail:"Relisez puis validez le devis pour générer votre PDF."},
        {titre:"Envoi",statutLibelle:valide?"Prêt à envoyer":"Après validation",detail:"Transmettez le PDF à la personne qui vous a sollicité."},
      ]} conclusion={<Envoyer valide={valide&&!enregistrement&&!chargement}/>} contenus={[
        <div key={`prestations-${cle}`} className="space-y-5">
          <div className={styles.aideProposition}>
            <h3><Sparkles size={19} aria-hidden/>{chargement?"Gerimmo prépare votre proposition…":proposition?.moteur==="ia"?"Proposition préparée avec l’IA":"Proposition Gerimmo"}</h3>
            <p>Ajustez cette base selon votre diagnostic. Vous décidez des prestations et de vos prix.</p>
            {proposition&&<details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Origine des prix et points à vérifier</summary><ul className="mt-2 list-disc space-y-1 pl-5">{proposition.a_verifier.map((p,i)=><li key={i}>{p}</li>)}</ul>{proposition.sources.map((s,i)=><p key={i} className="mt-3"><strong>{s.origine==="gerimmo"?"Moyenne Gerimmo":"Référence de marché"} · {s.libelle}</strong><br/>{s.detail} {s.url&&<a href={s.url} target="_blank" rel="noreferrer" className="underline">Source consultée le 12/10/2026</a>}</p>)}</details>}
          </div>
          <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Votre diagnostic</span><textarea name="diagnostic" required maxLength={4000} rows={2} defaultValue={saisie?.diagnostic} placeholder="Décrivez le problème constaté et les travaux que vous proposez." className={CLASSE_ZONE_TEXTE}/></label>
          <LignesDevis initiales={saisie?.lignes} saisieInitiale={copieInitiale?.contenu.lignes}/>
        </div>,
        <div key={`conditions-${cle}`} className="space-y-5">
          <ResumeDevis compact/>
          <div className={styles.conditions}>
            <label className="space-y-1.5"><span className={CLASSE_LIBELLE}>Délai avant intervention</span><input name="delai" required maxLength={240} defaultValue={saisie?.delai} placeholder="Ex. : sous cinq jours" className={CLASSE_CHAMP}/></label>
            <label className="space-y-1.5"><span className={CLASSE_LIBELLE}>Durée estimée</span><input name="duree" required maxLength={240} defaultValue={saisie?.duree} placeholder="Ex. : une heure" className={CLASSE_CHAMP}/></label>
            <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Valable jusqu’au</span><input name="valide_jusqu_au" type="date" required defaultValue={copieInitiale ? copieInitiale.contenu.valide_jusqu_au : saisie?.valideJusquAu||echeanceParDefaut} className={CLASSE_CHAMP}/></label>
          </div>
          <div className={styles.complements}>
            <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Contraintes et accès <span className={styles.facultatif}>Facultatif</span></span><textarea name="contraintes" rows={3} maxLength={3000} defaultValue={saisie?.contraintes} placeholder="Accès au logement, matériel à prévoir…" className={CLASSE_ZONE_TEXTE}/></label>
            <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Observations et conditions <span className={styles.facultatif}>Facultatif</span></span><textarea name="observations" rows={3} maxLength={3000} defaultValue={saisie?.observations} placeholder="Précisions sur la prestation, les fournitures…" className={CLASSE_ZONE_TEXTE}/></label>
          </div>
        </div>,
        <div key="validation" className={styles.validation}><ResumeDevis/><div className={styles.validationAction}><ApercuDevis sollicitationId={sollicitationId} valide={valide} bloque={enregistrement||chargement} onGeneration={actif=>{occupation.current=actif;setEnregistrement(actif);if(actif)conserver();}} onValide={r=>{revisionRecue(Math.abs(r),r>0);setValide(r>0);setSauvegarde(r>0?"PDF validé et enregistré":"Modifications à valider");}}/><p className={CLASSE_AIDE}>Vos coordonnées et votre logo proviennent de <Link href="/artisan/entreprise#documents" target="_blank" className="underline">Ma fiche entreprise</Link>.</p></div></div>,
        <div key="envoi" className={`${styles.envoi} space-y-4`}>
          {valide?<><div className={styles.envoiPret}><h3><CheckCircle2 size={24} aria-hidden/>Votre devis est prêt</h3><p>Le PDF validé sera joint à l’e-mail et restera disponible dans votre espace et celui du demandeur.</p></div><a href={`/api/devis/${sollicitationId}/pdf`} target="_blank" rel="noreferrer" className={`${CLASSE_BOUTON_SOBRE} gap-2`}><FileDown size={18} aria-hidden/>Ouvrir mon devis PDF</a><p className={CLASSE_AIDE}>L’envoi sera effectué uniquement après votre clic ci-dessous.</p></>:<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Validez le devis à l’étape 3 pour générer le PDF avant de l’envoyer.</p>}
          {etat.erreur&&<Erreur>{etat.erreur}</Erreur>}
        </div>,
      ]}/>
      <div className={styles.sauvegarde}><span role="status" className={styles.etatSauvegarde} data-etat={nonEnregistre?"modifie":revision?"enregistre":"nouveau"}>{nonEnregistre||!revision?<CircleDashed size={16} aria-hidden/>:<CheckCircle2 size={16} aria-hidden/>}{enregistrement?"Enregistrement en cours…":texteSauvegarde}</span><button type="button" onClick={sauver} disabled={chargement||enregistrement} className={`${CLASSE_BOUTON_SOBRE} gap-2`}><Save size={16} aria-hidden/>{enregistrement?"Enregistrement…":"Enregistrer le brouillon"}</button></div>
      {copieLocale&&<p role="status" className="mt-2 text-sm text-muted-foreground">{copieLocale}</p>}
      {erreur&&<div className="mt-3"><Erreur>{erreur}</Erreur></div>}
    </form>
    <div className={styles.refus}>{!refusOuvert?<button type="button" onClick={()=>setRefusOuvert(true)}>Je ne peux pas chiffrer cette demande</button>:<form action={actionRefus} className="space-y-3"><label className="block">Motif (facultatif)<textarea name="motif" rows={2} className={CLASSE_ZONE_TEXTE}/></label>{refus.erreur&&<Erreur>{refus.erreur}</Erreur>}<button type="submit" className={CLASSE_BOUTON_SOBRE}>Confirmer : je ne chiffre pas</button><button type="button" className={CLASSE_BOUTON_SOBRE} onClick={()=>setRefusOuvert(false)}>Revenir</button></form>}</div>
  </div>;
}

function ResumeDevis({compact = false}: {compact?: boolean}) {
  const bloc = useRef<HTMLDivElement>(null);
  const [resume, setResume] = useState({ diagnostic:"", delai:"", duree:"", validite:"", contraintes:"", observations:"", total:null as number | null, prestations:[] as string[] });
  useEffect(() => {
    const form = bloc.current?.closest("form");
    if (!form) return;
    let frame = 0;
    function lire() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const data = new FormData(form!);
        let total: number | null = null; let prestations: string[] = [];
        try {
          const lignes = JSON.parse(String(data.get("lignes_devis") || "[]"));
          total = calculerDevis(lignes).montant_ttc_cents;
          prestations = lignes.map((l: {libelle:string;quantite:number;prix_unitaire_ht_cents:number;tva_bps:number}) => `${l.quantite} × ${l.libelle} · ${euros(l.prix_unitaire_ht_cents)} HT · TVA ${l.tva_bps/100} %`);
        } catch { /* Les validations des lignes restent applicables avant l’envoi. */ }
        setResume({diagnostic:String(data.get("diagnostic") || ""), delai:String(data.get("delai") || ""), duree:String(data.get("duree") || ""), validite:String(data.get("valide_jusqu_au") || ""), contraintes:String(data.get("contraintes")||""), observations:String(data.get("observations")||""), total, prestations});
      });
    }
    lire(); form.addEventListener("input", lire); form.addEventListener("change", lire); form.addEventListener("click", lire);
    return () => { cancelAnimationFrame(frame); form.removeEventListener("input", lire); form.removeEventListener("change", lire); form.removeEventListener("click", lire); };
  }, []);
  if (compact) return <div ref={bloc} className={styles.totalCompact}><span>Montant de votre devis <span className="text-muted-foreground">TTC</span></span><strong>{resume.total === null ? "À compléter" : euros(resume.total)}</strong></div>;
  return <div ref={bloc} className={styles.resume}>
    <div className={styles.resumeCorps}>
      <p className={styles.surtitre}>Récapitulatif</p>
      <h3>Votre proposition</h3>
      <p className="whitespace-pre-wrap">{resume.diagnostic || "Diagnostic à compléter"}</p>
      <ul>{resume.prestations.map((p,i) => <li key={i}>{p}</li>)}</ul>
      <dl><div><dt>Intervention</dt><dd>{resume.delai || "À compléter"}</dd></div><div><dt>Durée estimée</dt><dd>{resume.duree || "À compléter"}</dd></div><div><dt>Valable jusqu’au</dt><dd>{resume.validite ? new Date(`${resume.validite}T12:00:00`).toLocaleDateString("fr-FR") : "Non précisée"}</dd></div></dl>
      {resume.contraintes&&<p className="mt-4 whitespace-pre-wrap"><strong>Contraintes et accès :</strong> {resume.contraintes}</p>}
      {resume.observations&&<p className="mt-4 whitespace-pre-wrap"><strong>Observations et conditions :</strong> {resume.observations}</p>}
    </div>
    <div className={styles.resumeTotal}><span>Total TTC</span><strong>{resume.total === null ? "À compléter" : euros(resume.total)}</strong></div>
  </div>;
}
