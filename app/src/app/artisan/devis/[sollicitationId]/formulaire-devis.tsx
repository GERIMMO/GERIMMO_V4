"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Sparkles, CheckCircle2, Save, CircleDashed, Send, FileDown } from "lucide-react";
import { EtapesSaisie } from "@/components/etapes-saisie";
import { contenuDevisLocal, sauverDevisLocal, effacerDevisLocal, type BrouillonDevisLocal } from "@/lib/brouillon-devis-local";
import { calculerDevis, libelleQuantite, libelleTauxTva } from "@/lib/devis-structure";
import { GARANTIE_ANNONCEE_MAX, type PreparationDevis } from "@/lib/parcours-devis-artisan";
import { declinerMaSollicitation } from "@/app/actions/artisan";
import { preparerPropositionDevis, enregistrerBrouillonDevis, envoyerDevisValide } from "../actions-preparation";
import { LignesDevis } from "../../lignes-devis";
import { euros } from "../../libelles";
import { ApercuDevis } from "./apercu-devis";
import styles from "./devis.module.css";
import { CLASSE_AIDE, CLASSE_BOUTON_PRINCIPAL, CLASSE_BOUTON_SOBRE, CLASSE_CHAMP, CLASSE_LIBELLE, CLASSE_ZONE_TEXTE, Erreur } from "../../ui";
// D18 (livraison 2) : en révision, le bouton nomme la version qui part (« Envoyer la version 2 »).
function Envoyer({valide, versionSuivante}: {valide:boolean; versionSuivante?: number}) {const {pending}=useFormStatus();return <button type="submit" disabled={!valide||pending} className={`${CLASSE_BOUTON_PRINCIPAL} ${styles.boutonEnvoi}`}><Send size={17} aria-hidden/>{pending?"Envoi…":versionSuivante?`Envoyer la version ${versionSuivante}`:"Transmettre le devis et prévenir le demandeur"}</button>;}

