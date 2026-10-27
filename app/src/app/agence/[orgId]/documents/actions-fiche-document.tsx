"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Link2, RefreshCw, Upload, Users, X } from "lucide-react";
import { FormulaireRattacher, type FichesRattachables } from "./formulaire-rattacher";
import { FormulaireRemplacer } from "./formulaire-remplacer";
import { CircuitDocument, peutPartagerDocument, type DemandeDuDocument } from "./circuit-document";
import styles from "./documents-proprietaire.module.css";

type Panneau = "liens" | "version" | "partage";
type Props = {
  orgId: string;
  documentId: string;
  type: string;
  expireLe: string | null;
  remplace: boolean;
  // DOC-03 : rapport de diagnostic en service — il se renouvelle sur sa fiche, pas par une nouvelle version ici.
  renouvelerSurFiche?: { href: string; libelle: string };
  fiches: FichesRattachables;
  bauxTronques: boolean;
  liens: { cle: string; libelle: string }[];
  partageLe: string | null;
  signataires: { id: string; nom: string }[];
  demandes: DemandeDuDocument[];
  lienFermer: string;
};

/** Un seul panneau à la fois ; les formulaires déjà ouverts restent montés pour garder la saisie. */
export function ActionsFicheDocument(props: Props) {
  const identifiant = useId();
  const [actif, setActif] = useState<Panneau | null>(null);
  const [visites, setVisites] = useState<Panneau[]>([]);
  const boutons = useRef<Partial<Record<Panneau, HTMLButtonElement | null>>>({});
  const panneaux = useRef<Partial<Record<Panneau, HTMLDivElement | null>>>({});
  const circuitVisible = peutPartagerDocument(props.type, props.signataires.length) || props.demandes.length > 0;
  const enAttente = props.demandes.filter(d => !d.signee_le).length;
  const actions = [
    { cle: "liens" as const, libelle: "Lier à une fiche", titre: "Lier ce document", Icone: Link2 },
    ...(!props.remplace && !props.renouvelerSurFiche ? [{ cle: "version" as const, libelle: "Nouvelle version", titre: "Ajouter une nouvelle version", Icone: Upload }] : []),
    ...(circuitVisible ? [{ cle: "partage" as const, libelle: "Partage et signatures", titre: "Partage et signatures", Icone: Users }] : []),
  ];

  useEffect(() => {
    if (!actif) return;
    const panneau = panneaux.current[actif];
    const cible = panneau?.querySelector<HTMLElement>('select, input:not([type="hidden"]), h3');
    cible?.focus({ preventScroll: true });
  }, [actif]);

  // Une dernière demande annulée peut retirer le panneau au rafraîchissement.
  useEffect(() => {
    if (actif === "partage" && !circuitVisible && document.activeElement === document.body) {
      boutons.current.liens?.focus({ preventScroll: true });
    }
  }, [actif, circuitVisible]);

  function fermer(cle: Panneau) {
    const panneau = panneaux.current[cle];
    // Une réponse tardive ne ferme pas un autre panneau ouvert entre-temps.
    if (!panneau || panneau.hidden) return;
    const rendreFocus = panneau.contains(document.activeElement) || document.activeElement === boutons.current[cle] || document.activeElement === document.body;
    setActif(null);
    if (rendreFocus) boutons.current[cle]?.focus({ preventScroll: true });
  }

  function ouvrir(cle: Panneau) {
    if (actif === cle) { fermer(cle); return; }
    setVisites(v => v.includes(cle) ? v : [...v, cle]);
    setActif(cle);
  }

  return <div className={styles.actionsFiche}>
    <div className={styles.barreActionsFiche} role="group" aria-label="Actions du document">
      {actions.map(({ cle, libelle, Icone }) => <button
        key={cle}
        ref={element => { boutons.current[cle] = element; }}
        type="button"
        aria-expanded={actif === cle}
        aria-controls={`${identifiant}-${cle}`}
        onClick={() => ouvrir(cle)}
      >
        <Icone size={16} aria-hidden="true" />{libelle}
        {cle === "partage" && enAttente > 0 && <span className={styles.compteurSignatures}>{enAttente}<span className="sr-only"> en attente</span></span>}
      </button>)}
      {props.renouvelerSurFiche && <Link href={props.renouvelerSurFiche.href}><RefreshCw size={16} aria-hidden="true" />{props.renouvelerSurFiche.libelle}</Link>}
    </div>
    {actions.map(({ cle, titre }) => <div
      key={cle}
      id={`${identifiant}-${cle}`}
      ref={element => { panneaux.current[cle] = element; }}
      hidden={actif !== cle}
      className={styles.panneauAction}
      role="region"
      aria-labelledby={`${identifiant}-${cle}-titre`}
    >
      {visites.includes(cle) && <>
        <div className={styles.enteteAction}>
          <h3 id={`${identifiant}-${cle}-titre`} tabIndex={-1}>{titre}</h3>
          <button type="button" aria-label={`Fermer : ${titre}`} onClick={() => fermer(cle)}><X size={18} aria-hidden="true" /></button>
        </div>
        {cle === "liens" && <>
          {props.liens.length > 0 && <div className={styles.liensDocument}><span>Déjà lié à</span><ul>{props.liens.map(l => <li key={l.cle}>{l.libelle}</li>)}</ul></div>}
          <FormulaireRattacher orgId={props.orgId} documentId={props.documentId} fiches={props.fiches} bauxTronques={props.bauxTronques} integre onFermer={() => fermer(cle)} />
        </>}
        {cle === "version" && <FormulaireRemplacer orgId={props.orgId} documentId={props.documentId} expireLe={props.expireLe} retourFiltres={props.lienFermer.split("?")[1] ?? ""} integre onFermer={() => fermer(cle)} />}
        {cle === "partage" && <CircuitDocument orgId={props.orgId} documentId={props.documentId} type={props.type} partageLe={props.partageLe} signataires={props.signataires} demandes={props.demandes} lienFermer={props.lienFermer} integre />}
      </>}
    </div>)}
  </div>;
}
