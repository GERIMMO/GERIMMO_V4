import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ClipboardList, FileText, KeyRound, Wrench } from "lucide-react";
import { formaterDate } from "@/lib/ged";
import { lieuTache, regrouperTachesAccueil, type GroupeTaches, type TacheAccueil } from "@/lib/taches-accueil-proprietaire";
import styles from "./carte-taches-proprietaire.module.css";

const icones = { incident: Wrench, document: FileText, location: KeyRound, demande: ClipboardList };

export function CarteTachesProprietaire({ taches, base, indisponible, prioritesPresentes, chambresSansBail = 0 }: {
  taches: TacheAccueil[]; base: string; indisponible: boolean; prioritesPresentes: boolean; chambresSansBail?: number;
}) {
  // Grand parc : une ligne par obligation, dépliable sur ses lots ; le compteur reste le nombre de tâches.
  const entrees = regrouperTachesAccueil(taches);
  const nombre = (liste: (TacheAccueil | GroupeTaches)[]) => liste.reduce((n, e) => n + ("taches" in e ? e.taches.length : 1), 0);
  const lignes = (liste: (TacheAccueil | GroupeTaches)[]) => <ul className={styles.liste}>{liste.map(tache => {
    const Icone = icones[tache.nature];
    if ("taches" in tache) return <li key={tache.cle}><details className={styles.groupe}>
      <summary className={styles.tache}>
        <span className={styles.icone}><Icone size={18} aria-hidden="true" /></span>
        <span className={styles.contenu}><b>{tache.titre}</b>{tache.detail && <small>{tache.detail}</small>}
          {tache.echeance && <small>Prochaine échéance : <time dateTime={tache.echeance}>{formaterDate(tache.echeance)}</time></small>}
        </span>
        <span className={styles.geste}>Voir les {tache.unite}<ChevronDown size={16} aria-hidden="true" /></span>
      </summary>
      {/* Sans préchargement : déplier 300 lots ne doit pas lancer des dizaines de rendus de fiches (relecture TRV-09). */}
      <ul className={styles.lots}>{tache.taches.map(t => <li key={t.cle}><Link href={t.href} prefetch={false}>{lieuTache(t)}
        {!tache.detail && t.detail && <small>{t.detail}</small>}
        {t.echeance && <small>Échéance : <time dateTime={t.echeance}>{formaterDate(t.echeance)}</time></small>}
      </Link></li>)}</ul>
    </details></li>;
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
      {/* Le lien dit le nom de la page qu'il ouvre, « À faire » (audit final, UX-05 : « Toutes les demandes » menait à « À faire »). */}
      <Link href={`${base}/alertes`}>Tout ce qu’il y a à faire<ArrowRight size={15} aria-hidden="true" /></Link>
    </header>
    {indisponible && <p className={styles.incomplet} role="alert">Certaines tâches n’ont pas pu être vérifiées. La liste peut être incomplète.</p>}
    {taches.length > 0 ? <>
      {lignes(entrees.slice(0, 5))}
      {entrees.length > 5 && <details className={styles.suite}>
        <summary>{nombre(entrees.slice(5)) === 1 ? "Voir l’autre tâche" : `Voir les ${nombre(entrees.slice(5))} autres tâches`}<ChevronDown size={16} aria-hidden="true" /></summary>
        {lignes(entrees.slice(5))}
      </details>}
    </> : !indisponible && chambresSansBail === 0 && <p className={styles.calme}><Check size={18} aria-hidden="true" />{prioritesPresentes ? "Aucune autre tâche à traiter pour le moment." : "Aucune tâche détectée pour le moment."}</p>}
    {chambresSansBail > 0 && <Link className={styles.colocations} href={`${base}/parc`}>{chambresSansBail} chambre{chambresSansBail > 1 ? "s" : ""} sans bail en cours · Voir les colocations<ArrowRight size={15} aria-hidden="true" /></Link>}
  </section>;
}