// Le sélecteur d’étape mobile n’est pas une modification du devis.
function estSaisieDevis(cible: EventTarget) {
  if (!(cible instanceof HTMLInputElement || cible instanceof HTMLSelectElement || cible instanceof HTMLTextAreaElement)) return false;
  return ["diagnostic", "delai", "duree", "contraintes", "observations", "valide_jusqu_au", "note_revision", "garantie"].includes(cible.name) || Boolean(cible.closest("[data-lignes-devis]"));
}
export function FormulaireDevis({sollicitationId,echeanceParDefaut,initiale,erreurPreparation,cleLocale,copieInitiale,versionSuivante}: {sollicitationId:string;echeanceParDefaut:string;initiale?:PreparationDevis|null;erreurPreparation?:string;cleLocale:string;copieInitiale?:BrouillonDevisLocal;versionSuivante?:number}) {
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
  // Interrupteur IA (22/11/2026) : l'équivalent manuel de la proposition — repartir d'un devis vide, à tout moment.
  const [vierge,setVierge]=useState(false);
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
  function repartirVierge() {
    // Seule l'étape « Proposition » est remontée (sa clé change) : les conditions déjà saisies ne bougent pas. Les
    // champs sont vidés au prochain rendu ; la copie locale et l'état « non enregistré » suivent, comme pour toute saisie.
    setVierge(true);
    modification();
  }
  const saisieConnue=copieInitiale ? {...copieInitiale.contenu, valideJusquAu:copieInitiale.contenu.valide_jusqu_au, lignes:undefined} : preparation?.saisie;
  const saisie=vierge&&saisieConnue ? {...saisieConnue, diagnostic:"", lignes:undefined} : saisieConnue;
  const proposition=preparation?.proposition;
  const texteSauvegarde = sauvegarde || (valide ? "PDF validé et enregistré" : initiale ? "Brouillon enregistré" : "Enregistrez pour reprendre plus tard");
  const nonEnregistre = sauvegarde === "Modifications non enregistrées" || sauvegarde === "Modifications à valider";
  return <div className={styles.editeur}>
    <form data-protection-saisie="locale" ref={form} action={action} onReset={e=>e.preventDefault()} onChange={e=>{if(estSaisieDevis(e.target))modification();}} onClick={e=>{const button=(e.target as HTMLElement).closest("button");if(button&&/Ajouter une prestation|Retirer cette ligne/.test(button.textContent??""))modification();}}>
      <input type="hidden" name="revision" value={revision}/>
      <EtapesSaisie titre={versionSuivante?`Préparer la version ${versionSuivante}`:"Préparer mon devis"} etapes={[
        {titre:"Proposition",statut:valide?"complet":undefined,statutLibelle:valide?"Validée":"À relire",detail:versionSuivante?"Votre version précédente est reprise ici. Ajustez-la et dites ce qui change.":"Gerimmo prépare une base de devis. Ajustez les prestations, les quantités et les prix."},
        {titre:"Conditions",statut:valide?"complet":undefined,statutLibelle:valide?"Validées":"À préciser",detail:"Précisez votre organisation et la durée de validité."},
        {titre:"Validation",statut:valide?"complet":undefined,statutLibelle:valide?"PDF enregistré":"Votre accord",detail:"Relisez puis validez le devis pour générer votre PDF."},
        {titre:"Envoi",statutLibelle:valide?"Prêt à envoyer":"Après validation",detail:"Transmettez le PDF à la personne qui vous a sollicité."},
      ]} conclusion={<Envoyer valide={valide&&!enregistrement&&!chargement} versionSuivante={versionSuivante}/>} contenus={[
        <div key={`prestations-${cle}-${vierge?"vierge":"base"}`} className="space-y-5">
          {/* D18 (livraison 2) : « ce qui change » est obligatoire pour une version suivante ; la base le lit dans la préparation envoyée. */}
          {versionSuivante&&<label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Ce qui change dans la version {versionSuivante}</span><textarea name="note_revision" required maxLength={4000} rows={3} defaultValue={copieInitiale ? copieInitiale.contenu.note_revision : preparation?.saisie?.noteRevision} placeholder="Ex. : main-d’œuvre détaillée par heure, prix du joint ramené au tarif fournisseur." className={CLASSE_ZONE_TEXTE}/><span className={CLASSE_AIDE}>Transmis au client avec la nouvelle version : il lit ce qui a été revu.</span></label>}
          <div className={styles.aideProposition}>
            <h3><Sparkles size={19} aria-hidden/>{chargement?"Gerimmo prépare votre proposition…":vierge?"Devis vierge":proposition?.moteur==="ia"?"Proposition préparée avec l’IA":"Proposition Gerimmo"}</h3>
            <p>{vierge?"Vous partez d’un devis vide : décrivez votre diagnostic, puis ajoutez vos prestations et vos prix.":"Ajustez cette base selon votre diagnostic. Vous décidez des prestations et de vos prix."}</p>
            {!chargement&&!vierge&&!versionSuivante&&<button type="button" className="lien-discret inline-flex min-h-11 items-center text-sm" onClick={repartirVierge}>Repartir d’un devis vierge</button>}
            {proposition&&!vierge&&<details className="mt-1 text-sm"><summary className="cursor-pointer font-semibold">Origine des prix et points à vérifier</summary><ul className="mt-2 list-disc space-y-1 pl-5">{proposition.a_verifier.map((p,i)=><li key={i}>{p}</li>)}</ul>{proposition.sources.map((s,i)=><p key={i} className="mt-3"><strong>{s.origine==="gerimmo"?"Moyenne Gerimmo":"Référence de marché"} · {s.libelle}</strong><br/>{s.detail} {s.url&&<a href={s.url} target="_blank" rel="noreferrer" className="underline">Source consultée le 12/10/2026</a>}</p>)}</details>}
          </div>
          <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Votre diagnostic</span><textarea name="diagnostic" required maxLength={4000} rows={2} defaultValue={saisie?.diagnostic} placeholder="Décrivez le problème constaté et les travaux que vous proposez." className={CLASSE_ZONE_TEXTE}/></label>
          <LignesDevis afficherHtIncomplet initiales={saisie?.lignes} saisieInitiale={vierge?undefined:copieInitiale?.contenu.lignes}/>
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
          {/* Audit palier 1, P2-02 : la garantie que l'artisan annonce. Facultative ; reprise telle quelle sur son devis et
              montrée au demandeur. C'est son engagement : Gerimmo ne la vérifie pas et ne garantit rien. */}
          <div className="space-y-1.5">
            <label htmlFor="garantie-annoncee" className={CLASSE_LIBELLE}>Garantie que vous annoncez <span className={styles.facultatif}>Facultatif</span></label>
            <input id="garantie-annoncee" name="garantie" maxLength={GARANTIE_ANNONCEE_MAX} defaultValue={saisie?.garantie ?? ""} aria-describedby="garantie-annoncee-aide" placeholder="Ex. : un an, pièces et main-d’œuvre" className={CLASSE_CHAMP}/>
            <p id="garantie-annoncee-aide" className={CLASSE_AIDE}>Reprise telle quelle sur votre devis et montrée au demandeur. C’est votre engagement : Gerimmo ne garantit rien à votre place.</p>
          </div>
        </div>,
        <div key="validation" className={styles.validation}><ResumeDevis/><div className={styles.validationAction}><ApercuDevis sollicitationId={sollicitationId} valide={valide} bloque={enregistrement||chargement} onGeneration={actif=>{occupation.current=actif;setEnregistrement(actif);if(actif)conserver();}} onValide={r=>{revisionRecue(Math.abs(r),r>0);setValide(r>0);setSauvegarde(r>0?"PDF validé et enregistré":"Modifications à valider");}}/><p className={CLASSE_AIDE}>Vos coordonnées et votre logo proviennent de <Link href="/artisan/entreprise#entreprise-devis" target="_blank" className="underline">Ma fiche entreprise</Link>.</p></div></div>,
        <div key="envoi" className={`${styles.envoi} space-y-4`}>
          {valide?<><div className={styles.envoiPret}><h3><CheckCircle2 size={24} aria-hidden/>Votre devis est prêt</h3><p>Le demandeur recevra un lien vers le dossier où il pourra consulter le PDF validé.</p></div><a href={`/api/devis/${sollicitationId}/pdf?preparation=1`} target="_blank" rel="noreferrer" className={`${CLASSE_BOUTON_SOBRE} gap-2`}><FileDown size={18} aria-hidden/>Ouvrir mon devis PDF</a><p className={CLASSE_AIDE}>L’envoi sera effectué uniquement après votre clic ci-dessous.</p></>:<p className={styles.rappel}>Validez le devis à l’étape 3 pour générer le PDF avant de l’envoyer.</p>}
          {etat.erreur&&<Erreur>{etat.erreur}</Erreur>}
        </div>,
      ]}/>
      <div className={styles.sauvegarde}><span role="status" className={styles.etatSauvegarde} data-etat={nonEnregistre?"modifie":revision?"enregistre":"nouveau"}>{nonEnregistre||!revision?<CircleDashed size={16} aria-hidden/>:<CheckCircle2 size={16} aria-hidden/>}{enregistrement?"Enregistrement en cours…":texteSauvegarde}</span><button type="button" onClick={sauver} disabled={chargement||enregistrement} className={`${CLASSE_BOUTON_SOBRE} gap-2`}><Save size={16} aria-hidden/>{enregistrement?"Enregistrement…":"Enregistrer le brouillon"}</button></div>
      {copieLocale&&<p role="status" className="mt-2 text-sm text-muted-foreground">{copieLocale}</p>}
      {erreur&&<div className="mt-3"><Erreur>{erreur}</Erreur></div>}
    </form>
    {/* D18 (livraison 2) : en révision, renoncer clôt la demande ; la version précédente reste au dossier. */}
    <div className={styles.refus}>{!refusOuvert?<button type="button" onClick={()=>setRefusOuvert(true)}>{versionSuivante?"Je renonce à cette demande":"Je ne peux pas chiffrer cette demande"}</button>:<form data-saisie-libre action={actionRefus} className="space-y-3"><label className="block">Motif (facultatif)<textarea name="motif" rows={2} className={CLASSE_ZONE_TEXTE}/></label>{refus.erreur&&<Erreur>{refus.erreur}</Erreur>}<button type="submit" className={CLASSE_BOUTON_SOBRE}>{versionSuivante?"Confirmer : je renonce, sans nouvelle version":"Confirmer : je ne chiffre pas"}</button><button type="button" className={CLASSE_BOUTON_SOBRE} onClick={()=>setRefusOuvert(false)}>Revenir</button></form>}</div>
  </div>;
}

