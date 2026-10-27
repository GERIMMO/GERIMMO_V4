"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, BellRing, Building2, CircleAlert, ListChecks } from "lucide-react";
import { Modale } from "@/components/ui/modale";
import styles from "./carte-verifications.module.css";

type Props = {
  base: string;
  patrimoine: { biens: number; lots: number } | null;
  total: number;
  loyersAConfirmer?: number;
  critiques: number;
  apercu: string | null;
  indisponible: boolean;
  /** Les demandes courantes sont déjà affichées sur l’accueil : on les rejoint directement. */
  hrefTaches?: string;
  className: string;
  children: ReactNode;
};

/** La même place sert au patrimoine au repos, puis aux demandes réellement présentes. */
export function CarteVerifications(props: Props) {
  const aVerifier = props.total > 0 || (props.loyersAConfirmer ?? 0) > 0 || props.indisponible;
  const lienTaches = props.hrefTaches && props.total > 0 && props.critiques === 0 && !(props.loyersAConfirmer ?? 0) && !props.indisponible ? props.hrefTaches : null;
  const demandeEnFenetre = aVerifier && !lienTaches;
  const avant = useRef(demandeEnFenetre);
  const etaitOuverte = useRef(false);
  const lienPatrimoine = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // La dernière confirmation peut retirer la fenêtre et son bouton : le focus
    // revient à la carte qui les remplace, au lieu de se perdre dans le document.
    if (avant.current && !demandeEnFenetre && etaitOuverte.current) {
      lienPatrimoine.current?.focus({ preventScroll: true });
      etaitOuverte.current = false;
    }
    avant.current = demandeEnFenetre;
  }, [demandeEnFenetre]);

  // Le nom accessible est le texte visible lui-même (audit du 27/10, TRV-06 : un aria-label réordonné le contredisait).
  if (lienTaches) return <Link ref={lienPatrimoine} href={lienTaches} className={`${props.className} ${styles.carte} ${styles.lienTaches}`}>
    <span><ListChecks size={18} aria-hidden="true" />À vérifier</span>
    <strong>{props.total} <em>demande{props.total > 1 ? "s" : ""}</em></strong>
    <small className={styles.apercu}>Voir mes tâches</small>
    <ArrowUpRight size={18} className={styles.fleche} aria-hidden="true" />
  </Link>;
  if (aVerifier) return <Demandes {...props} signalerOuverture={ouverte => { etaitOuverte.current = ouverte; }} />;
  const { patrimoine, base, className } = props;
  return <Link ref={lienPatrimoine} href={`${base}/parc`} className={`${className} ${styles.repos}`}>
    <span><Building2 size={18} aria-hidden="true" />Patrimoine</span>
    <strong>{patrimoine ? <>{patrimoine.biens} <em>bien{patrimoine.biens > 1 ? "s" : ""}</em></> : "—"}</strong>
    <small>{patrimoine ? `${patrimoine.lots} lot${patrimoine.lots > 1 ? "s" : ""}` : "Patrimoine indisponible"}</small>
    <ArrowUpRight size={18} className={styles.fleche} aria-hidden="true" />
  </Link>;
}

function Demandes({ total, loyersAConfirmer = 0, critiques, apercu, indisponible, className, children, signalerOuverture }: Props & { signalerOuverture: (ouverte: boolean) => void }) {
  const [ouverte, ouvrir] = useState(false);
  const [visitee, visiter] = useState(false);
  const changerOuverture = (valeur: boolean) => {
    ouvrir(valeur);
    if (valeur) visiter(true);
    signalerOuverture(valeur);
  };
  const loyers = loyersAConfirmer > 0;
  const prioritaire = critiques > 0;
  const importante = loyers || prioritaire;
  const compteurLoyers = `${loyersAConfirmer} loyer${loyersAConfirmer > 1 ? "s" : ""} à confirmer`;
  const compteurDemandes = `${total} demande${total > 1 ? "s" : ""}`;
  const titrePrioritaire = apercu?.trim() || "Une action importante vous attend";
  const autres = Math.max(0, total - loyersAConfirmer);
  const autresDemandes = autres ? `${autres} autre${autres > 1 ? "s" : ""} demande${autres > 1 ? "s" : ""}${critiques ? `, dont ${critiques} prioritaire${critiques > 1 ? "s" : ""}` : ""}` : null;
  const libelle = prioritaire ? `${titrePrioritaire} — ${compteurDemandes} à vérifier, dont ${critiques} prioritaire${critiques > 1 ? "s" : ""}${loyers ? `, ${compteurLoyers}` : ""}`
    : loyers ? `Avez-vous reçu vos loyers ? ${compteurLoyers}${autresDemandes ? `, ${autresDemandes}` : ""}`
    : total ? `${compteurDemandes} à vérifier` : "Vérifications indisponibles";
  return <>
    <button type="button" className={`${className} ${styles.carte}`} data-critique={prioritaire} data-loyers={loyers} data-importante={importante}
      aria-haspopup="dialog" aria-expanded={ouverte} aria-label={`${libelle}${indisponible && (total || loyers) ? ", liste incomplète" : ""} — ${loyers && !prioritaire ? "ouvrir les loyers" : "ouvrir le détail"}`}
      onClick={() => changerOuverture(true)}>
      {prioritaire ? <>
        <span><CircleAlert size={18} aria-hidden="true" />{critiques} action{critiques > 1 ? "s" : ""} prioritaire{critiques > 1 ? "s" : ""}</span>
        <strong className={styles.question}>{titrePrioritaire}</strong>
        <small className={styles.apercu}>{[
          total > 1 ? compteurDemandes : "Voir l’action attendue",
          loyers ? compteurLoyers : null,
          indisponible ? "Liste incomplète" : null,
        ].filter(Boolean).join(" · ")}</small>
      </> : loyers ? <>
        <span><BellRing size={18} aria-hidden="true" />{compteurLoyers}</span>
        <strong className={styles.question}>Avez-vous reçu vos loyers ?</strong>
        <small className={styles.apercu}>{indisponible ? "Liste incomplète · Voir les loyers" : autresDemandes ?? "Voir les loyers"}</small>
      </> : <>
        <span><ListChecks size={18} aria-hidden="true" />À vérifier</span>
        <strong>{total ? <>{total} <em>demande{total > 1 ? "s" : ""}</em></> : <em>Indisponible</em>}</strong>
        <small className={styles.apercu}>{indisponible ? "Liste incomplète · Voir le détail" : apercu}</small>
      </>}
      <ArrowUpRight size={18} className={styles.fleche} aria-hidden="true" />
    </button>
    {visitee && <Modale titre={prioritaire ? "À traiter en priorité" : loyers ? "Loyers à confirmer" : "À vérifier"} tresLarge ouverte={ouverte} fermer={() => changerOuverture(false)}>
      <div className={styles.contenu}>{children}</div>
    </Modale>}
  </>;
}
