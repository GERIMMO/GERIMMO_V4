"use client";
import Link from "next/link";
import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { FileCheck2, ExternalLink } from "lucide-react";
import { TYPES_DIAGNOSTIC } from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import { statutPieceDiagnostic, type DiagnosticBail } from "@/lib/documents-bail";
import styles from "./documents-bail.module.css";

export function DiagnosticsBail({orgId,bailId,lotId,bienId,diagnostics,aujourdhui}:{orgId:string;bailId:string;lotId:string;bienId:string;diagnostics:DiagnosticBail[];aujourdhui:string}) {
  const modifierHref = lienLotDepuisBail(orgId, bienId, lotId, bailId, "diagnostics", 5);
  return <>
    {diagnostics.length ? <ul className={styles.liste}>{diagnostics.map(d=>{
      const statut=statutPieceDiagnostic(d,aujourdhui);
      return <li key={d.id}>
        <FileCheck2 size={19} aria-hidden="true"/>
        <div className={styles.identite}><strong>{TYPES_DIAGNOSTIC[d.type]?.libelle??d.type}{d.type==="dpe"&&d.classe_dpe&&<span className={styles.classe}>Classe {d.classe_dpe}</span>}</strong>
          <small>{d.niveau==="lot"?"Logement":"Bâtiment"} · Réalisé le {formaterDate(d.date_realisation)}<br/>{d.date_expiration?`Expiration : ${formaterDate(d.date_expiration)}`:TYPES_DIAGNOSTIC[d.type]?.validite_mois!=null?"Expiration non renseignée":"Sans échéance renseignée"}</small>
        </div>
        <span className={styles.etat} data-ton={statut.ton}>{statut.libelle}</span>
        <div className={styles.actions}>
          {d.document_id&&<a href={`/agence/${orgId}/documents/${d.document_id}/fichier`} target="_blank" rel="noreferrer" aria-label={`Consulter le diagnostic ${TYPES_DIAGNOSTIC[d.type]?.libelle??d.type}`}><ExternalLink size={14} aria-hidden="true"/>Consulter</a>}
          {d.type === "dpe" && !d.classe_dpe && <Link href={modifierHref}>Compléter la classe dans le lot</Link>}
        </div>
      </li>;
    })}</ul>:<p className={styles.vide}>Aucun diagnostic enregistré pour ce logement ou ce bâtiment.</p>}
    <Link className="btn-secondaire" href={modifierHref}>Gérer les diagnostics dans le lot</Link>
  </>;
}
