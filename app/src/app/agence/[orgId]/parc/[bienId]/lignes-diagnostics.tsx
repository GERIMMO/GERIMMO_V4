"use client";

import { useState } from "react";
import {
  TYPES_DIAGNOSTIC,
  type NiveauDiagnostic,
} from "@/lib/parc";
import { presentationDiagnostic, diagnosticConditionnel } from "@/lib/presentation-diagnostics";
import styles from "./lignes-diagnostics.module.css";
import { formaterDate } from "@/lib/ged";
import { Button, buttonVariants } from "@/components/ui/button";
import { BadgeStatut } from "@/components/badge-statut";
import { FormulaireClasseDpeLot } from "./formulaire-classe-dpe-lot";
import { FormulaireDiagnostic } from "./formulaire-diagnostic";
import { useBaseEspace } from "@/components/racine-espace-contexte";

export type DiagnosticDepose = {
  id: string;
  type: string;
  date_realisation: string;
  date_expiration: string | null;
  diagnostiqueur: string | null;
  document_id: string | null;
  classe_dpe?: string | null;
};

// Une ligne par diagnostic ATTENDU, déposé ou non — le manque se voit au même
// endroit que le reste, au lieu d'être relégué à une phrase sous la liste.
// Chaque ligne porte son action : déposer si absent, consulter et remplacer
// sinon (le remplacement archive l'ancien et lève seul le blocage, RM-0.8.5).
export function LignesDiagnostics({
  orgId,
  bienId,
  lotId,
  niveau,
  attendus,
  diagnostics,
  lectureSeule = false,
}: {
  orgId: string;
  bienId: string;
  lotId: string | null;
  niveau: NiveauDiagnostic;
  attendus: string[];
  diagnostics: DiagnosticDepose[];
  lectureSeule?: boolean;
}) {
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
  const [classeOuverte, setClasseOuverte] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [commences, setCommences] = useState<Set<string>>(() => new Set());
  function basculerDepot(type: string) {
    setCommences(types => new Set([...types, type]));
    setOuvert(o => o === type ? null : type);
  }

  // Les attendus d'abord, puis les diagnostics déposés hors obligation
  const deposesParType = new Map(diagnostics.map((d) => [d.type, d]));
  const enPlus = diagnostics
    .map((d) => d.type)
    .filter((t) => !attendus.includes(t));
  const lignes = [...attendus, ...new Set(enPlus)];

  if (lignes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun diagnostic attendu à ce niveau.
      </p>
    );
  }

  return <ul className={styles.liste}>
    {lignes.map(type => {
      const d = deposesParType.get(type);
      const presentation = presentationDiagnostic(type, d, attendus.includes(type));
      const nom = TYPES_DIAGNOSTIC[type]?.libelle ?? type;
      const renouveler = ["expire", "expire_bientot"].includes(presentation.etat);
      const aide = type === "gaz" ? "À prévoir si le logement possède une installation de gaz de plus de 15 ans. Un chauffage électrique ne suffit pas à exclure le gaz." : type === "electricite" ? "À prévoir pour une installation électrique de plus de 15 ans." : "Vérifiez les obligations locales avant de commander ce diagnostic.";
      return <li key={type} className={styles.ligne} data-etat={presentation.etat}>
        <div className={styles.identite}><strong>{nom}</strong><BadgeStatut ton={presentation.ton}>{presentation.libelle}</BadgeStatut></div>
        <p className={styles.date}>{d?.date_expiration
          ? `${presentation.etat === "expire" ? "Échu" : "Échéance"} le ${formaterDate(d.date_expiration)}`
          : d ? "Aucune échéance renseignée" : diagnosticConditionnel(type) ? aide : lectureSeule ? "Aucun fichier déposé." : "Ajoutez le fichier pour le retrouver ici."}
          {type === "dpe" && d?.classe_dpe && <> · Classe {d.classe_dpe}</>}
        </p>
        <div className={styles.actions}>
          {d?.document_id && <a href={`${base}/documents/${d.document_id}/fichier`} target="_blank" rel="noreferrer"
            aria-label={`Voir le document : ${nom}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Voir le document</a>}
          {!lectureSeule && (!d?.document_id || renouveler || ouvert === type) && <Button type="button" size="sm" variant="outline" aria-expanded={ouvert === type}
            onClick={() => basculerDepot(type)}>{ouvert === type ? "Fermer le dépôt" : renouveler ? "Renouveler" : "Ajouter le fichier"}</Button>}
        </div>
        {d && <details className={styles.details}>
          <summary>{lectureSeule ? "Détails du diagnostic" : "Détails et modifications"}</summary>
          <p>Réalisé le {formaterDate(d.date_realisation)}{d.diagnostiqueur ? ` · ${d.diagnostiqueur}` : ""}</p>
          <div className={styles.actions}>
            {!lectureSeule && d.document_id && !renouveler && <Button type="button" size="sm" variant="outline" onClick={() => basculerDepot(type)}>{ouvert === type ? "Fermer le dépôt" : "Remplacer le fichier"}</Button>}
            {!lectureSeule && type === "dpe" && lotId && niveau === "lot" && <Button type="button" size="sm" variant="outline" aria-expanded={classeOuverte} onClick={() => setClasseOuverte(v => !v)}>{d.classe_dpe ? "Modifier la classe DPE" : "Compléter la classe DPE"}</Button>}
          </div>
          {!lectureSeule && type === "dpe" && lotId && niveau === "lot" && <div hidden={!classeOuverte}><FormulaireClasseDpeLot orgId={orgId} lotId={lotId} diagnosticId={d.id} classe={d.classe_dpe ?? null} /></div>}
        </details>}
        {/* Ne pas démonter un dépôt commencé en refermant sa rubrique. */}
        {!lectureSeule && commences.has(type) && <div hidden={ouvert !== type} className={styles.depot}><FormulaireDiagnostic orgId={orgId} bienId={bienId} lotId={lotId} niveau={niveau} typeInitial={type} /></div>}
      </li>;
    })}
  </ul>;
}
