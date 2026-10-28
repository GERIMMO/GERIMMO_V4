"use client";
import { useId, useState } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { transmettreReleve, type EtatConsommations } from "@/app/actions/consommations";
import type { MonReleveConsommation } from "@/lib/consommations";
import { formaterDate } from "@/lib/ged";
import { ChampFichier } from "./champ-fichier";
import { LectureDocumentAssistee } from "./lecture-document-assistee";
import { Button } from "./ui/button";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { usePhotoConsommation } from "@/lib/use-photo-consommation";
import styles from "./consommations.module.css";

export function RelevesLocataire({ orgId, demandes, aujourdHui }: { orgId: string; demandes: MonReleveConsommation[]; aujourdHui: string }) {
  const attendues = demandes.filter(d => d.peut_repondre);
  const passees = demandes.filter(d => !d.peut_repondre);
  return <div className={styles.list}>
    {attendues.length ? attendues.map(d => <Releve key={d.demande_id} orgId={orgId} d={d} aujourdHui={aujourdHui} />) : <p className={styles.ok}>Aucun relevé à transmettre pour le moment.</p>}
    {passees.length > 0 && <details><summary>Historique des relevés ({passees.length})</summary><ul className={styles.history}>{passees.map(d => <li key={d.demande_id}><strong>{d.libelle}</strong> · {d.index_releve != null ? `${Number(d.index_releve).toLocaleString("fr-FR")} ${d.unite === "m3" ? "m³" : "kWh"} au ${formaterDate(d.date_releve)}` : d.statut === "annulee" ? "Demande annulée" : `Demande du ${formaterDate(d.echeance)} · consultation seule`}</li>)}</ul></details>}
  </div>;
}
function Releve({ orgId, d, aujourdHui }: { orgId: string; d: MonReleveConsommation; aujourdHui: string }) {
  const photoId = useId();
  const { fichier: photo, preparation, erreur: erreurPhoto, choisir: choisirPhoto, retirer: retirerPhoto, lierChamp: lierPhoto, verifierSoumission, reinitialisation } = usePhotoConsommation();
  const [index, setIndex] = useState("");
  const [etat, submit, pending] = useActionStateProtegee(transmettreReleve.bind(null, orgId, d.demande_id), {} as EtatConsommations);
  const unite = d.unite === "m3" ? "m³" : "kWh";
  if (etat.succes) return <p className={styles.ok} role="status">{d.libelle} : {etat.succes}</p>;
  return <section className={styles.panel}><header className={styles.header}><h2>{d.libelle}</h2><span className={styles.badge}>Pour le {formaterDate(d.echeance)}</span></header><div className={styles.body}>
    <p className={styles.muted}>{d.lot_nom}{d.numero ? ` · compteur ${d.numero}` : ""}{d.emplacement ? ` · ${d.emplacement}` : ""}</p>
    <p className={styles.muted}>Dernier index : {Number(d.index_precedent).toLocaleString("fr-FR")} {unite} au {formaterDate(d.date_precedente)}.</p>
    <form data-saisie-confirmee action={submit} onReset={e => e.preventDefault()} onSubmitCapture={verifierSoumission} className={styles.form}>
      <label>Index affiché ({unite})<input name="index" value={index} onChange={e => setIndex(e.target.value)} inputMode="decimal" required autoComplete="off" placeholder="Recopiez le nombre sur le compteur" /></label>
      <label>Date du relevé<input name="date" type="date" defaultValue={aujourdHui} min={d.date_precedente ? new Date(Date.parse(`${d.date_precedente}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : undefined} max={aujourdHui} required /></label>
      <ChampFichier key={reinitialisation} id={photoId} ref={lierPhoto} name="photo" accept="image/jpeg,image/png" libelle="Ajouter une photo (facultatif)" onChange={choisirPhoto} />
      {preparation && <p role="status" className={styles.muted}>Préparation de la photo…</p>}
      {erreurPhoto && <p role="alert" className={styles.error}>{erreurPhoto}</p>}
      {(photo || erreurPhoto) && <Button type="button" size="sm" variant="ghost" onClick={retirerPhoto}>Retirer la photo</Button>}
      <LectureDocumentAssistee key={photo ? `${photo.name}-${photo.lastModified}` : "vide"} orgId={orgId} demandeId={d.demande_id} fichier={photo} appliquer={l => { if (l.index) setIndex(l.index); }} />
      {etat.erreur && <p role="alert" className={styles.error}>{etat.erreur}</p>}
      <BoutonEnvoi enCours={pending} enCoursTexte="Transmission…" disabled={preparation || !!erreurPhoto}>Transmettre mon relevé</BoutonEnvoi>
      <p className={styles.caption}>Compteur remplacé ou inaccessible ? Signalez-le dans la messagerie de votre logement.</p>
    </form>
  </div></section>;
}
