"use client";
import { useContext, useState } from "react";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { modifierEtapeBail } from "@/app/actions/etapes-bail";
import type { EtatBail } from "@/app/actions/baux";
import { type EtapeSaisieBail, type ValeursParcoursBail } from "@/lib/champs-etape-bail";
import { Input } from "@/components/ui/input";
import { LabelBail as Label } from "@/components/pastille-bail";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

type Champ = { nom:string; titre:string; type?:"number"|"date"|"textarea"; options?:[string,string][]; requis?:boolean; aide?:string; visible?:(v:Record<string,string>)=>boolean; min?:number; max?:number; entier?:boolean };
type Groupe = { etapes:string[]; titre:string; aide?:string; agence?:boolean; champs:Champ[] };
const ouiNon:[string,string][]=[["","À confirmer"],["true","Oui"],["false","Non"]];
const choix:[string,string][]=[["true","Oui"],["false","Non"]];
const recent=(v:Record<string,string>)=>v.precedente_location==="recente";
const groupes:Groupe[]=[
 {etapes:["bail"],titre:"Le contrat",champs:[
  {nom:"type",titre:"Type de bail",requis:true,options:[["nu","Location nue"],["meuble","Location meublée"],["colocation","Colocation · contrat commun"],["colocation_individuelle","Colocation · contrat individuel"]]},
  {nom:"chambre_id",titre:"Chambre privative",requis:true,visible:v=>v.type==="colocation_individuelle"},
  {nom:"date_debut",titre:"Date d’entrée",type:"date",requis:true},
  {nom:"date_conclusion_prevue",titre:"Date prévue de conclusion",type:"date",aide:"La date prévue sur le contrat ; elle ne vaut pas signature."},
  {nom:"meuble_etudiant",titre:"Bail étudiant de 9 mois — Facultatif",options:choix,visible:v=>v.type==="meuble"||((v.type==="colocation"||v.type==="colocation_individuelle")&&v.logement_meuble==="true")},
 ]},
 {etapes:["loyer"],titre:"Échéance mensuelle",champs:[{nom:"jour_echeance",titre:"Jour d’échéance du loyer",type:"number",requis:true,min:1,max:28,entier:true,aide:"Jour du mois auquel le loyer est dû, entre 1 et 28."}]},
 {etapes:["loyer"],titre:"La précédente location",champs:[
  {nom:"precedente_location",titre:"Situation du logement",options:[["","À confirmer"],["premiere","Première location"],["ancienne","Ancien locataire parti depuis au moins 18 mois"],["recente","Ancien locataire parti depuis moins de 18 mois"]]},
  {nom:"dernier_loyer",titre:"Précédent loyer hors charges (€)",type:"number",visible:recent},
  {nom:"dernier_loyer_versement",titre:"Date du dernier versement",type:"date",visible:recent},
  {nom:"precedent_loyer_revise",titre:"Ce loyer a-t-il été révisé ?",options:ouiNon,visible:recent},
  {nom:"dernier_loyer_revision",titre:"Date de la dernière révision",type:"date",visible:v=>recent(v)&&v.precedent_loyer_revise==="true"},
 ]},
 {etapes:["loyer"],titre:"Les montants du nouveau bail",aide:"Saisissez 0 lorsqu’un montant est nul.",champs:[
  {nom:"loyer_hc",titre:"Loyer hors charges (€)",type:"number",requis:true},
  {nom:"charges",titre:"Charges mensuelles (€)",type:"number",requis:true},
  {nom:"depot_garantie",titre:"Dépôt de garantie (€)",type:"number",requis:true,aide:"Le plafond est vérifié selon le type de bail et le caractère meublé du logement."},
  {nom:"charges_mode",titre:"Mode de charges",options:[["provision","Provision avec régularisation annuelle"],["forfait","Forfait sans régularisation"]]},
 ]},
 {etapes:["loyer"],titre:"La révision et le paiement",champs:[
  {nom:"revision_irl",titre:"Révision annuelle du loyer (IRL) — Facultatif",options:choix},
  {nom:"irl_trimestre",titre:"Trimestre IRL",options:[["","À confirmer"],["T1","T1"],["T2","T2"],["T3","T3"],["T4","T4"]],visible:v=>v.revision_irl==="true"},
  {nom:"irl_valeur",titre:"Valeur de l’IRL de référence",type:"number",visible:v=>v.revision_irl==="true"},
  {nom:"fixation_loyer",titre:"Fixation initiale du loyer",options:[["","À confirmer"],["libre","Librement fixé"],["plafonnement","Plafonnement en zone d’encadrement"],["reevaluation","Réévaluation après travaux"]]},
  {nom:"paiement_echeance",titre:"Paiement du loyer",options:[["echoir","À échoir (d’avance)"],["echu","À terme échu"]]},
  {nom:"lieu_paiement",titre:"Lieu ou modalités de paiement",aide:"Exemple : virement au bailleur."},
 ]},
 {etapes:["loyer"],titre:"Les honoraires",agence:true,aide:"À renseigner pour une location gérée par une agence. Indiquez 0 si aucun honoraire n’est facturé.",champs:[
  {nom:"zone_honoraires",titre:"Zone des honoraires",options:[["","À confirmer"],["tres_tendue","Très tendue"],["tendue","Tendue"],["autre","Autre zone"]]},
  {nom:"honoraires_bailleur",titre:"Visite, dossier, bail — bailleur (€ TTC)",type:"number"},
  {nom:"honoraires_locataire",titre:"Visite, dossier, bail — locataire (€ TTC)",type:"number"},
  {nom:"honoraires_edl_bailleur",titre:"État des lieux — bailleur (€ TTC)",type:"number"},
  {nom:"honoraires_edl_locataire",titre:"État des lieux — locataire (€ TTC)",type:"number"},
 ]},
 {etapes:["documents"],titre:"Les informations du DPE",aide:"Recopiez ces trois informations depuis votre DPE. Les rapports déjà déposés sont repris ci-dessous.",champs:[
  {nom:"dpe_depenses_min",titre:"Dépenses annuelles minimales (€)",type:"number"},
  {nom:"dpe_depenses_max",titre:"Dépenses annuelles maximales (€)",type:"number"},
  {nom:"dpe_annees_reference",titre:"Année(s) des prix de l’énergie",aide:"Par exemple : 2021, 2022 et 2023, selon le DPE."},
 ]},
 {etapes:["clauses"],titre:"Les règles locales",champs:[
  {nom:"encadrement_loyer",titre:"Loyers de référence imposés par arrêté local",options:ouiNon,aide:"Une zone tendue n’est pas nécessairement soumise aux loyers de référence."},
  {nom:"loyer_reference",titre:"Loyer de référence (€/m²)",type:"number",visible:v=>v.encadrement_loyer==="true"},
  {nom:"loyer_reference_majore",titre:"Loyer de référence majoré (€/m²)",type:"number",visible:v=>v.encadrement_loyer==="true"},
  {nom:"complement_loyer",titre:"Complément de loyer (€) — Facultatif",type:"number",visible:v=>v.encadrement_loyer==="true"},
  {nom:"complement_justification",titre:"Justification du complément",visible:v=>v.encadrement_loyer==="true"&&Number(v.complement_loyer)>0,aide:"À préciser si un complément est appliqué."},
  {nom:"servitude_residence_principale",titre:"Servitude de résidence principale",options:ouiNon,aide:"À vérifier dans les règles d’urbanisme applicables au logement."},
 ]},
 {etapes:["clauses"],titre:"Les clauses de résiliation",champs:[
  {nom:"clause_resolutoire_assurance",titre:"Défaut d’assurance — Clause facultative",options:choix},
  {nom:"clause_resolutoire_troubles",titre:"Troubles de voisinage jugés — Clause facultative",options:choix},
  {nom:"clause_resolutoire_servitude",titre:"Non-respect de la servitude — Clause facultative",options:choix,visible:v=>v.servitude_residence_principale==="true"},
  {nom:"duree_reduite_evenement",titre:"Événement justifiant une durée réduite — Facultatif",aide:"À préciser seulement si le régime du bail permet une durée réduite."},
 ]},
 {etapes:["clauses"],titre:"Les travaux et les autres accords",champs:[
  {nom:"travaux_recents",titre:"Travaux récents du bailleur — Facultatif",type:"textarea"},
  {nom:"travaux_recents_montant",titre:"Montant de ces travaux (€)",type:"number",visible:v=>Boolean(v.travaux_recents.trim()),aide:"À renseigner si des travaux sont indiqués."},
  {nom:"travaux_locataire",titre:"Travaux à la charge du locataire — Facultatif",type:"textarea"},
  {nom:"clauses_particulieres",titre:"Clauses particulières — Facultatif",type:"textarea"},
 ]},
];

