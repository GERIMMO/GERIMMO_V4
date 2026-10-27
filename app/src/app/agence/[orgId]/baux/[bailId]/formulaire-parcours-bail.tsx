"use client";
import { avertissementsCoherenceLoyer } from "@/lib/coherence-loyer";
import { AvertissementsLoyer } from "@/components/avertissements-loyer";
import { useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, CheckCheck } from "lucide-react";
import { initialiserParcoursBail } from "@/lib/initialiser-parcours-bail";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { champBailManquant } from "@/lib/reperes-bail";
import { eur } from "@/lib/ged";
import styles from "./formulaire-parcours-bail.module.css";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { modifierEtapeBail } from "@/app/actions/etapes-bail";
import type { EtatBail } from "@/app/actions/baux";
import { type EtapeSaisieBail, type ValeursParcoursBail } from "@/lib/champs-etape-bail";
import { Input } from "@/components/ui/input";
import { LabelBail as Label } from "@/components/pastille-bail";
import { lireMontantFacultatif } from "@/lib/saisie-montant";

type Champ = { nom:string; titre:string; type?:"number"|"montant"|"date"|"textarea"; options?:[string,string][]; requis?:boolean; aide?:string; visible?:(v:Record<string,string>)=>boolean; min?:number; max?:number; entier?:boolean };
type Groupe = { etapes:string[]; titre:string; aide?:string; agence?:boolean; repliable?:boolean; resume?:string; ancre?:string; champs:Champ[] };
const ouiNon:[string,string][]=[["","À confirmer"],["true","Oui"],["false","Non"]];
const choix:[string,string][]=[["true","Oui"],["false","Non"]];
const recent=(v:Record<string,string>)=>v.precedente_location==="recente";
// Le champ « justification » apparaît dès qu'un complément est saisi : lu comme le serveur (« 40,50 » vaut 40,5), jamais par Number().
export const complementPositif=(brut:string|undefined)=>{const lu=lireMontantFacultatif(brut??"");return "montant" in lu&&(lu.montant??0)>0;};
const groupes:Groupe[]=[
 {etapes:["bail"],titre:"Le contrat",champs:[
  {nom:"type",titre:"Type de bail",requis:true,options:[["nu","Location nue"],["meuble","Location meublée"],["colocation","Colocation · contrat commun"],["colocation_individuelle","Colocation · contrat individuel"]]},
  {nom:"chambre_id",titre:"Chambre privative",requis:true,visible:v=>v.type==="colocation_individuelle"},
  {nom:"date_debut",titre:"Date d’entrée",type:"date",requis:true},
  {nom:"date_conclusion_prevue",titre:"Date prévue du contrat",type:"date",aide:"La date prévue sur le contrat ; elle ne vaut pas signature."},
 ]},
 {etapes:["bail"],titre:"Option étudiante",repliable:true,resume:"Durée de 9 mois pour un étudiant",champs:[
  {nom:"meuble_etudiant",titre:"Bail étudiant de 9 mois",options:choix,visible:v=>v.type==="meuble"||((v.type==="colocation"||v.type==="colocation_individuelle")&&v.logement_meuble==="true")},
 ]},
 {etapes:["loyer"],titre:"Loyer et charges",aide:"Saisissez 0 lorsqu’un montant est nul.",champs:[
  {nom:"loyer_hc",titre:"Loyer hors charges (€)",type:"montant",requis:true},
  {nom:"charges",titre:"Charges mensuelles (€)",type:"montant",requis:true},
  {nom:"depot_garantie",titre:"Dépôt de garantie (€)",type:"montant",requis:true,aide:"Le plafond est vérifié selon le type de bail et le caractère meublé du logement."},
  {nom:"jour_echeance",titre:"Jour d’échéance",type:"number",requis:true,min:1,max:28,entier:true,aide:"Chaque mois, entre le 1er et le 28."},
  {nom:"charges_mode",titre:"Mode de charges",options:[["provision","Provision avec régularisation annuelle"],["forfait","Forfait sans régularisation"]]},
 ]},
 {etapes:["loyer"],titre:"Précédente location",ancre:"complements-precedent",champs:[
  {nom:"precedente_location",titre:"Situation du logement",options:[["","À confirmer"],["premiere","Première location"],["ancienne","Ancien locataire parti depuis au moins 18 mois"],["recente","Ancien locataire parti depuis moins de 18 mois"]]},
  {nom:"dernier_loyer",titre:"Précédent loyer hors charges (€)",type:"montant",visible:recent},
  {nom:"dernier_loyer_versement",titre:"Date du dernier versement",type:"date",visible:recent},
  {nom:"precedent_loyer_revise",titre:"Ce loyer a-t-il été révisé ?",options:ouiNon,visible:recent},
  {nom:"dernier_loyer_revision",titre:"Date de la dernière révision",type:"date",visible:v=>recent(v)&&v.precedent_loyer_revise==="true"},
 ]},
 {etapes:["loyer"],titre:"Révision et paiement",repliable:true,ancre:"complements-paiement",resume:"Révision annuelle, fixation et modalités de paiement",champs:[
  {nom:"revision_irl",titre:"Révision annuelle du loyer (IRL)",options:choix},
  {nom:"irl_trimestre",titre:"Trimestre IRL",options:[["","À confirmer"],["T1","T1"],["T2","T2"],["T3","T3"],["T4","T4"]],visible:v=>v.revision_irl==="true"},
  {nom:"irl_valeur",titre:"Valeur de l’IRL de référence",type:"montant",visible:v=>v.revision_irl==="true"},
  {nom:"fixation_loyer",titre:"Fixation initiale du loyer",options:[["","À confirmer"],["libre","Librement fixé"],["plafonnement","Plafonnement en zone d’encadrement"],["reevaluation","Réévaluation après travaux"]]},
  {nom:"paiement_echeance",titre:"Paiement du loyer",options:[["echoir","À échoir (d’avance)"],["echu","À terme échu"]]},
  {nom:"lieu_paiement",titre:"Lieu ou modalités de paiement",aide:"Exemple : virement au bailleur."},
 ]},
 {etapes:["loyer"],titre:"Honoraires",ancre:"complements-honoraires",agence:true,aide:"À renseigner pour une location gérée par une agence. Indiquez 0 si aucun honoraire n’est facturé.",champs:[
  {nom:"zone_honoraires",titre:"Zone des honoraires",options:[["","À confirmer"],["tres_tendue","Très tendue"],["tendue","Tendue"],["autre","Autre zone"]]},
  {nom:"honoraires_bailleur",titre:"Visite, dossier, bail — bailleur (€ TTC)",type:"montant"},
  {nom:"honoraires_locataire",titre:"Visite, dossier, bail — locataire (€ TTC)",type:"montant"},
  {nom:"honoraires_edl_bailleur",titre:"État des lieux — bailleur (€ TTC)",type:"montant"},
  {nom:"honoraires_edl_locataire",titre:"État des lieux — locataire (€ TTC)",type:"montant"},
 ]},
 {etapes:["documents"],titre:"Montants figurant sur le DPE",ancre:"complements-energie",aide:"À reprendre dans le rapport si ces informations ne sont pas encore renseignées.",champs:[
  {nom:"dpe_depenses_min",titre:"Dépenses annuelles minimales (€)",type:"montant"},
  {nom:"dpe_depenses_max",titre:"Dépenses annuelles maximales (€)",type:"montant"},
  {nom:"dpe_annees_reference",titre:"Année(s) des prix de l’énergie",aide:"Par exemple : 2021, 2022 et 2023, selon le DPE."},
 ]},
 {etapes:["clauses"],titre:"Règles locales",ancre:"complements-conditions",champs:[
  {nom:"encadrement_loyer",titre:"Loyers de référence imposés par arrêté local",options:ouiNon,aide:"Une zone tendue n’est pas nécessairement soumise aux loyers de référence."},
  {nom:"loyer_reference",titre:"Loyer de référence (€/m²)",type:"montant",visible:v=>v.encadrement_loyer==="true"},
  {nom:"loyer_reference_majore",titre:"Loyer de référence majoré (€/m²)",type:"montant",visible:v=>v.encadrement_loyer==="true"},
  {nom:"complement_loyer",titre:"Complément de loyer (€)",type:"montant",visible:v=>v.encadrement_loyer==="true"},
  {nom:"complement_justification",titre:"Justification du complément",visible:v=>v.encadrement_loyer==="true"&&complementPositif(v.complement_loyer),aide:"À préciser si un complément est appliqué."},
  {nom:"servitude_residence_principale",titre:"Servitude de résidence principale",options:ouiNon,aide:"À vérifier dans les règles d’urbanisme applicables au logement."},
 ]},
 {etapes:["clauses"],titre:"Clauses de résiliation",ancre:"complements-resiliation",repliable:true,resume:"Défaut d’assurance et troubles de voisinage : clauses proposées, modifiables",champs:[
  {nom:"clause_resolutoire_assurance",titre:"Défaut d’assurance",options:choix},
  {nom:"clause_resolutoire_troubles",titre:"Troubles de voisinage jugés",options:choix},
  {nom:"clause_resolutoire_servitude",titre:"Non-respect de la servitude",options:choix,visible:v=>v.servitude_residence_principale==="true"},
  {nom:"duree_reduite_evenement",titre:"Événement justifiant une durée réduite",aide:"À préciser seulement si le régime du bail permet une durée réduite."},
 ]},
 {etapes:["clauses"],titre:"Travaux et accords particuliers",repliable:true,ancre:"complements-travaux",resume:"À compléter seulement si vous avez prévu des dispositions particulières",champs:[
  {nom:"travaux_recents",titre:"Travaux récents du bailleur",type:"textarea"},
  {nom:"travaux_recents_montant",titre:"Montant de ces travaux (€)",type:"montant",visible:v=>Boolean(v.travaux_recents?.trim()),aide:"À renseigner si des travaux sont indiqués."},
  {nom:"travaux_locataire",titre:"Travaux à la charge du locataire",type:"textarea"},
  {nom:"clauses_particulieres",titre:"Clauses particulières",type:"textarea"},
 ]},
];

