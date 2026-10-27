"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, Building2, ChevronRight, Search, X } from "lucide-react";
import { COULEURS_ETAT_LOT, ETATS_LOT, formaterSurface } from "@/lib/parc";
import { eur } from "@/lib/ged";
import { correspond } from "@/lib/roles-personnes";
import type { occupationLot } from "@/lib/occupation-lot";
import styles from "./liste-lots.module.css";

export type LotDuParc = {
  id: string; nom: string; etat: string; surface: number | null; meuble: boolean;
  href: string; locataires: string[]; loyer: number | null;
  occupation: ReturnType<typeof occupationLot> | null;
  aCompleter: { titre: string; ancre: string } | null;
};
export type BienDuParc = { id: string; nom: string; adresse: string; href: string; lots: LotDuParc[] };
const FILTRES = [{ id: "tous", nom: "Tous" }, { id: "loue", nom: "En location" }, { id: "libre", nom: "Sans location" }, { id: "colocation", nom: "Colocation" }, { id: "brouillon", nom: "En préparation" }] as const;
type Filtre = typeof FILTRES[number]["id"];

export function VueParcProprietaire({ biens, retires, loyers, lectureLocations }: {
  biens: BienDuParc[]; retires: { id: string; nom: string; href: string }[]; loyers: number | null; lectureLocations: boolean;
}) {
  const [recherche, chercher] = useState("");
  const [bien, choisirBien] = useState("");
  const [filtre, filtrer] = useState<Filtre>("tous");
  const uid = useId();
  const tous = biens.flatMap(item => item.lots);
  const dansFiltre = (lot: LotDuParc) => filtre === "tous" || filtre === "brouillon" && lot.etat === "brouillon"
    || filtre === "loue" && (lot.occupation?.contratsActifs ?? 0) > 0
    || filtre === "libre" && lot.occupation?.contratsActifs === 0
    || filtre === "colocation" && (lot.occupation?.chambresPreparees ?? 0) > 0;
  const groupes = biens.filter(item => !bien || item.id === bien).map(item => ({ ...item, lots: item.lots.filter(lot =>
    dansFiltre(lot) && correspond(recherche, item.nom, item.adresse, lot.nom, ...lot.locataires),
  ) })).filter(item => item.lots.length || (!item.lots.length && biens.find(source => source.id === item.id)?.lots.length === 0 && filtre === "tous" && correspond(recherche, item.nom, item.adresse)));
  const total = groupes.reduce((somme, item) => somme + item.lots.length, 0);
  const filtresActifs = Boolean(recherche || bien || filtre !== "tous");
  const reinitialiser = () => { chercher(""); choisirBien(""); filtrer("tous"); };
  // Le compteur d'un filtre décrit ses lots, jamais des chambres additionnées aux logements.
  const compteColocations = tous.filter(lot => (lot.occupation?.chambresPreparees ?? 0) > 0).length;
  return <div className={styles.patrimoine}>
    <dl className={styles.chiffresParc}>
      <div><dt>Biens</dt><dd>{biens.length}</dd></div><div><dt>Lots</dt><dd>{tous.length}</dd></div>
      <div><dt>Loyers et charges mensuels</dt><dd>{loyers === null ? "—" : eur(loyers)}</dd></div>
    </dl>
    <div className={styles.outilsParc}>
      <div className={styles.rechercheParc}><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor={`${uid}-recherche`}>Rechercher un bien, un lot ou un locataire</label>
        <input id={`${uid}-recherche`} type="search" value={recherche} onChange={event => chercher(event.target.value)} placeholder="Bien, adresse, locataire…" aria-controls={`${uid}-liste`} />
        {recherche && <button type="button" aria-label="Effacer la recherche" onClick={() => chercher("")}><X size={17} aria-hidden="true" /></button>}
      </div>
      {biens.length > 1 && <div className={styles.choixBien}><label className="sr-only" htmlFor={`${uid}-bien`}>Choisir un bien</label><select id={`${uid}-bien`} value={bien} onChange={event => choisirBien(event.target.value)}><option value="">Tous les biens</option>{biens.map(item => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></div>}
      <div className={styles.filtresParc} role="group" aria-label="Filtrer les lots">
        {FILTRES.filter(item => item.id !== "colocation" || compteColocations > 0).map(item => <button key={item.id} type="button" aria-pressed={filtre === item.id}
          disabled={!lectureLocations && ["loue", "libre", "colocation"].includes(item.id)} onClick={() => filtrer(item.id)} aria-controls={`${uid}-liste`}>{item.nom}</button>)}
      </div>
    </div>
    <div className={styles.resultatsParc}><p role="status">{total} lot{total > 1 ? "s" : ""}{filtresActifs ? ` sur ${tous.length}` : ""}</p>{filtresActifs && <button type="button" onClick={reinitialiser}>Effacer les filtres</button>}</div>
    <div id={`${uid}-liste`} className={styles.groupesParc}>
      {groupes.map(item => <section className={styles.bienParc} key={item.id} aria-label={item.nom}>
        <header><span className={styles.iconeBien}><Building2 size={21} aria-hidden="true" /></span><div><h2>{item.nom}</h2>{item.adresse && <p>{item.adresse}</p>}</div><Link href={item.href} aria-label={`Gérer le bien ${item.nom}`} title="Gérer le bien"><ChevronRight size={18} aria-hidden="true" /></Link></header>
        {item.lots.length ? <ul>{item.lots.map(lot => <li key={lot.id}>
          <Link href={lot.href} className={styles.dossierLot} data-lot-id={lot.id}>
            <div className={styles.lotEntete}><strong>{lot.nom}</strong><span className={COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"}>{ETATS_LOT[lot.etat] ?? lot.etat}</span></div>
            <p className={styles.lotCaracteristiques}>{[lot.surface == null ? null : formaterSurface(lot.surface), lot.meuble ? "Meublé" : "Non meublé", (lot.occupation?.chambresPreparees ?? 0) > 0 ? `${lot.occupation!.chambresPreparees} chambre${lot.occupation!.chambresPreparees > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}</p>
            <div className={styles.lotLocation}><span>{lot.occupation === null ? "Locations indisponibles" : lot.occupation.contratsActifs ? lot.locataires.join(", ") || `${lot.occupation.contratsActifs} bail${lot.occupation.contratsActifs > 1 ? "s" : ""} en cours` : "Sans location en cours"}</span>
              {lot.loyer !== null && (lot.occupation?.contratsActifs ?? 0) > 0 && <strong>{eur(lot.loyer)}<small> / mois CC</small></strong>}
            </div>
            {!!lot.occupation?.chambresPreparees && !lot.occupation.logementEntierOccupe && <p className={styles.chambresParc}>{lot.occupation.chambresLouees} chambre{lot.occupation.chambresLouees > 1 ? "s" : ""} louée{lot.occupation.chambresLouees > 1 ? "s" : ""}{lot.occupation.chambresSansBail > 0 ? ` · ${lot.occupation.chambresSansBail} sans bail` : ""}</p>}
            <span className={styles.ouvrirDossier}>Ouvrir le dossier<ArrowRight size={16} aria-hidden="true" /></span>
          </Link>
          {lot.aCompleter && <Link className={styles.completerLot} href={`${lot.href}#${lot.aCompleter.ancre}`}>Compléter : {lot.aCompleter.titre.toLowerCase()}<ArrowRight size={14} aria-hidden="true" /></Link>}
        </li>)}</ul> : <div className={styles.bienSansLot}><p>Aucun lot actif.</p><Link href={item.href}>Gérer les lots de ce bien →</Link></div>}
      </section>)}
      {!groupes.length && <div className="vide-guide"><h2>Aucun lot dans cette sélection</h2><p>Essayez un autre nom ou retirez un filtre.</p><button type="button" className="btn-secondaire" onClick={reinitialiser}>Afficher tous les lots</button></div>}
    </div>
    {retires.length > 0 && <details className={styles.archivesParc}><summary>Biens archivés · {retires.length}</summary><ul>{retires.map(item => <li key={item.id}><Link href={item.href}>{item.nom}<ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul></details>}
  </div>;
}
