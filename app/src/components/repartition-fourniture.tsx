"use client";
import { useState } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { preparerRepartitionFourniture, validerRepartitionFourniture, type EtatRepartition } from "@/app/actions/repartition-fourniture";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
import { eur, formaterDate } from "@/lib/ged";
import { csvRepartitionFourniture } from "@/lib/export-repartition-fourniture";
import { Button } from "./ui/button";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { compteursPourFacture } from "@/lib/compteurs-facture";
import type { CompteurConsommation, ReleveConsommation, FactureFourniture } from "@/lib/consommations";
import styles from "./consommations.module.css";

export function RepartitionFacture({ orgId, base, factureId, existante, lots, lectureSeule, categorie, reglagesPrecedents, baux = [], compteurs = [], releves = [], facture }: { orgId: string; base: string; factureId: string; existante?: RepartitionFourniture; lots: { id: string; nom: string }[]; lectureSeule: boolean; categorie: string; reglagesPrecedents?: { mode_interface?: string; colocation?: string | null }; baux?: { id: string; nom: string }[]; compteurs?: CompteurConsommation[]; releves?: ReleveConsommation[]; facture?: FactureFourniture }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, submit, pending] = useActionStateProtegee(preparerRepartitionFourniture.bind(null, orgId, factureId), {} as EtatRepartition);
  const r = existante?.statut === "validee" ? existante : etat.repartition ?? existante;
  const recuperable = !["electricite_privative", "assurance", "internet", "autre"].includes(categorie);
  const reglages = r?.source?.reglages ?? reglagesPrecedents;
  return <div className={styles.list}><Button type="button" size="sm" variant="outline" onClick={() => setOuvert(!ouvert)}>{r?.statut === "validee" ? "Voir le décompte validé" : "Répartir cette facture"}</Button>
    {ouvert && <>
      {!lectureSeule && r?.statut !== "validee" && <form data-saisie-confirmee action={submit} onReset={e => e.preventDefault()} className={styles.form}>
        <label>Répartition<select name="mode" aria-label="Répartition" defaultValue={reglages?.mode_interface ?? "cle"}><option value="cle">Clé enregistrée du bâtiment</option><option value="consommations">Consommations relevées + clé pour l’abonnement</option><option value="egales">Parts égales entre les logements</option></select></label>
        {facture && lots.map(lot => {
          const candidats = compteursPourFacture(compteurs, releves, facture, categorie, lot.id);
          return candidats.length > 1 ? <label key={lot.id}>Compteur facturé · {lot.nom}<select name={`compteur_${lot.id}`} defaultValue=""><option value="">Choisir pour la répartition par consommation</option>{candidats.map(m => <option key={m.id} value={m.id}>{m.libelle}{m.numero ? ` · ${m.numero}` : ""}{!m.actif ? " · ancien compteur" : ""}</option>)}</select></label> : null;
        })}
        <details open={!!reglages?.colocation}><summary>Colocation à plusieurs baux</summary><label>Répartition entre chambres<select name="colocation" defaultValue={reglages?.colocation ?? ""}><option value="">À préciser si concerné</option><option value="egales">Parts égales par chambre</option><option value="surfaces">Surface des chambres</option></select></label></details>
        {reglagesPrecedents && !r && <p className={styles.caption}>La méthode de la facture précédente est reprise. Vérifiez qu’elle convient à cette période.</p>}
        {recuperable ? <label className="!flex flex-row items-start gap-2"><input name="recuperable" type="checkbox" className="mt-1" />Cette dépense est récupérable auprès des locataires, selon le justificatif.</label> : <p className={styles.muted}>Cette dépense reste au propriétaire.</p>}
        <p className={styles.caption}>Les dates des baux sont reprises pour calculer l’occupation. Les logements vacants, les forfaits et les frais de gestion restent à votre charge.</p>
        {etat.erreur && <p className={styles.error} role="alert">{etat.erreur}</p>}
        <BoutonEnvoi enCours={pending} enCoursTexte="Calcul…">Préparer le décompte</BoutonEnvoi>
      </form>}
      {r && <div className={styles.invoice}><div className={styles.line}><strong>{r.statut === "validee" ? "Décompte validé" : "Décompte à vérifier"}</strong><span className={styles.badge}>Locataires : {eur(Number(r.total_recuperable_cents) / 100)}</span></div>
        <p className={styles.muted}>À votre charge : {eur(Number(r.total_proprietaire_cents) / 100)}</p>
        <ul className={styles.history}>{r.lignes.map((l, i) => <li key={i}><strong>{lots.find(x => x.id === l.lot_id)?.nom ?? "Logement"}</strong> · {eur(Number(l.montant_cents) / 100)} · {l.recuperable ? baux.find(b => b.id === l.bail_id)?.nom ?? "part locataire" : l.bail_id ? "part propriétaire" : "vacance — propriétaire"}
          {(l.variable_cents != null || l.fixe_cents != null) && <p className={styles.caption}>Variable : {eur(Number(l.variable_cents ?? 0) / 100)} · frais fixes : {eur(Number(l.fixe_cents ?? 0) / 100)}</p>}
          {l.periode_debut && l.periode_fin && (l.periode_debut !== r.source?.facture?.periode_debut || l.periode_fin !== r.source?.facture?.periode_fin) && <p className={styles.caption}>Du {formaterDate(l.periode_debut)} au {formaterDate(l.periode_fin)}</p>}
        </li>)}</ul>
        {Number(r.source?.ecart_non_reparti_cents) > 0 && <p className={styles.muted}>Écart du compteur général conservé à votre charge : {eur(Number(r.source?.ecart_non_reparti_cents) / 100)}.</p>}
        {Number(r.source?.frais_gestion_cents) > 0 && <p className={styles.muted}>Frais de gestion conservés à votre charge : {eur(Number(r.source?.frais_gestion_cents) / 100)}.</p>}
        <p className={styles.caption}>Total de la facture : {eur((Number(r.total_recuperable_cents) + Number(r.total_proprietaire_cents)) / 100)}.</p>
        <details className={styles.caption}><summary className="flex min-h-11 cursor-pointer items-center">Méthode de calcul</summary><p>{r.motif}</p></details>
        {!lectureSeule && r.statut !== "validee" && <Validation key={r.empreinte} orgId={orgId} r={r} />}
        {r.statut === "validee" && <><Button type="button" variant="outline" onClick={() => telecharger(r, lots)}>Télécharger le décompte</Button>{!lectureSeule && [...new Set(r.lignes.filter(l => l.recuperable && l.bail_id).map(l => l.bail_id!))].map(id => <a key={id} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href={`${base}/baux/${id}#regularisation-fournitures`}>Préparer la régularisation de {baux.find(b => b.id === id)?.nom ?? "ce bail"} →</a>)}</>}
        <p className={styles.caption}>La régularisation annuelle compare ces charges aux provisions déjà appelées.</p>
      </div>}
      {lectureSeule && !r && <p className={styles.muted}>Aucun décompte n’a été préparé.</p>}
    </>}
  </div>;
}
function Validation({ orgId, r }: { orgId: string; r: RepartitionFourniture }) {
  const [etat, submit, pending] = useActionStateProtegee(validerRepartitionFourniture.bind(null, orgId, r.id), {} as EtatRepartition);
  return etat.succes ? <p role="status" className={styles.ok}>{etat.succes}</p> : <form data-saisie-confirmee action={submit} className={styles.form}>
    <input type="hidden" name="empreinte" value={r.empreinte} />
    <label className="!flex flex-row items-start gap-2"><input type="checkbox" name="confirme" required className="mt-1" />J’ai vérifié les montants, la clé et les périodes.</label>
    {etat.erreur && <p role="alert" className={styles.error}>{etat.erreur}</p>}<BoutonEnvoi enCours={pending} enCoursTexte="Validation…">Valider et conserver ce décompte</BoutonEnvoi>
  </form>;
}
function telecharger(r: RepartitionFourniture, lots: { id: string; nom: string }[]) {
  const url = URL.createObjectURL(new Blob([csvRepartitionFourniture(r, lots)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "decompte-charges.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
