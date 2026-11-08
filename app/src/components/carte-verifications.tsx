"use client";

import Link from "next/link";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BellRing, Building2, CircleAlert, ListChecks } from "lucide-react";
import { Modale } from "@/components/ui/modale";
import styles from "./carte-verifications.module.css";

export const SessionVerifications = createContext(0);

type Props = {
  base: string;
  patrimoine: { biens: number; lots: number } | null;
  total: number;
  loyersAConfirmer?: number;
  paliersLoyers?: string;
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
  const [ouverte, ouvrir] = useState(false);
  const [session, changerSession] = useState(0);
  const [titre, changerTitre] = useState("");
  const etaitOuverte = useRef(false);
  const lienPatrimoine = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (etaitOuverte.current && !ouverte && !demandeEnFenetre) lienPatrimoine.current?.focus({ preventScroll: true });
    etaitOuverte.current = ouverte;
  }, [ouverte, demandeEnFenetre]);

  function voirDemandes() {
    changerTitre(props.critiques ? "À traiter en priorité" : props.loyersAConfirmer ? "Loyers à confirmer" : "À vérifier");
    changerSession(n => n + 1);
    ouvrir(true);
  }
  let carte: ReactNode;
  // Le lien comme le bouton n'ont pas d'aria-label : leur nom accessible est le texte visible, dans son ordre (audit du
  // 27/10, TRV-06 : un aria-label réordonné le contredisait, label-content-name-mismatch).
  if (lienTaches) carte = <Link ref={lienPatrimoine} href={lienTaches} className={`${props.className} ${styles.carte} ${styles.lienTaches}`}>
    <span><ListChecks size={18} aria-hidden="true" />À vérifier</span>
    <strong>{props.total} <em>demande{props.total > 1 ? "s" : ""}</em></strong>
    <small className={styles.apercu}>Voir mes tâches</small>
    <ArrowRight size={18} className={styles.fleche} aria-hidden="true" />
  </Link>;
  else if (aVerifier) carte = <Demandes {...props} ouverte={ouverte} ouvrir={voirDemandes} />;
  else {
    const { patrimoine, base, className } = props;
    carte = <Link ref={lienPatrimoine} href={`${base}/parc`} className={`${className} ${styles.repos}`}>
      <span><Building2 size={18} aria-hidden="true" />Patrimoine</span>
      <strong>{patrimoine ? <>{patrimoine.biens} <em>bien{patrimoine.biens > 1 ? "s" : ""}</em></> : "—"}</strong>
      <small>{patrimoine ? `${patrimoine.lots} lot${patrimoine.lots > 1 ? "s" : ""}` : "Patrimoine indisponible"}</small>
      <ArrowRight size={18} className={styles.fleche} aria-hidden="true" />
    </Link>;
  }
  return <>{carte}
    {session > 0 && (ouverte || demandeEnFenetre) && <Modale titre={titre} tresLarge ouverte={ouverte} fermer={() => ouvrir(false)}>
      <SessionVerifications.Provider value={session}><div className={styles.contenu}>{props.children}</div></SessionVerifications.Provider>
    </Modale>}
  </>;
}

function Demandes({ total, loyersAConfirmer = 0, paliersLoyers, critiques, apercu, indisponible, className, ouverte, ouvrir }: Props & { ouverte: boolean; ouvrir: () => void }) {
  const loyers = loyersAConfirmer > 0;
  const prioritaire = critiques > 0;
  const importante = loyers || prioritaire;
  const compteurLoyers = `${loyersAConfirmer} loyer${loyersAConfirmer > 1 ? "s" : ""} à confirmer`;
  const compteurDemandes = `${total} demande${total > 1 ? "s" : ""}`;
  const titrePrioritaire = apercu?.trim() || "Une action importante vous attend";
  const autres = Math.max(0, total - loyersAConfirmer);
  const autresDemandes = autres ? `${autres} autre${autres > 1 ? "s" : ""} demande${autres > 1 ? "s" : ""}${critiques ? `, dont ${critiques} prioritaire${critiques > 1 ? "s" : ""}` : ""}` : null;
  return <button type="button" className={`${className} ${styles.carte}`} data-critique={prioritaire} data-loyers={loyers} data-importante={importante}
      aria-haspopup="dialog" aria-expanded={ouverte}
      onClick={ouvrir}>
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
        {(indisponible || autresDemandes || !paliersLoyers) && <small className={styles.apercu}>{indisponible ? "Liste incomplète · Voir les loyers" : autresDemandes ?? "Voir les loyers"}</small>}
      </> : <>
        <span><ListChecks size={18} aria-hidden="true" />À vérifier</span>
        <strong>{total ? <>{total} <em>demande{total > 1 ? "s" : ""}</em></> : <em>Indisponible</em>}</strong>
        <small className={styles.apercu}>{indisponible ? "Liste incomplète · Voir le détail" : apercu}</small>
      </>}
      {loyers && paliersLoyers && <small className={styles.paliers}>{paliersLoyers.includes(" · ") ? "Étapes : " : paliersLoyers === "Échéance du loyer" || paliersLoyers === "Suivi à vérifier" ? "" : "Prochaine étape : "}{paliersLoyers}</small>}
      <ArrowRight size={18} className={styles.fleche} aria-hidden="true" />
    </button>;
}