export function FormulaireParcoursBail({orgId,bailId,defauts,agence,meuble,chambres}:{orgId:string;bailId:string;defauts:ValeursParcoursBail;agence:boolean;meuble:boolean;chambres:{id:string;nom:string}[]}) {
 const parcours=useContext(EtapeComplementsBail);
 const etape=parcours?.etape??"bail";
 const [valeurs,setValeurs]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries({...defauts,type:defauts.chambre_id?"colocation_individuelle":defauts.type,logement_meuble:meuble,revision_irl:defauts.revision_irl??false,meuble_etudiant:defauts.meuble_etudiant??false,clause_resolutoire_assurance:defauts.clause_resolutoire_assurance??true,clause_resolutoire_troubles:defauts.clause_resolutoire_troubles??true,clause_resolutoire_servitude:defauts.clause_resolutoire_servitude??false}).map(([k,v])=>[k,v==null?"":String(v)])));
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
   if(res.succes){setModifie(false);if(form.get("continuer")==="1")parcours?.ouvrir(({bail:"personnes",loyer:"documents",documents:"clauses",clauses:"recapitulatif"})[active]);}
   return res;
 });
 const visible=["bail","loyer","documents","clauses"].includes(etape);
 return <form id="form-parcours-bail" hidden={!visible} onSubmit={soumettre} className="bail-formulaire-etape space-y-5" onChange={()=>setModifie(true)}>
  {groupes.filter(g=>!g.agence||agence).map(g=><fieldset key={g.titre} id={g.etapes[0]==="documents"?"complements-energie":undefined} hidden={!g.etapes.includes(etape)} disabled={!g.etapes.includes(etape)||enCours} className="bail-groupe-champs">
   <legend className="text-base font-semibold">{g.titre}</legend>
   {g.aide&&<p className="mb-3 text-sm text-muted-foreground">{g.aide}</p>}
   <div className={`grid gap-4 ${g.etapes[0]==="documents"?"sm:grid-cols-3":"sm:grid-cols-2"}`}>{g.champs.map(c=>{
    const id=`parcours-${c.nom}`,affiche=!c.visible||c.visible({...valeurs,logement_meuble:String(meuble)});
    const opts=c.nom==="chambre_id"?[["","Choisir une chambre"],...chambres.map(ch=>[ch.id,ch.nom])] as [string,string][]:c.options;
    return <div key={c.nom} hidden={!affiche} className={c.type==="textarea"?"space-y-1.5 sm:col-span-2":"space-y-1.5"}>
     <Label htmlFor={id} champ={`bail.${c.nom}`} renseigne={Boolean(valeurs[c.nom]?.trim())}>{c.titre}{c.requis||!/facultati[fv]/i.test(c.titre)?" *":""}</Label>
     {opts?<select id={id} name={c.nom} value={valeurs[c.nom]??""} required={c.requis&&affiche} disabled={!affiche} onChange={e=>setValeurs(v=>({...v,[c.nom]:e.target.value}))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{opts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      :c.type==="textarea"?<textarea id={id} name={c.nom} value={valeurs[c.nom]??""} rows={3} maxLength={c.nom==="clauses_particulieres"?4000:2000} onChange={e=>setValeurs(v=>({...v,[c.nom]:e.target.value}))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"/>
      :<Input id={id} name={c.nom} type={c.type??"text"} disabled={!affiche} value={valeurs[c.nom]??""} required={c.requis&&affiche} min={c.type==="number"?(c.min??0):undefined} max={c.max} step={c.type==="number"?(c.entier?1:"0.01"):undefined} maxLength={c.nom==="dpe_annees_reference"?100:500} onChange={e=>setValeurs(v=>({...v,[c.nom]:e.target.value}))}/>}
     {c.aide&&<p className="text-xs text-muted-foreground">{c.aide}</p>}
    </div>;
   })}</div>
  </fieldset>)}
  {retourEtape===etape&&etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
  {retourEtape===etape&&etat.succes&&!modifie&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…">{etape==="documents"?"Enregistrer les informations du DPE":"Enregistrer cette étape"}</BoutonEnvoi>
 </form>;
}