export function FormulaireParcoursBail({orgId,bailId,defauts,agence,meuble,chambres,surfaceHabitable,lienChambres}:{orgId:string;bailId:string;defauts:ValeursParcoursBail;agence:boolean;meuble:boolean;chambres:{id:string;nom:string}[];surfaceHabitable?:number|null;lienChambres?:string}) {
 const parcours=useContext(EtapeComplementsBail);
 const etape=parcours?.etape??"bail";
 const controle=useContext(CompletudeBail);
 const formulaireRef=useRef<HTMLFormElement>(null);
 const envoiRef=useRef(false);
 const [valeurs,setValeurs]=useState<Record<string,string>>(()=>initialiserParcoursBail(defauts,meuble));
 const [ouverts,setOuverts]=useState<Record<string,boolean>>({});
 useEffect(()=>{
   const ouvrirCible=(hash:string)=>{
     const groupe=groupes.find(g=>g.ancre===hash.replace(/^#/,""));
     if(groupe?.repliable)setOuverts(v=>({...v,[groupe.titre]:true}));
   };
   const sync=()=>ouvrirCible(location.hash);
   const clic=(event:MouseEvent)=>{
     const lien=(event.target as Element).closest('a[href^="#"]');
     if(lien)ouvrirCible(lien.getAttribute("href")??"");
   };
   sync();window.addEventListener("hashchange",sync);document.addEventListener("click",clic);
   return()=>{window.removeEventListener("hashchange",sync);document.removeEventListener("click",clic);};
 },[etape]);
 // Lire la valeur pendant l’événement : une mise à jour différée ne doit pas
 // relire un champ DOM déjà restauré par React ou par une actualisation.
 const modifierValeur=(nom:string,valeur:string)=>setValeurs(v=>({
   ...v,[nom]:valeur,
   ...(nom==="type"&&valeur==="colocation_individuelle"&&!v.chambre_id&&chambres.length===1?{chambre_id:chambres[0].id}:{}),
 }));
 const [retourEtape,setRetourEtape]=useState("");
 const [modifie,setModifie]=useState(false);
 const {etat,soumettre,enCours}=useActionFormulaire<EtatBail>(async (ancien,form)=>{
   const active=etape as EtapeSaisieBail;
   setRetourEtape(active);
   if(active==="documents"&&form.get("continuer")==="1") {
     const fichiers=document.getElementById("documents-bail")?.querySelectorAll<HTMLInputElement>('input[type="file"]');
     if(Array.from(fichiers??[]).some(champ=>Boolean(champ.files?.length))) {
       return {erreur:"Un fichier est sélectionné mais pas encore déposé. Utilisez le bouton de dépôt de son formulaire avant de continuer."};
     }
   }
   const res=await modifierEtapeBail(orgId,bailId,active,ancien,form);
   if(res.erreur) {
     setOuverts(v=>({...v,...Object.fromEntries(groupes.filter(g=>g.etapes.includes(active)&&g.repliable).map(g=>[g.titre,true]))}));
     requestAnimationFrame(()=>formulaireRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus());
   }
   if(res.succes){setModifie(false);if(form.get("continuer")==="1")parcours?.ouvrir(({bail:"personnes",loyer:"documents",documents:"clauses",clauses:"recapitulatif"})[active]);}
   return res;
 });
 const visible=["bail","loyer","documents","clauses"].includes(etape);
 const montantLoyer=lireMontantFacultatif(valeurs.loyer_hc??"");
 const montantCharges=lireMontantFacultatif(valeurs.charges??"");
 const totalMensuel="montant" in montantLoyer&&"montant" in montantCharges&&montantLoyer.montant!=null&&montantCharges.montant!=null?montantLoyer.montant+montantCharges.montant:null;
 return <form ref={formulaireRef} data-saisie-confirmee id="form-parcours-bail" hidden={!visible} onSubmit={async event=>{
   if(envoiRef.current){event.preventDefault();return;}
   envoiRef.current=true;parcours?.signalerEnregistrement?.(true);
   try { await soumettre(event); }
   finally { envoiRef.current=false;parcours?.signalerEnregistrement?.(false); }
 }} className={`bail-formulaire-etape ${styles.formulaire}`} onChange={()=>setModifie(true)} aria-busy={enCours} onInvalidCapture={event=>{
   const champ=event.target as HTMLElement;
   const bloc=champ.closest<HTMLDetailsElement>("details[data-groupe]");
   if(bloc){bloc.open=true;setOuverts(v=>({...v,[bloc.dataset.groupe!]:true}));}
 }}>
  {etape==="bail"&&<p className={styles.reprise}><CheckCheck size={17} aria-hidden="true"/>Les informations du lot, les propriétaires et les diagnostics déjà enregistrés sont repris dans ce parcours.</p>}
  {groupes.filter(g=>!g.agence||agence).map(g=>{
   const actif=g.etapes.includes(etape),contexte={...valeurs,logement_meuble:String(meuble)};
   const champsVisibles=g.champs.filter(c=>!c.visible||c.visible(contexte));
   const restant=champsVisibles.filter(c=>!valeurs[c.nom]?.trim()&&(c.requis||(!controle?.erreur&&champBailManquant(controle?.manquants??[],`bail.${c.nom}`)))).length;
   const champs=<fieldset disabled={!actif||enCours} className={`${styles.groupe} ${g.titre==="Le contrat"?styles.sansTitre:""}`}>
    <legend>{g.titre}</legend>
    {g.aide&&<p className={styles.aide}>{g.aide}</p>}
    <div className={`grid gap-4 ${g.etapes[0]==="documents"?"sm:grid-cols-3":"sm:grid-cols-2"}`}>{g.champs.map(c=>{
     const id=`parcours-${c.nom}`,affiche=!c.visible||c.visible(contexte);
     const opts=c.nom==="chambre_id"?[["","Choisir une chambre"],...chambres.map(ch=>[ch.id,ch.nom])] as [string,string][]:c.options;
     return <div key={c.nom} hidden={!affiche} className={c.type==="textarea"?"space-y-1.5 sm:col-span-2":"space-y-1.5"}>
      <Label htmlFor={id} champ={`bail.${c.nom}`} renseigne={Boolean(valeurs[c.nom]?.trim())}>{c.titre}{c.requis?" *":""}</Label>
      {opts?<select id={id} name={c.nom} value={valeurs[c.nom]??""} required={c.requis&&affiche} disabled={!affiche} aria-describedby={c.aide?`${id}-aide`:undefined} onChange={e=>modifierValeur(c.nom,e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{opts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
       :c.type==="textarea"?<textarea id={id} name={c.nom} value={valeurs[c.nom]??""} disabled={!affiche} aria-describedby={c.aide?`${id}-aide`:undefined} rows={3} maxLength={c.nom==="clauses_particulieres"?4000:2000} onChange={e=>modifierValeur(c.nom,e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"/>
       :<Input id={id} name={c.nom} type={c.type==="montant"?"text":(c.type??"text")} inputMode={c.type==="montant"?"decimal":undefined} disabled={!affiche} value={valeurs[c.nom]??""} required={c.requis&&affiche} aria-describedby={c.aide?`${id}-aide`:undefined} min={c.type==="number"?(c.min??0):undefined} max={c.max} step={c.type==="number"?(c.entier?1:"0.01"):undefined} maxLength={c.nom==="dpe_annees_reference"?100:500} onChange={e=>modifierValeur(c.nom,e.target.value)}/>}
      {c.nom==="date_conclusion_prevue"&&valeurs.date_debut&&!valeurs.date_conclusion_prevue&&<button type="button" className="inline-flex min-h-9 items-center text-xs underline" onClick={()=>{modifierValeur("date_conclusion_prevue",valeurs.date_debut);setModifie(true);}}>Même date que l’entrée</button>}
      {c.nom==="chambre_id"&&lienChambres&&<Link href={lienChambres} className="text-xs underline">{chambres.length?"Modifier les chambres du lot":"Ajouter une chambre au lot"}</Link>}
      {c.aide&&<p id={`${id}-aide`} className="text-xs text-muted-foreground">{c.aide}</p>}
     </div>;
    })}</div>
    {g.titre==="Loyer et charges"&&totalMensuel!=null&&<div className={styles.total} role="status"><span>Loyer + charges, par mois</span><strong>{eur(totalMensuel)}</strong></div>}
   </fieldset>;
   // Replier ne désactive rien : tous les réglages applicables restent soumis.
   return g.repliable?<details key={g.titre} id={g.ancre} data-groupe={g.titre} hidden={!actif||!champsVisibles.length} className={styles.options} open={ouverts[g.titre]??false} onToggle={event=>{
    const ouvert=event.currentTarget.open;setOuverts(v=>v[g.titre]===ouvert?v:{...v,[g.titre]:ouvert});
   }}><summary><span><strong>{g.titre}</strong><small>{g.resume}</small></span>{restant>0&&<span className={styles.restant}>{restant} à compléter</span>}<ChevronDown size={17} aria-hidden="true"/></summary>{champs}</details>:<div key={g.titre} id={g.ancre} hidden={!actif}>{champs}</div>;
  })}
  {["loyer","clauses"].includes(etape)&&<AvertissementsLoyer avertissements={!modifie&&retourEtape===etape&&etat.avertissements?etat.avertissements:avertissementsCoherenceLoyer({...valeurs,encadrement_loyer:valeurs.encadrement_loyer==="true",chambre_id:valeurs.type==="colocation_individuelle"?valeurs.chambre_id:null},surfaceHabitable)} enregistre={!modifie&&retourEtape===etape&&Boolean(etat.succes)} />}
  {retourEtape===etape&&etat.erreur&&<p role="alert" tabIndex={-1} className="text-sm text-destructive">{etat.erreur}</p>}
  {retourEtape===etape&&etat.succes&&!modifie&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
 </form>;
}
