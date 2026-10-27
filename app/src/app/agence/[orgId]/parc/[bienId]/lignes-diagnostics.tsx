"use client";

import { useRef, useState } from "react";
import { Modale } from "@/components/ui/modale";
import { LecteurDocument } from "@/components/lecteur-document";
import { CheckCircle2 } from "lucide-react";
import {
  TYPES_DIAGNOSTIC,
  type NiveauDiagnostic,
} from "@/lib/parc";
import { presentationDiagnostic, diagnosticConditionnel } from "@/lib/presentation-diagnostics";
import { qualificationsDiagnosticsIdentiques, type QualificationDiagnostic } from "@/lib/qualification-diagnostics";
import { QualificationDuDiagnostic } from "./qualification-diagnostic";
import styles from "./lignes-diagnostics.module.css";
import { formaterDate } from "@/lib/ged";
import { Button } from "@/components/ui/button";
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
  qualifications = [],
  qualificationIndisponible = false,
  compact = false,
  anneeConstruction = null,
}: {
  orgId: string;
  bienId: string;
  lotId: string | null;
  niveau: NiveauDiagnostic;
  attendus: string[];
  diagnostics: DiagnosticDepose[];
  lectureSeule?: boolean;
  qualifications?: QualificationDiagnostic[];
  qualificationIndisponible?: boolean;
  compact?: boolean;
  // DOC-12 : l'année de construction connue, proposée comme année d'installation d'un bâtiment récent.
  anneeConstruction?: number | null;
}) {
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
  const [apercu, setApercu] = useState<{ id: string; nom: string } | null>(null);
  const [classeOuverte, setClasseOuverte] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [commences, setCommences] = useState<Set<string>>(() => new Set());
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [reponses, setReponses] = useState<Record<string, QualificationDiagnostic>>({});
  const [annonce, setAnnonce] = useState("");
  const empreinteQualifications = JSON.stringify(qualifications);
  const [derniereLecture, setDerniereLecture] = useState(empreinteQualifications);
  const titres = useRef<Record<string, HTMLElement | null>>({});
  if (derniereLecture !== empreinteQualifications) {
    setDerniereLecture(empreinteQualifications);
    const acquittees = Object.keys(reponses).filter(type => qualifications.some(q =>
      qualificationsDiagnosticsIdentiques(q, reponses[type])));
    // Le retour serveur reprend la main après avoir confirmé notre réponse.
    if (acquittees.length > 0) setReponses(courant => Object.fromEntries(Object.entries(courant).filter(([type]) => !acquittees.includes(type))));
  }
  function basculerDepot(type: string) {
    setCommences(types => new Set([...types, type]));
    setOuvert(o => o === type ? null : type);
    setConfirmations(messages => {
      const suivant = { ...messages };
      delete suivant[type];
      return suivant;
    });
  }
  function confirmerDepot(type: string, message: string) {
    const titre = titres.current[type];
    const ligne = titre?.closest("li");
    const rendreFocus = ouvert === type &&
      (document.activeElement === document.body || ligne?.contains(document.activeElement));
    setConfirmations(messages => ({ ...messages, [type]: message }));
    // Une réponse à A ne doit pas refermer B entre-temps ouvert par l'utilisateur.
    setOuvert(courant => courant === type ? null : courant);
    if (rendreFocus) titre?.focus({ preventScroll: true });
  }

  // Les attendus d'abord, puis les diagnostics déposés hors obligation
  const deposesParType = new Map(diagnostics.map((d) => [d.type, d]));
  const enPlus = diagnostics
    .map((d) => d.type)
    .filter((t) => !attendus.includes(t));
  const complementaires = [...new Set([...enPlus, ...(niveau === "bien" ? ["termites"] : [])])].filter(type => !attendus.includes(type));
  const lignes = [...attendus, ...complementaires];

  if (lignes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun diagnostic attendu à ce niveau.
      </p>
    );
  }

  function rendreLigne(type: string) {
      const d = deposesParType.get(type);
      const qualification = reponses[type] ?? qualifications.find(q => q.type === type);
      const presentation = presentationDiagnostic(type, d, attendus.includes(type), qualification);
      const question = !d && diagnosticConditionnel(type) && niveau === "lot" && lotId;
      const nom = TYPES_DIAGNOSTIC[type]?.libelle ?? type;
      const renouveler = ["expire", "expire_bientot"].includes(presentation.etat);
      return <li key={type} className={styles.ligne} data-etat={presentation.etat}>
        <div className={styles.identite}>
          {["valide", "non_concerne"].includes(presentation.etat) && <CheckCircle2 className={styles.iconeValide} size={18} aria-hidden="true" />}
          <strong ref={element => { titres.current[type] = element; }} tabIndex={-1}>{nom}</strong>
          <BadgeStatut ton={presentation.ton}>{presentation.libelle}</BadgeStatut>
        </div>
        {!question && (!compact || d || type === "termites" || lectureSeule) && <p className={styles.date}>{d?.date_expiration
          ? `${presentation.etat === "expire" ? "Échu" : "Échéance"} le ${formaterDate(d.date_expiration)}`
          : d ? "Aucune échéance renseignée" : type === "termites" ? "Hors dossier de location. Conservez ici un éventuel rapport termites." : lectureSeule ? "Aucun fichier déposé." : "Ajoutez le fichier pour le retrouver ici."}
          {type === "dpe" && d?.classe_dpe && <> · Classe {d.classe_dpe}</>}
        </p>}
        {question && <QualificationDuDiagnostic orgId={orgId} bienId={bienId} lotId={lotId!}
          type={type as "gaz" | "electricite"} qualification={qualification} anneeConstruction={anneeConstruction} lectureSeule={lectureSeule || qualificationIndisponible}
          onEnregistreAction={reponse => {
            const titre = titres.current[type];
            const rendreFocus = document.activeElement === document.body || titre?.closest("li")?.contains(document.activeElement);
            const resultat = presentationDiagnostic(type, undefined, true, reponse);
            const dejaRelue = qualifications.some(q => qualificationsDiagnosticsIdentiques(q, reponse));
            setReponses(courant => dejaRelue
              ? Object.fromEntries(Object.entries(courant).filter(([cle]) => cle !== type))
              : { ...courant, [type]: reponse });
            setAnnonce(`${nom} : réponse enregistrée. ${resultat.libelle}.`);
            if (resultat.etat === "a_ajouter" && rendreFocus) {
              setCommences(types => new Set([...types, type]));
              setOuvert(courant => courant === null || courant === type ? type : courant);
            }
            if (resultat.etat === "non_concerne") setOuvert(courant => courant === type ? null : courant);
            if (rendreFocus) titre?.focus({ preventScroll: true });
          }} />}
        {confirmations[type] && <p className={styles.confirmation} role="status">{confirmations[type]}</p>}
        <div className={styles.actions}>
          {/* DOC-09 : même aperçu intégré sur la fiche bien que sur la fiche lot, au lieu d'un nouvel onglet. */}
          {d?.document_id && <Button type="button" variant="outline" size="sm" aria-label={`Voir le document : ${nom}`} onClick={() => setApercu({ id: d.document_id!, nom })}>{compact ? "Voir" : "Voir le document"}</Button>}
          {!lectureSeule && presentation.etat !== "non_concerne" && (!d?.document_id || renouveler || ouvert === type) && <Button type="button" size="sm" variant={question && presentation.etat === "a_confirmer" && ouvert !== type ? "ghost" : "outline"} aria-expanded={ouvert === type}
            onClick={() => basculerDepot(type)}>{ouvert === type ? "Fermer le dépôt" : renouveler ? "Renouveler" : question && presentation.etat === "a_confirmer" ? "J’ai déjà le rapport" : "Ajouter le fichier"}</Button>}
        </div>
        {d && <details className={styles.details}>
          <summary>{compact ? "Détails" : lectureSeule ? "Détails du diagnostic" : "Détails et modifications"}</summary>
          <p>Réalisé le {formaterDate(d.date_realisation)}{d.diagnostiqueur ? ` · ${d.diagnostiqueur}` : ""}</p>
          <div className={styles.actions}>
            {!lectureSeule && d.document_id && !renouveler && <Button type="button" size="sm" variant="outline" onClick={() => basculerDepot(type)}>{ouvert === type ? "Fermer le dépôt" : "Remplacer le fichier"}</Button>}
            {!lectureSeule && type === "dpe" && lotId && niveau === "lot" && <Button type="button" size="sm" variant="outline" aria-expanded={classeOuverte} onClick={() => setClasseOuverte(v => !v)}>{d.classe_dpe ? "Modifier la classe DPE" : "Compléter la classe DPE"}</Button>}
          </div>
          {!lectureSeule && type === "dpe" && lotId && niveau === "lot" && <div hidden={!classeOuverte}><FormulaireClasseDpeLot orgId={orgId} lotId={lotId} diagnosticId={d.id} classe={d.classe_dpe ?? null} /></div>}
        </details>}
        {/* Ne pas démonter un dépôt commencé en refermant sa rubrique. */}
        {!lectureSeule && commences.has(type) && <div hidden={ouvert !== type} className={styles.depot}><FormulaireDiagnostic orgId={orgId} bienId={bienId} lotId={lotId} niveau={niveau} typeInitial={type} onDepotConfirmeAction={message => confirmerDepot(type, message)} /></div>}
      </li>;
  }

  return <div className={compact ? styles.compact : undefined}>
    <span role="status" className="sr-only">{annonce}</span>
    {qualificationIndisponible && <p role="alert" className={styles.erreurQualification}>Vos réponses sont momentanément indisponibles. Rechargez la page avant de les modifier.</p>}
    {attendus.length > 0 && <ul className={styles.liste}>{attendus.map(rendreLigne)}</ul>}
    {complementaires.length > 0 && <details className={styles.complementaires}>
      <summary>Documents complémentaires{enPlus.length > 0 ? ` · ${enPlus.length} déposé${enPlus.length > 1 ? "s" : ""}` : ""}</summary>
      <ul className={styles.liste}>{complementaires.map(rendreLigne)}</ul>
    </details>}
    {apercu && <Modale titre={apercu.nom} tresLarge fermer={() => setApercu(null)}>
      <LecteurDocument fichier={`${base}/documents/${apercu.id}/fichier`} titre={apercu.nom} mime={null} presentation="fiche" />
    </Modale>}
  </div>;
}