function ResumeDevis({compact = false}: {compact?: boolean}) {
  const bloc = useRef<HTMLDivElement>(null);
  const [resume, setResume] = useState({ diagnostic:"", delai:"", duree:"", validite:"", contraintes:"", observations:"", garantie:"", total:null as number | null, prestations:[] as string[] });
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
          prestations = lignes.map((l: {libelle:string;quantite:number;prix_unitaire_ht_cents:number;tva_bps:number}) => `${libelleQuantite(l.quantite)} × ${l.libelle} · ${euros(l.prix_unitaire_ht_cents)} HT · TVA ${libelleTauxTva(l.tva_bps)}`);
        } catch { /* Les validations des lignes restent applicables avant l’envoi. */ }
        setResume({diagnostic:String(data.get("diagnostic") || ""), delai:String(data.get("delai") || ""), duree:String(data.get("duree") || ""), validite:String(data.get("valide_jusqu_au") || ""), contraintes:String(data.get("contraintes")||""), observations:String(data.get("observations")||""), garantie:String(data.get("garantie")||"").trim(), total, prestations});
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
      {resume.garantie&&<p className="mt-4 whitespace-pre-wrap" data-garantie-annoncee><strong>Garantie annoncée :</strong> {resume.garantie}</p>}
    </div>
    <div className={styles.resumeTotal}><span>Total TTC</span><strong>{resume.total === null ? "À compléter" : euros(resume.total)}</strong></div>
  </div>;
}
