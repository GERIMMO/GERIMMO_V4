"use client";
import { useRouter } from "next/navigation";
import { conseilFacture, methodeConseillee, recuperationConseillee, type BailPourConseil } from "@/lib/conseil-repartition";
import { EnvoiDecomptesFacture, type DestinataireDecompte } from "./envoi-decomptes-facture";
import { EtapesFacture } from "./etapes-facture";
import { SaisieIndexFacture } from "./saisie-index-facture";
import { partsEgalesEnregistrees, type CleFacture } from "@/lib/cle-facture";
import { useEffect, useState, useTransition } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { rouvrirRepartitionFourniture, demanderIndexFacture, preparerRepartitionFourniture, validerRepartitionFourniture, type EtatRepartition } from "@/app/actions/repartition-fourniture";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
import { eur, formaterDate } from "@/lib/ged";
import { csvRepartitionFourniture } from "@/lib/export-repartition-fourniture";
import { Button } from "./ui/button";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { indexDate } from "@/lib/controle-compteur-general";
import { compteursPourFacture, fluideCompatible } from "@/lib/compteurs-facture";
import { CATEGORIES_FOURNITURE, type DemandeReleve, type CompteurConsommation, type ReleveConsommation, type FactureFourniture } from "@/lib/consommations";
import { CircleCheck, ClipboardList, House, Droplets, Coins } from "lucide-react";
import styles from "./consommations.module.css";

