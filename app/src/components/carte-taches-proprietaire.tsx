import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ClipboardList, FileText, KeyRound, Wrench } from "lucide-react";
import { formaterDate } from "@/lib/ged";
import type { TacheAccueil } from "@/lib/taches-accueil-proprietaire";
import styles from "./carte-taches-proprietaire.module.css";

const icones = { incident: Wrench, document: FileText, location: KeyRound, demande: ClipboardList };

export function CarteTachesProprietaire({ taches, base, indisponible, prioritesPresentes, chambresSansBail = 0 }: {
  taches: TacheAccueil[]; base: string; indisponible: boolean; prioritesPresentes: boolean; chambresSansBail?: number;
}) {
  const lignes = (liste: TacheAccueil[]) => <ul className={styles.liste}>{liste.map(tache => {
    const Icone = icones[tache.nature];
    return <li key={tache.cle}><Link href={tache.href} className={styles.tache}>
      <span className={styles.icone}><Icone size={18} aria-hidden="true" /></span>
      <span className={styles.contenu}><b>{tache.titre}</b>
        {(tache.contexte || tache.detail) && <small>{[tache.contexte, tache.detail].filter(Boolean).join(" · ")}</small>}
        {tache.echeance && <small>Échéance : <time dateTime={tache.echeance}>{formaterDate(tache.echeance)}</time></small>}
      </span>
      <span className={styles.geste}>{tache.geste}<ArrowRight size={16} aria-hidden="true" /></span>
    </Link></li>;
  })}</ul>;
  return <section id="taches-proprietaire" className={styles.carte} aria-labelledby="taches-proprietaire-titre" tabIndex={-1}>
    <header className={styles.entete}>
      <h2 id="taches-proprietaire-titre">Mes tâches{taches.length > 0 && <span className={styles.compteur} aria-label={`${taches.length} tâche${taches.length > 1 ? "s" : ""}${indisponible ? ` connue${taches.length > 1 ? "s" : ""}` : ""}`}>{taches.length}</span>}</h2>
      <Link href={`${base}/alertes`}>Toutes les demandes<ArrowRight size={15} aria-hidden="true" /></Link>
    </header>
    {indisponible && <p className={styles.incomplet} role="alert">Certaines tâches n’ont pas pu être vérifiées. La liste peut être incomplète.</p>}
    {taches.length > 0 ? <>
      {lignes(taches.slice(0, 5))}
      {taches.length > 5 && <details className={styles.suite}>
        <summary>{taches.length === 6 ? "Voir l’autre tâche" : `Voir les ${taches.length - 5} autres tâches`}<ChevronDown size={16} aria-hidden="true" /></summary>
        {lignes(taches.slice(5))}
      </details>}
    </> : !indisponible && chambresSansBail === 0 && <p className={styles.calme}><Check size={18} aria-hidden="true" />{prioritesPresentes ? "Aucune autre tâche à traiter pour le moment." : "Aucune tâche détectée pour le moment."}</p>}
    {chambresSansBail > 0 && <Link className={styles.colocations} href={`${base}/parc`}>{chambresSansBail} chambre{chambresSansBail > 1 ? "s" : ""} sans bail en cours · Voir les colocations<ArrowRight size={15} aria-hidden="true" /></Link>}
  </section>;
}
