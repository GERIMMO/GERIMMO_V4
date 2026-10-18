import Link from "next/link";
import { AlertTriangle, Wrench, Wallet, CalendarClock, Activity, ChevronDown, Info } from "lucide-react";
import { LIBELLES_MESURES, SOURCES_DIRECTION, type FaitsDirection, type SourceDirection } from "@/lib/faits-direction";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import styles from "./faits-direction.module.css";

const ICONES = { incidents: AlertTriangle, interventions: Wrench, loyers: Wallet, echeances: CalendarClock, service: Activity };

export function FaitsDeDirection({ snapshot, erreur }: { snapshot: FaitsDirection | null; erreur: boolean }) {
  return <section className={styles.section} aria-labelledby="faits-direction">
    <header className={styles.header}>
      <div><h2 id="faits-direction">Les points de vigilance</h2><p>Incidents, loyers et activité du service, à partir du dernier relevé.</p></div>
      {!erreur && snapshot && <span className={styles.updated}><CalendarClock size={14} aria-hidden="true" />Relevé du {formaterDateHeureParis(snapshot.genere_le)}</span>}
    </header>
    {erreur ? <p role="alert" className="err">La lecture des faits est indisponible. Aucun compte n’est confirmé.</p>
      : !snapshot ? <p className={styles.empty}>Aucun relevé préparé pour ce jour. Utilisez « Préparer le point » pour réunir les sources.</p>
      : <>
        <div className={styles.grid}>{(Object.keys(SOURCES_DIRECTION) as SourceDirection[]).map(cle => {
          const source = snapshot.sources[cle];
          const Icone = ICONES[cle];
          return <article className={styles.card} key={cle} data-source={cle}>
            <div className={styles.cardTitle}><span><Icone size={17} aria-hidden="true" /></span><h3>{SOURCES_DIRECTION[cle]}</h3></div>
            {source.statut === "indisponible" && <p role="alert" className="err mt-2">Source indisponible. {source.donnees ? "Dernier état connu conservé ci-dessous." : "Aucun état connu ; ce n’est pas un zéro."}</p>}
            {source.observe_le && <p className={styles.observed}>Observé le {formaterDateHeureParis(source.observe_le)}</p>}
            {source.donnees && <>
              <dl className={styles.measures}>{Object.entries(source.donnees.mesures).map(([nom, nombre]) => <div key={nom}><dt>{LIBELLES_MESURES[nom] ?? nom}</dt><dd>{nom.endsWith("_eur") ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(nombre) : nombre.toLocaleString("fr-FR")}</dd></div>)}</dl>
              {source.donnees.faits.length > 0 && <details className={styles.details}><summary>Dossiers concernés (20 au plus)<ChevronDown size={14} aria-hidden="true" /></summary><ul>{source.donnees.faits.map((fait, i) => <li key={i}><Link className="lien-discret break-words" href={fait.href}>{fait.titre}</Link>{fait.date && <span className="ml-2 text-xs text-muted-foreground">{new Date(fait.date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>}</li>)}</ul></details>}
            </>}
          </article>;
        })}</div>
      </>}
    <details className={styles.method}>
      <summary><Info size={14} aria-hidden="true" />Comprendre ces indicateurs<ChevronDown size={14} aria-hidden="true" /></summary>
      <p>Relevé préparé à la demande, sans envoi. Les montants portent sur les échéances déjà appelées ; ils ne constituent pas une prévision de trésorerie. Aucun nom de personne n’est copié : les alertes sont désignées par leur type et un lien vers l’organisation concernée.{snapshot && ` Règles de calcul : version ${snapshot.version_regles}.`}</p>
    </details>
  </section>;
}