export function RepartitionFacture({ pleinePage = false, cles = [], bienId, orgId, base, factureId, existante, lots, lectureSeule, categorie, reglagesPrecedents, baux = [], compteurs = [], releves = [], demandes = [], facture, aujourdhui }: { pleinePage?: boolean; decomptes?: import("@/lib/regularisation-fournitures").EtatLigneDecompte[] | null; cles?: CleFacture[]; bienId: string; orgId: string; base: string; factureId: string; existante?: RepartitionFourniture; lots: { id: string; nom: string }[]; lectureSeule: boolean; categorie: string; reglagesPrecedents?: { mode_interface?: string; colocation?: string | null }; baux?: ({ id: string; nom: string; chambre_id?:string|null } & BailPourConseil)[]; compteurs?: CompteurConsommation[]; releves?: ReleveConsommation[]; demandes?: DemandeReleve[]; facture?: FactureFourniture; ouvertInitialement?: boolean; aujourdhui: string }) {
  const router=useRouter();
  const collecteEnCours=demandes.some(d=>d.statut==="attendue" && compteurs.some(m=>m.id===d.compteur_id && lots.some(l=>l.id===m.lot_id)));
  useEffect(()=>{
    if(!collecteEnCours) return;
    const timer=setInterval(()=>{if(document.visibilityState==="visible") router.refresh();},30000);
    return ()=>clearInterval(timer);
  },[collecteEnCours,router]);
  const [vue, changerVue] = useState(existante?.statut === "validee" ? 4 : existante && facture && JSON.stringify(existante.source?.facture) === JSON.stringify(facture) ? 3 : 2);
  const [rouverte, marquerRouverte] = useState(false);
  const [erreurCorrection, correctionErreur] = useState("");
  const [correction, lancerCorrection] = useTransition();
  const [validee, marquerValidee] = useState(false);
  const [etat, submit, pending] = useActionStateProtegee(async (_: EtatRepartition, form: FormData) => {
    const resultat = await preparerRepartitionFourniture(orgId, factureId, {}, form);
    if (resultat.repartition) changerVue(3);
    return resultat;
  }, {} as EtatRepartition);
  const source = rouverte ? etat.repartition ?? (existante ? {...existante,statut:"brouillon" as const} : undefined) : existante?.statut === "validee" ? existante : etat.repartition ?? existante;
  const r = source && validee ? {...source, statut:"validee" as const} : source;
  const recuperable = !["electricite_privative", "assurance", "internet", "autre"].includes(categorie);
  const reglages = r?.source?.reglages ?? reglagesPrecedents;
  const mesure = ["eau","electricite_commune","gaz","chauffage"].includes(categorie);
  const egales = !!facture && partsEgalesEnregistrees(cles, lots, facture.periode_debut, facture.periode_fin);
  const [mode, changerMode] = useState(reglages?.mode_interface === "egales" && egales ? "egales" : methodeConseillee(categorie,lots,compteurs,facture?.periode_debut ?? aujourdhui,reglages?.mode_interface));
  const relevesManquants = mode === "consommations" && !!facture && lots.some(l=>compteursPourFacture(compteurs,releves,facture,categorie,l.id).length===0);
  const proposition = recuperationConseillee(categorie,lots,baux,facture?.periode_debut ?? aujourdhui,facture?.periode_fin ?? aujourdhui);
  const choixRecuperable = r && r.lignes.some(l=>l.bail_id) && proposition.eligibles>0 ? r.lignes.some(l=>l.recuperable) : proposition.coche;
  const cleApplicable = !facture || lots.length<=1 || cles.some(c=>c.date_effet<=facture.periode_debut && lots.every(l=>c.cle_repartition_lignes.some(v=>v.lot_id===l.id && Number(v.pourcentage)>0)));
  const cleManquante = mode !== "consommations" && !cleApplicable;
  const colocationConcernee=baux.some(b=>b.chambre_id && lots.some(l=>l.id===b.lot_id) && !!b.date_debut && b.date_debut<=(facture?.periode_fin ?? aujourdhui) && (!b.date_fin||b.date_fin>=(facture?.periode_debut ?? aujourdhui)));
  const [modifie, modifier] = useState(false);
  const indexes = new Map((r?.source?.compteurs ?? []).map(m => [`${m.id}/${m.periode_debut}/${m.periode_fin}`, m]));
  const mesures = [...indexes.values()];
  const selonReleves = mesures.length > 0 || r?.source?.mode === "consommations";
  const unite = mesures[0]?.unite;
  const quantite = (n: number, u: string) => `${n.toLocaleString("fr-FR", {maximumFractionDigits: 3})} ${u === "m3" ? "m³" : u}`;
  const poidsTotal = r?.lignes.reduce((total, ligne) => total + Number(ligne.poids), 0) ?? 0;
  const destinataires = [...new Map((r?.lignes ?? []).filter(l=>l.recuperable && l.bail_id).map(l=>{

    const d: DestinataireDecompte = {bail:l.bail_id!, nom:baux.find(b=>b.id===l.bail_id)?.nom ?? "Locataire", logement:lots.find(x=>x.id===l.lot_id)?.nom ?? "Logement"};
    return [d.bail, d];
  })).values()];
  const consommationTotale = unite && mesures.every(m=>m.unite===unite) ? quantite(mesures.reduce((s,m)=>s+m.fin-m.debut,0),unite) : "—";
  const methode = selonReleves ? "Consommations réelles" : r?.source?.reglages?.mode_interface === "egales" ? "Parts égales" : "Clé de répartition";
  if (!pleinePage) return <a className={styles.lienDecompte} href={`${base}/parc/${bienId}?decompte=${factureId}`}>{r?.statut === "validee" ? "Voir le décompte validé" : "Répartir cette facture"}</a>;
  return <div className={styles.list}>
    <EtapesFacture etape={vue}/>
    {erreurCorrection && <p role="alert" className={styles.error}>{erreurCorrection}</p>}
    {vue === 2 && facture && <section id="facture-etape-1" className={styles.factureDeposee}><h2>1 · Facture déposée</h2><div className={styles.line}><strong>{facture.reference}</strong><strong>{eur(Number(facture.total_cents)/100)}</strong></div><p>{formaterDate(facture.periode_debut)} – {formaterDate(facture.periode_fin)}</p>{facture.consommation!=null && <p>Consommation facturée · {Number(facture.consommation).toLocaleString("fr-FR")} {facture.unite_consommation==="m3"?"m³":facture.unite_consommation}</p>}</section>}
      {!lectureSeule && r?.statut !== "validee" && vue === 2 && <form data-saisie-confirmee action={form => { modifier(false); submit(form); }} onChange={() => modifier(true)} onReset={e => e.preventDefault()} id="facture-etape-2" className={styles.form}>
        <h2>Répartition conseillée par Gerimmo</h2>
        <p className={styles.muted}>{lots.length===1 ? "Cette facture concerne un seul logement : sa part est calculée selon les périodes d’occupation, sans exiger de compteur divisionnaire." : mode==="consommations" ? "Les compteurs individuels permettent une répartition selon la consommation. Les index déjà connus sont repris ; complétez seulement les dates manquantes." : "Gerimmo reprend la clé du bâtiment ou votre méthode précédente. Vous pouvez changer de méthode si les relevés et le bail le permettent."}</p>
        {facture?.periode_debut===facture?.periode_fin && <p className={styles.muted}>La période saisie couvre une seule journée. Vérifiez les dates indiquées sur votre facture.</p>}
        <fieldset className={styles.choixMethodes}><legend className="sr-only">Méthode de répartition</legend>
          {[
            { id: "cle", titre: lots.length === 1 ? "Logement concerné" : "Clé enregistrée", detail: lots.length === 1 ? "Selon les périodes d’occupation" : "Selon les quotes-parts du bien", visible: true },
            { id: "consommations", titre: "Consommations réelles", detail: "Selon les index des compteurs", visible: mesure },
            { id: "egales", titre: "Parts égales", detail: "Prévues par la clé enregistrée", visible: egales },
          ].filter(x => x.visible).map(x => <label key={x.id}><input type="radio" name="mode" value={x.id} checked={mode === x.id} onChange={() => changerMode(x.id)} /><span><strong>{x.titre}</strong><small>{x.detail}</small></span></label>)}
        </fieldset>
        {mode === "consommations" && facture && <section><h3>Relevés des compteurs</h3><p>Le calcul réel exige les index aux dates de la facture. Sans ces relevés, la facture reste enregistrée : saisissez les index manquants ou demandez-les au locataire.</p>
          <div className={styles.tableDefile}><table className={styles.tableCalcul}><thead><tr><th>Logement</th><th>Index début<small>{formaterDate(facture.periode_debut)}</small></th><th>Index fin<small>{formaterDate(facture.periode_fin)}</small></th><th>Consommation</th></tr></thead>
          <tbody>{lots.map(lot => {
            const disponibles = compteursPourFacture(compteurs, releves, facture, categorie, lot.id);
            const compteur = disponibles.length === 1 ? disponibles[0] : undefined;
            const debut = compteur ? indexDate(compteur, releves, facture.periode_debut) : null;
            const fin = compteur ? indexDate(compteur, releves, facture.periode_fin) : null;
            return <tr key={lot.id}><th scope="row"><House className={styles.iconeLogement} aria-hidden="true"/>{lot.nom}
              {!disponibles.length && <small>{compteurs.some(m=>m.lot_id===lot.id && fluideCompatible(m.type,categorie)) ? "Relevés de la période à compléter" : "Aucun compteur compatible rattaché"}</small>}
              {disponibles.length > 1 && <label>Compteur utilisé<select name={`compteur_${lot.id}`} required defaultValue=""><option value="">Choisir le compteur facturé</option>{disponibles.map(m => <option key={m.id} value={m.id}>{m.libelle} {m.numero}</option>)}</select></label>}
              {!disponibles.length && <details open><summary>Compléter les données manquantes</summary>
                {!compteurs.some(m=>m.lot_id===lot.id && fluideCompatible(m.type,categorie)) && <p>Ajoutez d’abord le compteur de ce logement. Pour une facture individuelle, la méthode « Logement concerné » ne nécessite pas de compteur divisionnaire.</p>}
                {compteurs.filter(m=>m.lot_id===lot.id && fluideCompatible(m.type,categorie)).map(m=>
                  [...new Set([facture.periode_debut,facture.periode_fin])].filter(j=>j>=m.date_index_initial && indexDate(m,releves,j)==null).map(j=>
                    <div key={m.id+j}>{m.libelle} · {formaterDate(j)}<SaisieIndexFacture org={orgId} bien={bienId} compteur={m.id} jour={j} unite={m.unite} max={aujourdhui}/>
                      {j<=aujourdhui && !releves.some(r=>r.compteur_id===m.id && r.date_releve>=j) && <DemandeIndex org={orgId} facture={factureId} compteur={m.id} jour={j} demande={demandes.find(d=>d.compteur_id===m.id && d.echeance===j && d.statut==="attendue")}/>}
                    </div>))}
                <a href={`${base}/parc/${bienId}/lots/${lot.id}#compteurs-lot`}>Gérer les compteurs du logement</a></details>}
              </th><td>{debut==null?"—":Number(debut).toLocaleString("fr-FR")}</td><td>{fin==null?"—":Number(fin).toLocaleString("fr-FR")}</td>
              <td>{compteur && debut!=null && fin!=null ? <span className={styles.recuperable}>{quantite(Number(fin)-Number(debut),compteur.unite)}</span> : "À vérifier"}</td></tr>;
          })}</tbody></table></div>
        </section>}
        {colocationConcernee && <details open={!reglages?.colocation}><summary>Colocation à plusieurs baux</summary><label>Répartition entre chambres<select name="colocation" defaultValue={reglages?.colocation ?? ""}><option value="">À préciser si concerné</option><option value="egales">Parts égales par chambre</option><option value="surfaces">Surface des chambres</option></select></label></details>}
        {reglagesPrecedents && !r && <p className={styles.caption}>La méthode de la facture précédente est reprise. Vérifiez qu’elle convient à cette période.</p>}
        <aside className={styles.muted} aria-label="Conseil Gerimmo">
          <strong>Conseil Gerimmo · {CATEGORIES_FOURNITURE[categorie as keyof typeof CATEGORIES_FOURNITURE] ?? "Nature à préciser"}</strong>
          <p>{conseilFacture(categorie)}</p>
          {recuperable && <p>Le calcul tient compte de l’occupation et du mode de charges du bail. Aucun complément pour les charges couvertes par un forfait ; les provisions seront déduites lors de la régularisation.</p>}
          <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F947" target="_blank" rel="noreferrer">Règles des charges récupérables · baux d’habitation</a>
        </aside>
        <p role="status" className={styles.caption}>{proposition.motif}</p>
        {recuperable ? <label className="!flex flex-row items-start gap-2"><input name="recuperable" type="checkbox" className="mt-1" defaultChecked={choixRecuperable} />Inclure la part récupérable dans les charges des locataires.</label> : <p className={styles.muted}>Cette dépense reste au propriétaire.</p>}
        <p className={styles.caption}>Les dates des baux sont reprises pour calculer l’occupation. Les logements vacants, les forfaits et les frais de gestion restent à votre charge.</p>
        {cleManquante && <p role="status" className={styles.muted}>La clé du bâtiment doit être renseignée pour cette période. <a href={`${base}/parc/${bienId}`}>Compléter la clé du bâtiment</a>. Aucune part n’est inventée.</p>}
        {relevesManquants && <p role="status" className={styles.muted}>Complétez les données indiquées ci-dessus pour activer le calcul réel. Votre facture est déjà enregistrée.</p>}
        {etat.erreur && <p className={styles.error} role="alert">{etat.erreur}</p>}
        <div className={styles.piedParcours}><a href={`${base}/parc/${bienId}#consommations`}>← Retour aux factures</a><BoutonEnvoi enCours={pending} disabled={relevesManquants || cleManquante} enCoursTexte="Calcul…">Calculer la répartition →</BoutonEnvoi></div>
      </form>}
      {(vue === 3 || vue === 4) && r && (!modifie || r.statut === "validee") && !pending && !etat.erreur && <div id="facture-etape-3" className={styles.invoice}><div className={styles.resumeCalcul} data-valide={r.statut === "validee"}>
          <div><CircleCheck aria-hidden="true"/><span><strong>{r.statut === "validee" ? "Répartition validée" : "Calcul à vérifier"}</strong><small>{r.statut === "validee" ? "Vous pouvez partager le détail de cette facture avec les locataires." : "Vérifiez les montants avant de confirmer la répartition."}</small></span></div>
          <span>À votre charge · <strong>{eur(Number(r.total_proprietaire_cents)/100)}</strong></span>
        </div>
        <dl className={styles.indicateursFacture}>
          <div><ClipboardList/><dt>Montant de la facture</dt><dd>{eur((Number(r.total_recuperable_cents)+Number(r.total_proprietaire_cents))/100)}</dd></div>
          <div><Droplets/><dt>Consommation totale</dt><dd>{consommationTotale}</dd></div>
          <div><House/><dt>Logements concernés</dt><dd>{new Set(r.lignes.map(l=>l.lot_id)).size}</dd></div>
          <div><Coins/><dt>Montant récupérable</dt><dd>{eur(Number(r.total_recuperable_cents)/100)}</dd></div>
        </dl>
        {r.lignes.every(l=>!l.bail_id) && <p className={styles.muted}><strong>Pourquoi à votre charge ?</strong> Aucun bail ne couvre la période saisie pour les logements concernés. Vérifiez les dates de la facture et l’occupation du logement avant de répartir.</p>}
        <h2>Répartition par logement</h2>
        <div className={styles.tableDefile}><table className={styles.tableCalcul}><caption>Répartition par logement</caption>
          <thead><tr><th>Logement</th><th>{selonReleves ? "Relevé (index)" : "Clé"}</th>{selonReleves && <th>Consommation</th>}<th>Part calculée</th><th>Récupérable</th></tr></thead>
          <tbody>{r.lignes.map((l,i)=>{
            const index = indexes.get(`${l.compteur_id}/${l.periode_debut}/${l.periode_fin}`);
            return <tr key={i}><th scope="row"><House aria-hidden="true" className={styles.iconeLogement}/>{lots.find(x=>x.id===l.lot_id)?.nom ?? "Logement"}
              <small>{l.bail_id ? baux.find(b=>b.id===l.bail_id)?.nom ?? "Bail concerné" : "Vacant"}</small>
              {(l.periode_debut !== facture?.periode_debut || l.periode_fin !== facture?.periode_fin) && l.periode_debut && l.periode_fin && <small>{formaterDate(l.periode_debut)} – {formaterDate(l.periode_fin)}</small>}</th>
              <td>{selonReleves ? (index ? `${index.debut} → ${index.fin}` : "—") : poidsTotal ? (100*Number(l.poids)/poidsTotal).toLocaleString("fr-FR",{maximumFractionDigits:2})+" %" : "—"}</td>
              {selonReleves && <td>{index ? quantite(index.fin-index.debut, index.unite) : "—"}{index && r.lignes.some((autre,j)=>j!==i && autre.compteur_id===l.compteur_id && autre.periode_debut===l.periode_debut && autre.periode_fin===l.periode_fin) && <small>Compteur partagé</small>}</td>}
              <td>{eur(l.montant_cents/100)}{Number(l.fixe_cents)>0 && <small>dont {eur(Number(l.fixe_cents)/100)} fixes</small>}</td>
              <td><span className={l.recuperable ? styles.recuperable : undefined}>{eur(l.recuperable ? l.montant_cents/100 : 0)}</span>
                {!l.recuperable && Number(l.montant_cents)>0 && <small>{!l.bail_id
                  ? "À votre charge : aucun locataire sur cette période."
                  : baux.find(b=>b.id===l.bail_id)?.mode_charges === "forfait"
                    ? "Charges incluses dans le forfait : aucun supplément à réclamer au locataire."
                    : "Part non récupérée selon les réglages de cette facture et du bail."}</small>}
              </td>
              </tr>;
          })}</tbody><tfoot><tr><th scope="row" colSpan={2}>Total</th>
            {selonReleves && <td>{unite && mesures.every(m=>m.unite===unite) ? quantite(mesures.reduce((s,m)=>s+m.fin-m.debut,0),unite) : "—"}</td>}
            <td>{eur(r.lignes.reduce((s,l)=>s+Number(l.montant_cents),0)/100)}</td><td><span className={styles.recuperable}>{eur(Number(r.total_recuperable_cents)/100)}</span></td></tr></tfoot></table></div>
        {Number(r.source?.ecart_non_reparti_cents) > 0 && <p className={styles.muted}>Écart du compteur général conservé à votre charge : {eur(Number(r.source?.ecart_non_reparti_cents) / 100)}.</p>}
        {Number(r.source?.frais_gestion_cents) > 0 && <p className={styles.muted}>Frais de gestion conservés à votre charge : {eur(Number(r.source?.frais_gestion_cents) / 100)}.</p>}
        <div className={styles.detailsCalcul}>
          <section><h3>Méthode de calcul</h3><strong>{methode}</strong><details><summary>Voir le détail</summary><p>{r.motif}</p></details></section>
          <section><h3>Détails du décompte</h3><p>✓ Parts par logement et périodes d’occupation</p><p>✓ Parts locataires et propriétaire distinguées</p><p>Les provisions seront déduites dans le décompte annuel.</p></section>
        </div>

        {!lectureSeule && r.statut !== "validee" && <Validation key={r.empreinte} orgId={orgId} r={r} terminer={()=>{marquerValidee(true);changerVue(destinataires.length ? 5 : 4);}} retour={()=>changerVue(2)} />}
        {r.statut === "validee" && <div className={styles.piedParcours}>
          <a href={`${base}/parc/${bienId}#consommations`}>← Retour au bien</a>
          {!lectureSeule && <Button variant="outline" disabled={correction} onClick={()=>lancerCorrection(async()=>{let res:EtatRepartition;try{res=await rouvrirRepartitionFourniture(orgId,r.id);}catch{correctionErreur("La page a été actualisée. Rechargez puis réessayez ; la facture est conservée.");return;}if(res.erreur){correctionErreur(res.erreur);return;}marquerRouverte(true);marquerValidee(false);modifier(true);changerVue(2);})}>{correction?"Ouverture…":"Corriger la répartition"}</Button>}
          <Button variant="outline" onClick={()=>telecharger(r,lots)}>Exporter le calcul (CSV)</Button>
          {!lectureSeule && destinataires.length > 0 && <Button onClick={()=>changerVue(5)}>Décomptes et envoi ({destinataires.length}) →</Button>}
        </div>}
      </div>}
      {vue === 5 && r?.statut === "validee" && !lectureSeule && <><Button variant="outline" onClick={()=>changerVue(4)}>← Retour au calcul validé</Button><EnvoiDecomptesFacture org={orgId} base={base} repartitionId={r.id} destinataires={destinataires}/></>}
      {lectureSeule && !r && <p className={styles.muted}>Aucun décompte n’a été préparé.</p>}
  </div>;
}
function Validation({ orgId, r, terminer, retour }: { orgId: string; r: RepartitionFourniture; terminer:()=>void; retour:()=>void }) {
  const [etat, submit, pending] = useActionStateProtegee(async (_:EtatRepartition,f:FormData)=>{const resultat=await validerRepartitionFourniture(orgId,r.id,{},f);if(resultat.succes) terminer();return resultat;}, {} as EtatRepartition);
  return etat.succes ? <p role="status" className={styles.ok}>{etat.succes}</p> : <form data-saisie-confirmee action={submit} className={styles.form}>
    <input type="hidden" name="empreinte" value={r.empreinte} />
    <input type="hidden" name="confirme" value="on" />
    {etat.erreur && <p role="alert" className={styles.error}>{etat.erreur}</p>}<div className={styles.piedParcours}><Button type="button" variant="outline" disabled={pending} onClick={retour}>← Modifier la méthode</Button><BoutonEnvoi enCours={pending} enCoursTexte="Validation…">Valider et continuer</BoutonEnvoi></div>
  </form>;
}
function telecharger(r: RepartitionFourniture, lots: { id: string; nom: string }[]) {
  const url = URL.createObjectURL(new Blob([csvRepartitionFourniture(r, lots)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "decompte-charges.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DemandeIndex({org,facture,compteur,jour,demande}:{org:string;facture:string;compteur:string;jour:string;demande?:DemandeReleve}) {
  const [etat,maj]=useState<EtatRepartition>({});
  const [enCours,lancer]=useTransition();
  return etat.succes || demande ? <p role="status">{etat.succes ?? "Relevé demandé au locataire · en attente. Rappels à J+3, J+7 et J+14."}</p> : <>
    <Button type="button" variant="outline" size="sm" disabled={enCours} onClick={()=>lancer(async()=>maj(await demanderIndexFacture(org,facture,compteur,jour)))}>Demander le relevé au locataire</Button>
    {etat.erreur && <p role="alert">{etat.erreur}</p>}</>;
}
