"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, FileText } from "lucide-react";
import { LecteurDocument } from "@/components/lecteur-document";
import { Modale } from "@/components/ui/modale";
import { useRacineEspace } from "@/components/racine-espace-contexte";
import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { TYPES_DIAGNOSTIC } from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import type { DiagnosticBail } from "@/lib/documents-bail";
import { preparerDiagnosticsBail, statutRapportBail, type ContexteDiagnosticsBail } from "@/lib/exigences-diagnostics-bail";
import styles from "./diagnostics-bail.module.css";

export function DiagnosticsBail({ orgId, bailId, lotId, bienId, diagnostics, aujourdhui, contexte, erreurContexte = false }: {
  orgId: string; bailId: string; lotId: string; bienId: string;
  diagnostics: DiagnosticBail[]; aujourdhui: string;
  contexte?: ContexteDiagnosticsBail; erreurContexte?: boolean;
}) {
  const racine = useRacineEspace();
  const base = `${racine}/${orgId}`;
  const modifierHref = lienLotDepuisBail(orgId, bienId, lotId, bailId, "diagnostics", 5, racine);
  const [apercu, setApercu] = useState<{ id: string; titre: string } | null>(null);
  const preparation = preparerDiagnosticsBail(diagnostics, aujourdhui, contexte, erreurContexte);
  const titre = (type: string) => TYPES_DIAGNOSTIC[type]?.libelle ?? type;

  function consulter(rapport: DiagnosticBail, ancien = false) {
    return rapport.document_id && <button type="button" onClick={() => setApercu({ id: rapport.document_id!, titre: titre(rapport.type) })}
      aria-label={`Voir ${titre(rapport.type)}${ancien ? ` du ${formaterDate(rapport.date_realisation)}` : ""}`}>
      <Eye size={15} aria-hidden="true" />Voir{ancien ? " le rapport" : ""}
    </button>;
  }

  return <div className={styles.diagnostics}>
    {preparation.contexteIndisponible && <p role="alert" className={styles.avertissement}>Les informations du logement n’ont pas pu être vérifiées. La liste des diagnostics à prévoir reste à confirmer.</p>}
    {preparation.anneeAPreciser && <p className={styles.avertissement}>L’année de construction manque pour préciser les diagnostics liés à l’ancienneté du bâtiment. <Link href={lienLotDepuisBail(orgId, bienId, lotId, bailId, "bien", 5, racine)}>Compléter le bâtiment</Link></p>}
    {preparation.referenceDate > aujourdhui && <p className={styles.reference}>Échéances vérifiées pour l’entrée prévue le {formaterDate(preparation.referenceDate)}.</p>}
    {preparation.lignes.length > 0 && <ul className={styles.liste}>{preparation.lignes.map(ligne => <li key={ligne.cle}>
      <div className={styles.ligne}>
        <FileText size={18} aria-hidden="true" className={styles.icone} />
        <div className={styles.identite}>
          <strong>{titre(ligne.type)}{ligne.type === "dpe" && ligne.rapport?.classe_dpe && <span className={styles.classe}>Classe {ligne.rapport.classe_dpe}</span>}</strong>
          <span className={styles.detail}>{ligne.niveau === "lot" ? "Logement" : "Bâtiment"}
            {ligne.exigence === "complementaire" && " · Complément"}
            {ligne.exigence === "a_preciser" && ligne.rapport && ["gaz", "electricite"].includes(ligne.type) && " · Installation à préciser"}
            {ligne.exigence === "non_concerne" && " · Selon l’installation déclarée"}
          </span>
          {ligne.precision && <span className={styles.detail}>{ligne.precision}</span>}
          {ligne.rapport && <span className={styles.detail}>Réalisé le {formaterDate(ligne.rapport.date_realisation)}{ligne.rapport.date_expiration ? ` · Expire le ${formaterDate(ligne.rapport.date_expiration)}` : " · Échéance non renseignée"}</span>}
        </div>
        <span className={styles.etat} data-ton={ligne.statut.ton}>{ligne.statut.libelle}</span>
        <div className={styles.actions}>
          {ligne.rapport && consulter(ligne.rapport)}
          {ligne.action && <Link href={ligne.destinationAction === "bien" ? lienLotDepuisBail(orgId, bienId, lotId, bailId, "bien", 5, racine) : modifierHref} aria-label={`${ligne.action} : ${titre(ligne.type)}`}>{ligne.action}</Link>}
        </div>
      </div>
      {ligne.anciens.length > 0 && <details className={styles.anciens}>
        <summary>Rapports précédents · {ligne.anciens.length}</summary>
        <ul>{ligne.anciens.map(rapport => <li key={rapport.id}>
          <span>Du {formaterDate(rapport.date_realisation)}{rapport.date_expiration ? ` · Expiration le ${formaterDate(rapport.date_expiration)}` : " · Échéance non renseignée"}<small>{statutRapportBail(rapport, aujourdhui).libelle}</small></span>
          <div className={styles.actions}>{consulter(rapport, true)}</div>
        </li>)}</ul>
      </details>}
    </li>)}</ul>}
    <Link className={styles.gerer} href={modifierHref}>Gérer les diagnostics dans le lot</Link>
    {apercu && <Modale titre={apercu.titre} tresLarge fermer={() => setApercu(null)}>
      <LecteurDocument fichier={`${base}/documents/${apercu.id}/fichier`} titre={apercu.titre} mime={null} presentation="fiche" />
    </Modale>}
  </div>;
}
