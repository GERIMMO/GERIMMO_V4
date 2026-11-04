"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Banknote, Building2, ChevronRight, House, Search, X } from "lucide-react";
import { deElide } from "@/lib/elision";
import { eur } from "@/lib/ged";
import { correspond } from "@/lib/roles-personnes";
import type { occupationLot } from "@/lib/occupation-lot";
import styles from "./liste-lots.module.css";

export type LotDuParc = {
  id: string; nom: string; etat: string; surface: number | null; meuble: boolean;
  href: string; locataires: string[]; loyer: number | null;
  occupation: ReturnType<typeof occupationLot> | null;
  aCompleter: { titre: string; ancre: string } | null;
  /** Contrat(s) en préparation : un seul s'ouvre directement, plusieurs renvoient à la fiche (audit #264, CB-03). */
  bailEnPreparation?: { href: string; nombre: number } | null;
};
export type BienDuParc = { id: string; nom: string; adresse: string; href: string; lots: LotDuParc[] };
export function VueParcProprietaire({ biens, retires, mois, loyersMois, base = "", bienSelectionne = null, children }: {
  base?: string; bienSelectionne?: string | null; children?: ReactNode;
  biens: BienDuParc[]; retires: { id: string; nom: string; href: string }[]; mois: string; loyersMois: { attendu: number; encaisse: number } | null;
}) {
  const [recherche, chercher] = useState("");
  const [bien, choisirBien] = useState("");
  const uid = useId();
  const panneau = useRef<HTMLElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bienSelectionne) {
      panneau.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 900px)").matches) panneau.current?.scrollIntoView({ block: "start" });
    } else if (window.matchMedia("(max-width: 900px)").matches) {
      liste.current?.focus({ preventScroll: true });
    }
  }, [bienSelectionne]);
  const nomMois = new Date(`${mois}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", timeZone: "Europe/Paris" });
  const tous = biens.flatMap(item => item.lots);
  const groupes = biens.filter(item => !bien || item.id === bien).map(item => ({ ...item, lots: item.lots.filter(lot =>
    correspond(recherche, item.nom, item.adresse, lot.nom, ...lot.locataires),
  ) })).filter(item => item.lots.length || (!item.lots.length && biens.find(source => source.id === item.id)?.lots.length === 0 && correspond(recherche, item.nom, item.adresse)));
  const total = groupes.reduce((somme, item) => somme + item.lots.length, 0);
  const filtresActifs = Boolean(recherche || bien);
  const reinitialiser = () => { chercher(""); choisirBien(""); };
  return <div className={styles.patrimoine}>
    <dl className={styles.chiffresParc}>
      <div><dt><Building2 size={18} aria-hidden="true" />Biens</dt><dd>{biens.length}</dd></div>
      <div><dt><House size={18} aria-hidden="true" />Lots</dt><dd>{tous.length}</dd></div>
      <div className={styles.carteLoyers}><dt><Banknote size={18} aria-hidden="true" />Loyers {deElide(nomMois)}</dt>
        <dd>{loyersMois === null ? <span className={styles.messageLoyers} role="status">Montants indisponibles</span>
          : loyersMois.attendu === 0 ? <span className={styles.messageLoyers}>Aucun loyer attendu ce mois-ci</span>
          : <><strong>{eur(loyersMois.encaisse)}</strong><span className={styles.attenduLoyers}> encaissé{loyersMois.encaisse > 1 ? "s" : ""} sur <b>{eur(loyersMois.attendu)}</b> attendus</span></>}
        </dd>
        {loyersMois !== null && loyersMois.attendu > 0 && <p className={styles.precisionLoyers}>Charges comprises</p>}
      </div>
    </dl>
    <div className={styles.outilsParc}>
      <div className={styles.rechercheParc}><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor={`${uid}-recherche`}>Rechercher un bien, un lot ou un locataire</label>
        <input id={`${uid}-recherche`} type="search" value={recherche} onChange={event => chercher(event.target.value)} placeholder="Bien, adresse, locataire…" aria-controls={`${uid}-liste`} />
        {recherche && <button type="button" aria-label="Effacer la recherche" onClick={() => chercher("")}><X size={17} aria-hidden="true" /></button>}
      </div>
      {biens.length > 1 && <div className={styles.choixBien}><label className="sr-only" htmlFor={`${uid}-bien`}>Choisir un bien</label><select id={`${uid}-bien`} value={bien} onChange={event => choisirBien(event.target.value)}><option value="">Tous les biens</option>{biens.map(item => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></div>}

    </div>
    <div className={styles.resultatsParc}><p role="status">{total} lot{total > 1 ? "s" : ""}{filtresActifs ? ` sur ${tous.length}` : ""}</p>{filtresActifs && <button type="button" onClick={reinitialiser}>Effacer les filtres</button>}</div>
    <div className={styles.divisionParc} data-selection={Boolean(bienSelectionne)}>
      <div ref={liste} tabIndex={-1} id={`${uid}-liste`} className={styles.listeBiens} aria-label="Liste des biens">
        {groupes.length > 0 ? <nav aria-label="Vos biens"><ul>{groupes.map(item => <li key={item.id}>
          <Link href={`${base}/parc?sel=bien:${item.id}`} scroll={false} aria-current={bienSelectionne === item.id ? "true" : undefined} className={styles.ligneBien}>
            <span className={styles.iconeBien}><Building2 size={20} aria-hidden="true" /></span>
            <span className={styles.identiteBien}><strong>{item.nom}</strong>{item.adresse && <small>{item.adresse}</small>}<span>{item.lots.length} lot{item.lots.length > 1 ? "s" : ""}{item.lots.some(lot => (lot.occupation?.chambresPreparees ?? 0) > 0) && <span className={styles.etiquetteColocation}> · Colocation · {item.lots.reduce((n, lot) => n + (lot.occupation?.chambresPreparees ?? 0), 0)} chambres</span>}</span></span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </li>)}</ul></nav> : <div className={styles.listeVide}><p>Aucun bien dans cette sélection.</p><button type="button" onClick={reinitialiser}>Afficher tous les biens</button></div>}
      </div>
      <section ref={panneau} tabIndex={-1} id="fiche-bien" className={styles.panneauBien} aria-label={bienSelectionne ? "Fiche complète du bien sélectionné" : "Détail du bien"}>
        {bienSelectionne && children ? <>
          <Link className={styles.retourBiens} href={`${base}/parc`} scroll={false}><ArrowLeft size={16} aria-hidden="true" />Retour à la liste</Link>
          {children}
        </> : <div className={styles.attenteBien}><span className={styles.iconeBien}><Building2 size={26} aria-hidden="true" /></span><h2>Sélectionnez un bien</h2><p>Retrouvez ici sa fiche complète et ses lots.</p></div>}
      </section>
    </div>
    {retires.length > 0 && <details className={styles.archivesParc}><summary>Biens archivés · {retires.length}</summary><ul>{retires.map(item => <li key={item.id}><Link href={item.href}>{item.nom}<ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul></details>}
  </div>;
}
