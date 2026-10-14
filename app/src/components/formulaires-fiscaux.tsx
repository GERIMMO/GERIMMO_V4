"use client";
import { useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import {qualifierPieceFiscale,enregistrerExerciceFiscal,retrouverVentilation} from '@/app/actions/fiscalite';
import {RUBRIQUES_FISCALES,PHRASE_FONDS_TRAVAUX_CHOIX_NON_APPLIQUE,estFondsTravauxAlur,rubriqueDe,type EcritureFiscale,type QualificationFiscale,type ComposantesFiscales,type ExerciceFiscalLot,type PeriodeFiscale} from '@/lib/fiscal';
import {eur} from '@/lib/ged';
const champ='min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm';
const Etat=({etat}:{etat:{erreur?:string;succes?:string}})=><>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm">{etat.succes}</p>}</>;
// `capture` : la ventilation déjà figée de la pièce. Avec elle, la reprise n'a plus rien à retrouver (FIN-06) : le bouton ne se propose pas, et ce qui reste
// non ventilé (une avance) se qualifie à la main, avec sa justification.
export function QualificationPiece({orgId,ecriture,qualification,lots,capture}:{orgId:string;ecriture:EcritureFiscale;qualification?:QualificationFiscale;lots:{id:string;nom:string}[];capture?:ComposantesFiscales}){
 const [etat,action,attente]=useActionState(qualifierPieceFiscale.bind(null,orgId,ecriture.id!),{});
 const [reprise,reprendre,enReprise]=useActionState(retrouverVentilation.bind(null,orgId,ecriture.id!),{});
 const [nature,setNature]=useState(qualification?.nature??'a_qualifier');
 const proposition=rubriqueDe(ecriture.categorie,ecriture.sens);
 // D03 (FIN-07) : le classement d'office en fonds de travaux ALUR passe avant la qualification ; on le dit avant et après le choix.
 const alurAuto=ecriture.sens==='depense'&&estFondsTravauxAlur(ecriture.categorie);
 const choixIgnore=alurAuto&&!!qualification&&qualification.nature!=='a_qualifier';
 return <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer text-sm">{ecriture.date_piece} · {ecriture.categorie} · {Number(ecriture.montant).toFixed(2)} € — {qualification?`qualification v${qualification.version}`:'à qualifier'}{alurAuto&&' · rangée d’office en fonds de travaux ALUR'}</summary>
  {alurAuto&&<p role="note" className="my-3 border-l-[3px] border-l-[var(--or)] bg-[var(--or-clair)] p-3 text-sm">{choixIgnore&&<strong>Votre qualification v{qualification!.version} n’est pas appliquée. </strong>}{PHRASE_FONDS_TRAVAUX_CHOIX_NON_APPLIQUE}</p>}
  {capture&&Number(capture.non_ventile)>0&&<p className="my-3 text-sm">La ventilation historique de ce paiement est déjà conservée ; il reste {eur(capture.non_ventile)} non ventilés (avance ou part sans échéance vérifiée). Qualifiez cette pièce ci-dessous, avec sa justification.</p>}
  {ecriture.encaissement_id&&!capture&&<form data-saisie-confirmee action={reprendre} className="my-3 space-y-2"><p className="text-sm">Une ancienne échéance conservée peut démontrer les parts loyer et charges. Les situations ambiguës restent à justifier.</p><button className="btn" disabled={enReprise}>Retrouver la ventilation historique</button><Etat etat={reprise}/></form>}
  <form data-saisie-confirmee action={action} className="grid gap-3 sm:grid-cols-2">
   <label className="text-sm">Lot<select name="lot_id" className={champ} defaultValue={ecriture.lot_id??qualification?.lot_id??''} required><option value="">Choisir le lot</option>{lots.filter(l=>!ecriture.lot_id||l.id===ecriture.lot_id).map(l=><option key={l.id} value={l.id}>{l.nom}</option>)}</select></label>
   <label className="text-sm">Traitement fiscal<select name="nature" className={champ} value={nature} onChange={e=>setNature(e.target.value as typeof nature)}><option value="a_qualifier">À qualifier</option>{ecriture.sens==='recette'?<option value="recette">Recette imposable</option>:<option value="deductible">Dépense déductible vérifiée</option>}<option value="non_deductible">Non déductible</option><option value="hors_2044">Hors revenus fonciers</option></select></label>
   <label className="text-sm">Rubrique<select name="rubrique" className={champ} defaultValue={qualification?.rubrique??''} disabled={!['recette','deductible'].includes(nature)} required={['recette','deductible'].includes(nature)}><option value="">Choisir après vérification</option>{RUBRIQUES_FISCALES.filter(r=>r.sens===ecriture.sens&&!['222','230'].includes(r.code)).map(r=><option key={r.code} value={r.code}>{r.code} — {r.libelle}</option>)}</select></label>
   <p className="self-center text-sm text-muted-foreground">Suggestion indicative : {proposition==='non_deductible'?'non déductible':proposition==='autres'?'aucune':proposition}. Les travaux de construction, reconstruction et agrandissement ne sont pas des réparations déductibles en 224.</p>
   {ecriture.sens==='recette'&&<><label className="text-sm">Part loyer HC historique, si loyer (€)<input className={champ} type="text" inputMode="decimal" name="loyer_hc" defaultValue={qualification?.loyer_hc??''}/></label><label className="text-sm">Part charges historique (€)<input className={champ} type="text" inputMode="decimal" name="charges" defaultValue={qualification?.charges??''}/></label></>}
   <label className="text-sm sm:col-span-2">Justification et référence de pièce<textarea name="justification" className={champ+' py-2'} minLength={3} maxLength={3000} required defaultValue={qualification?.justification??''} placeholder="Facture, paiement effectif, arrêté de comptes, ventilation…"/></label>
   <label className="flex gap-2 text-sm sm:col-span-2"><input type="checkbox" name="confirme" value="oui" required/>J’ai vérifié la pièce, la date effective du paiement et le traitement fiscal choisi.</label>
   <div className="sm:col-span-2"><Etat etat={etat}/><button className="btn-or" disabled={attente}>Conserver cette qualification</button></div>
  </form>
 </details>;
}
export function ExerciceLot({orgId,lot,annee,exercice}:{orgId:string;lot:{id:string;nom:string};annee:number;exercice?:ExerciceFiscalLot}){
 // La part se garde TELLE QUE TAPÉE (texte) : l'action la lit (« 33,5 » vaut 33,5). Un champ type="number" lit « 33,5 » comme 335 quand la langue du navigateur n'est pas le français (VER-TS-02).
 const [periodes,setPeriodes]=useState<(Omit<PeriodeFiscale,'quote_part'>&{quote_part:number|string})[]>(exercice?.periodes??[{debut:`${annee}-01-01`,fin:`${annee}-12-31`,quote_part:100,regime:'nu'}]);
 const [etat,action,attente]=useActionState(enregistrerExerciceFiscal.bind(null,orgId,lot.id,annee),{});
 const changer=(i:number,k:keyof PeriodeFiscale,v:string|number)=>setPeriodes(p=>p.map((x,j)=>j===i?{...x,[k]:v}:x));
 return <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer">{lot.nom} — exercice {annee} {exercice?`confirmé v${exercice.version}`:'à confirmer'}</summary><form data-saisie-confirmee action={action} className="space-y-3">
  <p className="text-sm">Confirmez le régime et vos droits aux dates des pièces. En cas de cession ou changement de régime, ajoutez une période. Les champs proposés ne sont jamais validés automatiquement.</p>
  <input type="hidden" name="periodes" value={JSON.stringify(periodes)}/>
  {periodes.map((p,i)=><div key={i} className="grid gap-2 sm:grid-cols-4"><label className="text-sm">Du<input aria-label={`Début période ${i+1}`} type="date" className={champ} required value={p.debut} onChange={e=>changer(i,'debut',e.target.value)}/></label><label className="text-sm">Au<input aria-label={`Fin période ${i+1}`} type="date" className={champ} required value={p.fin} onChange={e=>changer(i,'fin',e.target.value)}/></label><label className="text-sm">Vos droits (%)<input aria-label={`Quote-part période ${i+1}`} type="text" inputMode="decimal" className={champ} required value={p.quote_part} onChange={e=>changer(i,'quote_part',e.target.value)}/></label><label className="text-sm">Régime<select aria-label={`Régime période ${i+1}`} className={champ} value={p.regime} onChange={e=>changer(i,'regime',e.target.value)}><option value="nu">Location nue</option><option value="meuble">Meublé : hors 2044</option><option value="hors_perimetre">Hors de mes droits</option></select></label>{periodes.length>1&&<button type="button" className="text-sm underline" onClick={()=>setPeriodes(p=>p.filter((_,j)=>i!==j))}>Retirer cette période</button>}</div>)}
  <button type="button" className="btn" onClick={()=>setPeriodes(p=>[...p,{debut:'',fin:'',quote_part:100,regime:'nu'}])} disabled={periodes.length>=24}>Ajouter une période</button>
  <label className="block text-sm">Justification du régime et des droits<textarea name="justification" className={champ+' py-2'} minLength={3} maxLength={3000} required defaultValue={exercice?.justification??''}/></label>
  <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Ligne 230 — montant total à réintégrer (€)<input name="regularisation230" className={champ} type="text" inputMode="decimal" defaultValue={exercice?.regularisation230??''}/></label><label className="text-sm">Vos droits sur cette régularisation (%)<input name="quote_part230" className={champ} type="text" inputMode="decimal" required defaultValue={exercice?.quote_part230??100}/></label></div>
  <p className="text-sm">Régularisation des provisions déduites en {annee-1} d’après le décompte approuvé : parts récupérables, non déductibles et solde positif concernés. Saisissez 0 et justifiez-le s’il n’y a rien à réintégrer. Un champ vide reste « à compléter ». Les versements de {annee} restent intégralement en 229 lorsqu’ils sont éligibles et qualifiés.</p>
  <label className="block text-sm">Pièce et explication de la ligne 230<textarea name="justification230" className={champ+' py-2'} maxLength={3000} defaultValue={exercice?.justification230??''}/></label>
  <label className="flex gap-2 text-sm"><input type="checkbox" name="confirme" value="oui" required/>J’ai vérifié ces périodes, quotes-parts et justificatifs pour cet exercice.</label>
  <Etat etat={etat}/><button className="btn-or" disabled={attente}>Conserver l’exercice</button>
 </form></details>;
}
