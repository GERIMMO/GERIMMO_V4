"use client";
import { useRouter } from "next/navigation";
import { EtapesFacture } from "./etapes-facture";
import consoStyles from "./consommations.module.css";
import { useParcoursDepense } from "./parcours-depense";
import { flushSync } from "react-dom";
import { useId, useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { ajouterDepenseSimple } from "@/app/actions/depense-simple";
import { proposerLectureDocument } from "@/app/actions/lecture-document";
import type { EtatConsommations } from "@/app/actions/consommations";
import { CATEGORIES_FOURNITURE } from "@/lib/consommations";
import { contexteDepenseSimple, natureFournisseur, valeursLectureFacture } from "@/lib/contexte-depense-simple";
import { FormulairesConsommations, FicheFactureFourniture, type Props } from "./consommations-formulaires";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import styles from "./depenses-simplifiees.module.css";

export function DepensesSimplifiees(p: Props & { masquerVide?: boolean }) {
  const [ouvert,setOuvert] = useState(false);
  const {facture:factureActive,selectionner:setFactureActive}=useParcoursDepense();
  const contrats = new Map(p.contrats.map(c=>[c.id,c]));
  return <div className={styles.bloc} data-sans-facture={p.masquerVide && !p.factures.length && !ouvert}>
    <div className={styles.intro}>{!p.lectureSeule && !ouvert && <a className="btn-or" href={`${p.base}/parc/${p.bienId}?decompte=nouvelle${p.lotId ? `&lot=${p.lotId}` : ""}`}><Plus size={16} aria-hidden="true"/>Ajouter une facture</a>}</div>
    {ouvert && <Saisie p={p} fermer={(id)=>{setOuvert(false);if(id)setFactureActive(id);}}/>}
    {p.factures.length > 0 ? <ul className={styles.factures}>{p.factures.map(f=>{
      const c=contrats.get(f.contrat_id);if(!c)return null;
      return <li key={f.id}><div className={styles.facture}><div><strong>{c.fournisseur}</strong><span>{CATEGORIES_FOURNITURE[c.categorie]} · {p.repartitions.find(r => r.facture_id === f.id)?.statut === "validee" ? "Répartition validée" : p.repartitions.some(r => r.facture_id === f.id) ? "À vérifier" : "À répartir"}</span></div></div>
        <FicheFactureFourniture key={`${f.id}:${factureActive===f.id}`} p={p} c={c} f={f} repartirDirectement={factureActive===f.id}/>

      </li>;
    })}</ul> : !ouvert && !p.masquerVide && <p className={styles.vide}>Aucune dépense enregistrée pour ce bien.</p>}
    {!p.lotId && <details className={styles.avance}><summary>Réglages des compteurs et abonnements</summary><FormulairesConsommations {...p}/></details>}
  </div>;
}
function Saisie({p,fermer,guide=false}:{p:Props;fermer:(id?:string)=>void;guide?:boolean}) {
  const [etat,action,pending]=useActionStateProtegee(async(etat:EtatConsommations,f:FormData)=>{const resultat=await ajouterDepenseSimple(p.orgId,p.bienId,etat,f);if(resultat.succes)fermer(f.get("suite") === "conserver" ? undefined : resultat.factureId);return resultat},{} as EtatConsommations);
  const form=useRef<HTMLFormElement>(null);
  const fichier=useRef<HTMLInputElement>(null);
  const [lecture,setLecture]=useState(false);
  const [message,setMessage]=useState("");
  const listeFournisseurs=useId();
  const lots=p.lots.filter(l=>l.etat!=="archive");
  const [lotId,setLotId]=useState(p.lotId ?? "");
  const initial=contexteDepenseSimple(p.contrats,lotId||null);
  const [fournisseur,setFournisseur]=useState(initial.fournisseur);
  const [categorie,setCategorie]=useState<keyof typeof CATEGORIES_FOURNITURE|"">(initial.categorie);
  const contexte=contexteDepenseSimple(p.contrats,lotId||null);
  async function lire(){
    if(lecture)return;
    const doc=fichier.current?.files?.[0];if(!doc){setMessage("Choisissez d’abord votre facture.");fichier.current?.focus();return;}
    setLecture(true);setMessage("");
    try{const f=new FormData();f.set("fichier",doc);const r=await proposerLectureDocument(p.orgId,null,f);
      if(r.erreur)setMessage(r.erreur);
      if(r.lecture){
        const proposition=r.lecture;
        const nom=fournisseur || proposition.fournisseur || "";
        const nature=categorie || natureFournisseur(p.contrats.filter(c=>c.lot_id===(lotId||null)),nom) || proposition.categorie || "";
        flushSync(()=>{setFournisseur(nom);setCategorie(nature);});
        for(const [cle,valeur] of Object.entries(valeursLectureFacture(proposition,nature || "teom"))){const champ=form.current?.elements.namedItem(cle);if((champ instanceof HTMLInputElement || champ instanceof HTMLSelectElement) && !champ.value)champ.value=valeur;}
        setMessage(["Informations proposées : vérifiez les montants et la période.",...r.lecture.avertissements].join(" "));
      }
    }catch{setMessage("La lecture n’a pas abouti. Votre facture et votre saisie sont conservées ; vous pouvez compléter les informations directement.");}
    finally{setLecture(false)}
  }
  return <form ref={form} action={action} onReset={e=>e.preventDefault()} data-saisie-confirmee className={styles.formulaire} aria-busy={pending||lecture}>
    <div className={styles.entete}><h4>{guide ? "Facture et informations" : "Ajouter une facture"}</h4><button type="button" disabled={pending||lecture} onClick={()=>fermer()}>Annuler</button></div>
    <label className={styles.depot}><Upload size={22} aria-hidden="true"/><span>Facture ou justificatif</span><input ref={fichier} name="document" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={pending||lecture} onChange={()=>setMessage("")}/></label>
    <button type="button" onClick={lire} disabled={pending||lecture} className={styles.lire}>{lecture ? "Lecture…" : "Préremplir depuis la facture"}</button>
    {message && <p role="status" className={styles.message}>{message}</p>}
    <div className={styles.champs}>
      <label>Fournisseur<input list={listeFournisseurs} name="fournisseur" required maxLength={150} value={fournisseur} placeholder="Nom indiqué sur la facture" onChange={e=>{setMessage("");setFournisseur(e.target.value);setCategorie(natureFournisseur(p.contrats.filter(c=>c.lot_id===(lotId||null)),e.target.value));}} autoComplete="off"/><datalist id={listeFournisseurs}>{contexte.fournisseurs.map(n=><option key={n} value={n}/>)}</datalist></label>
      <label>Nature<select name="categorie" required value={categorie} onChange={e=>{setMessage("");setCategorie(e.target.value as typeof categorie);}}><option value="">Choisir la nature de la dépense</option>{Object.entries(CATEGORIES_FOURNITURE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Montant total<input name="total" inputMode="decimal" required placeholder="0,00 €"/></label>
      {["eau","electricite_commune","electricite_privative","gaz","chauffage"].includes(categorie) && <label>Consommation facturée {categorie==="gaz"?"":categorie==="eau"?"(m³)":"(kWh)"}<input name="consommation" inputMode="decimal" placeholder="Si indiquée sur la facture"/></label>}
      {categorie==="gaz"?<label>Unité de consommation<select name="unite_consommation" defaultValue=""><option value="">À vérifier sur la facture</option><option value="m3">m³</option><option value="kwh">kWh</option></select></label>:<input name="unite_consommation" type="hidden" value={categorie==="eau"?"m3":"kwh"}/>}

      {!p.lotId && lots.length > 0 ? <label>Concerne<select name="lot_id" value={lotId} onChange={e=>{const id=e.target.value;setLotId(id);setCategorie(natureFournisseur(p.contrats.filter(c=>c.lot_id===(id||null)),fournisseur));}}><option value="">Tout le bien / parties communes</option>{lots.map(l=><option key={l.id} value={l.id}>{l.nom}</option>)}</select></label>:<input name="lot_id" type="hidden" value={lotId}/>}
      <label>Début de la période<input name="periode_debut" type="date" required/></label><label>Fin de la période<input name="periode_fin" type="date" required/></label>
    </div>
    {categorie==="teom" && <p className={styles.aide}>Recopiez uniquement le montant de la ligne « taxe d’enlèvement des ordures ménagères » et ses frais de gestion. Le total de l’avis fiscal n’est pas repris automatiquement.</p>}
    <p className={styles.aide}>Les dates de la facture servent à calculer la part de chaque location. Les informations incertaines restent à compléter.</p>
    <details><summary>Référence, abonnement et frais non récupérables</summary><div className={styles.champs}><label>Référence<input name="reference" maxLength={150} placeholder="Reprise du nom du fichier si vide"/></label><label>Abonnement compris dans le total<input name="frais_fixes" inputMode="decimal" placeholder="0,00 €"/></label><label>Frais de gestion non récupérables<input name="frais_gestion" inputMode="decimal" placeholder="0,00 €"/></label></div></details>
    {etat.erreur && <p role="alert" className={styles.erreur}>{etat.erreur}</p>}
    <label><input type="checkbox" name="automatique" defaultChecked/> Gerimmo gère la suite automatiquement</label>
    <p className={styles.aide}>Relevés, répartition et partage des décomptes. Vous intervenez en cas d’anomalie et confirmez vous-même les sommes reçues.</p>
    <div className={consoStyles.piedParcours}>
      {guide && <BoutonEnvoi name="suite" value="conserver" variant="outline" enCours={pending} disabled={lecture}>Enregistrer pour plus tard</BoutonEnvoi>}
      <BoutonEnvoi name="suite" value="repartir" enCours={pending} disabled={lecture} enCoursTexte="Enregistrement…">{guide ? "Enregistrer la facture" : "Enregistrer la dépense"}</BoutonEnvoi></div>
  </form>;
}

export function NouvelleFacture({p}:{p:Props}) {
  const router = useRouter();
  return <section className={consoStyles.pageDecompte}>
    <a href={`${p.base}/parc/${p.bienId}#consommations`}>← Retour au bien</a>
    <h1>Ajouter une facture</h1>{p.bienNom && <p>{p.bienNom}</p>}<EtapesFacture etape={1}/>
    <div id="facture-etape-1"><Saisie p={p} guide fermer={id=>router.push(id ? `${p.base}/parc/${p.bienId}?decompte=${id}` : `${p.base}/parc/${p.bienId}#consommations`)}/></div>
  </section>;
}
