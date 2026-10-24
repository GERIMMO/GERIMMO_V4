"use client";

import { LIMITE_ARTICLES, LIMITE_VEILLES, type MotifReserve } from "@/lib/cadre-editorial";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCheck, ChevronDown, Newspaper, ShieldCheck, TriangleAlert } from "lucide-react";
import { CATEGORIES_DECISIONS, filtreDecision, rechercherDecisions, trierDecisions, type FiltreDecision, type EntreeDecision } from "@/lib/tri-decisions";
import type { DecisionDeFile, Signal } from "@/lib/decisions-attendues";
import { DecisionMatin, type DecisionAffichee } from "./decision-matin";
import { OuvrirAlertes } from "./ouvrir-alertes";
import styles from "./file-decisions.module.css";

const PAR_PAGE = 6;
const ICONES = { incidents: TriangleAlert, accords: ShieldCheck, contenus: Newspaper };
const lienFile = (categorie: FiltreDecision) => `/admin/brief?vue=decisions${categorie === "tout" ? "" : `&categorie=${categorie}`}`;

function LienDossier({ entree }: { entree: EntreeDecision }) {
  const href = entree.type === "signal" ? entree.signal.href : entree.decision.lien;
  const contenu = <><span>{entree.titre}</span><ArrowRight size={16} aria-hidden="true" /></>;
  return href ? <Link href={href} className={styles.priorityLink}>{contenu}</Link>
    : <OuvrirAlertes className={styles.priorityLink}>{contenu}</OuvrirAlertes>;
}

export function FileDecisions({ decisions, signaux, cartes, vue, categorie, reserve = [], indisponible = false }: {
  decisions: DecisionDeFile[]; signaux: Signal[]; cartes: DecisionAffichee[];
  vue: "bureau" | "decisions"; categorie?: string; indisponible?: boolean;
  reserve?: { decision: DecisionDeFile; motif: MotifReserve }[];
}) {
  const entrees = trierDecisions(decisions, signaux);
  const [filtre, setFiltre] = useState<FiltreDecision>(filtreDecision(categorie));
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const resultat = useRef<HTMLParagraphElement>(null);
  const groupes = CATEGORIES_DECISIONS.map(c => ({ ...c, nombre: entrees.filter(e => e.categorie === c.id).length }));
  const incidents = entrees.filter(e => e.categorie === "incidents");
  const retenues = rechercherDecisions(entrees, filtre, recherche);
  const pages = Math.max(1, Math.ceil(retenues.length / PAR_PAGE));
  const courante = Math.min(page, pages);
  const changerPage = (p: number) => { setPage(p); resultat.current?.focus(); };

  const secondaires = <div className={styles.editorialRules}>
    <p>Logement et artisans du bâtiment · au plus {LIMITE_VEILLES} veilles et {LIMITE_ARTICLES} articles à examiner.</p>
    {reserve.length > 0 && <details>
      <summary>{reserve.length} propositions conservées à part</summary>
      <p>Le hors-sujet ne compte plus parmi les demandes. Les autres propositions attendent une place ; aucun accord ni rejet n’a été enregistré.</p>
      <ul className={styles.reserveList}>{reserve.map(({decision: d, motif}) => <li key={d.cle}>
        <Link href={d.source === "veille" ? `/admin/veille?information=${encodeURIComponent(d.source_id)}` : d.lien}>{d.titre}<small>{motif === "hors_perimetre" ? "Hors périmètre" : "En réserve"}</small></Link>
      </li>)}</ul>
    </details>}
  </div>;

  if (vue === "bureau") return <div className={styles.overview}>
    <nav aria-label="Demandes par catégorie" className={styles.groups}>
      {groupes.map(g => {
        const Icone = ICONES[g.id];
        return <Link key={g.id} href={lienFile(g.id)} className={styles.group} data-tone={g.id}>
          <span className={styles.icon}><Icone size={20} aria-hidden="true" /></span>
          <span className={styles.groupText}><strong>{g.nom}</strong><small>{g.description}</small></span>
          <span className={styles.count}>{indisponible ? "À vérifier" : g.nombre}</span><ArrowRight size={17} aria-hidden="true" />
        </Link>;
      })}
    </nav>
    {incidents.length > 0 ? <div className={styles.priorities}>
      <h3>À regarder en premier</h3>
      <ul>{incidents.slice(0, 3).map(e => <li key={e.cle}><LienDossier entree={e} /></li>)}</ul>
      {incidents.length > 3 && <Link className={styles.more} href={lienFile("incidents")}>Voir les {incidents.length} problèmes <ArrowRight size={15} aria-hidden="true" /></Link>}
    </div> : !indisponible && <p className={styles.calm}><CheckCheck size={18} aria-hidden="true" />Aucun problème à examiner dans cette file.</p>}
    {secondaires}
    <Link href={lienFile("tout")} className={styles.more}>Examiner toutes les demandes <ArrowRight size={15} aria-hidden="true" /></Link>
  </div>;

  const parCle = new Map(cartes.map(c => [c.cle, c]));
  return <div className={styles.inbox}>
    <Link href="/admin/brief" className={styles.more}>← Bureau de direction</Link>
    <div className={styles.filters} role="group" aria-label="Filtrer les demandes">
      {[{ id: "tout" as const, nom: "Tout", nombre: entrees.length }, ...groupes].map(g =>
        <button key={g.id} type="button" aria-pressed={filtre === g.id} onClick={() => { setFiltre(g.id); setPage(1); }}>{g.nom}<span>{g.nombre}</span></button>)}
    </div>
    <label className={styles.search}>Rechercher une demande
      <input type="search" value={recherche} onChange={e => { setRecherche(e.target.value); setPage(1); }} placeholder="Titre ou mot-clé…" />
    </label>
    <p className={styles.result} ref={resultat} tabIndex={-1} role="status">
      {retenues.length ? `${(courante - 1) * PAR_PAGE + 1}–${Math.min(courante * PAR_PAGE, retenues.length)} sur ${retenues.length} demande${retenues.length > 1 ? "s" : ""}` : "Aucune demande ne correspond à ces filtres."}
      {indisponible && " · Liste partielle : certaines sources sont indisponibles."}
    </p>
    <ul className={styles.list} aria-label="Demandes à examiner">
      {retenues.slice((courante - 1) * PAR_PAGE, courante * PAR_PAGE).map(e => {
        if (e.type === "signal") return <li key={e.cle} className={styles.signal}><LienDossier entree={e} /><p>{e.signal.detail}</p></li>;
        const carte = parCle.get(e.cle);
        return carte ? <DecisionMatin key={e.cle} decision={carte} compacte />
          : <li key={e.cle}><details className={styles.row}><summary><span>{e.titre}</span><ChevronDown size={18} aria-hidden="true" /></summary><div className={styles.detail}>
            <p>{e.decision.pourquoi}</p><Link href={e.decision.lien} className="btn-secondaire">Examiner le dossier <ArrowRight size={15} aria-hidden="true" /></Link>
          </div></details></li>;
      })}
    </ul>
    {secondaires}
    {pages > 1 && <nav aria-label="Pages des demandes" className={styles.pagination}>
      <button type="button" disabled={courante === 1} onClick={() => changerPage(courante - 1)}>Précédent</button>
      <span>Page {courante} sur {pages}</span>
      <button type="button" disabled={courante === pages} onClick={() => changerPage(courante + 1)}>Suivant</button>
    </nav>}
  </div>;
}
