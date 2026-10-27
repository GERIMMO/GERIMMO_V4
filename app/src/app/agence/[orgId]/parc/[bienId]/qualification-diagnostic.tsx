"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { enregistrerQualificationDiagnostic } from "@/app/actions/qualification-diagnostic";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { type QualificationDiagnostic } from "@/lib/qualification-diagnostics";
import { formaterDate } from "@/lib/ged";
import { jourAParis } from "@/lib/presentation-document";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import styles from "./lignes-diagnostics.module.css";

export function QualificationDuDiagnostic({ orgId, bienId, lotId, type, qualification, lectureSeule, onEnregistreAction }: {
  orgId: string; bienId: string; lotId: string;
  type: "electricite" | "gaz";
  qualification?: QualificationDiagnostic;
  lectureSeule: boolean;
  onEnregistreAction: (qualification: QualificationDiagnostic) => void;
}) {
  const [modifier, setModifier] = useState(false);
  const [datePrecise, setDatePrecise] = useState(qualification?.situation === "date_connue");
  const [anneeSaisie, setAnneeSaisie] = useState(String(qualification?.annee_installation ?? qualification?.date_installation?.slice(0, 4) ?? ""));
  const [sansGaz, setSansGaz] = useState(qualification?.situation === "absente");
  const [dateSaisie, setDateSaisie] = useState(qualification?.date_installation ?? "");
  const envoyee = useRef<QualificationDiagnostic | null>(null);
  const annoncee = useRef(0);
  const action = enregistrerQualificationDiagnostic.bind(null, orgId, bienId, lotId);
  const { etat, enCours, soumettre, version } = useActionFormulaire(async (precedent, donnees) => {
    const resultat = await action(precedent, donnees);
    if (resultat.succes && !resultat.erreur) envoyee.current = {
      type,
      situation: donnees.get("situation") as QualificationDiagnostic["situation"],
      date_installation: donnees.get("situation") === "date_connue" ? String(donnees.get("date_installation")) : null,
      annee_installation: donnees.get("situation") === "annee_connue" ? Number(donnees.get("annee_installation")) : null,
    };
    return resultat;
  }, true);
  useEffect(() => {
    if (version <= annoncee.current || !envoyee.current) return;
    annoncee.current = version;
    setModifier(false);
    onEnregistreAction(envoyee.current);
  }, [version, onEnregistreAction]);

  const resume = qualification?.situation === "absente" ? "Aucune installation de gaz déclarée."
    : qualification?.situation === "plus_15_ans" ? "Installation de plus de 15 ans : rapport à fournir."
    : qualification?.situation === "date_connue" && qualification.date_installation ? `Installation mise en service le ${formaterDate(qualification.date_installation)}.`
    : qualification?.situation === "annee_connue" && qualification.annee_installation ? `Installation de ${qualification.annee_installation}.${Number(jourAParis().slice(0, 4)) - qualification.annee_installation === 15 ? " Le seuil de 15 ans se situe cette année ; la date exacte permet de préciser le besoin." : ""}`
    : "Âge à vérifier sur une facture, une attestation ou auprès d’un professionnel.";

  if (lectureSeule || (qualification && !modifier)) return <div className={styles.qualificationResume}>
    <p>{resume}</p>
    {!lectureSeule && <Button type="button" size="sm" variant="ghost" onClick={() => { setDateSaisie(qualification?.date_installation ?? ""); setAnneeSaisie(String(qualification?.annee_installation ?? qualification?.date_installation?.slice(0, 4) ?? "")); setDatePrecise(qualification?.situation === "date_connue"); setSansGaz(qualification?.situation === "absente"); setModifier(true); }} aria-label={`Modifier la réponse : ${type === "gaz" ? "gaz" : "électricité"}`}>Modifier</Button>}
  </div>;

  const situation = sansGaz ? "absente"
    : datePrecise ? dateSaisie ? "date_connue" : "inconnue"
    : anneeSaisie.trim() ? "annee_connue" : "inconnue";
  return <form data-saisie-confirmee onSubmit={soumettre} className={styles.qualification}>
    <input type="hidden" name="type" value={type} />
    <input type="hidden" name="situation" value={situation} />
    <fieldset disabled={enCours}>
      {!sansGaz && <>
        <label htmlFor={`installation-${type}`}>{datePrecise ? "Date d’installation" : "Année d’installation"}</label>
        <div className={styles.actions}>
          {datePrecise
            ? <input id={`installation-${type}`} type="date" name="date_installation" min="1800-01-01" max={jourAParis()} value={dateSaisie} onChange={event => setDateSaisie(event.target.value)} />
            : <input id={`installation-${type}`} className={styles.champAnnee} type="text" inputMode="numeric" name="annee_installation" pattern="[0-9]{4}" maxLength={4} placeholder="Ex. 2018" value={anneeSaisie} onChange={event => setAnneeSaisie(event.target.value)} aria-describedby={`installation-aide-${type}`} />}
          <BoutonEnvoi type="submit" size="sm">{enCours ? "Enregistrement…" : "Enregistrer"}</BoutonEnvoi>
          {modifier && <Button type="button" size="sm" variant="ghost" onClick={() => setModifier(false)}>Annuler</Button>}
        </div>
        <div className={styles.precisionInstallation}>
          <span id={`installation-aide-${type}`}>Laissez vide si vous ne savez pas.</span>
          <button type="button" onClick={() => setDatePrecise(v => !v)}>{datePrecise ? "Indiquer seulement l’année" : "Préciser une date exacte"}</button>
        </div>
      </>}
      {type === "gaz" && <label className={styles.sansGaz}>
        <input type="checkbox" name="absence_gaz" checked={sansGaz} onChange={event => {
          const cochee = event.target.checked;
          const formulaire = event.currentTarget.form;
          // requestSubmit doit lire « absente » et ignorer l’ancien champ année,
          // même si celui-ci contenait une saisie incomplète.
          flushSync(() => setSansGaz(cochee));
          if (cochee) formulaire?.requestSubmit();
        }} />
        Pas d’installation de gaz
      </label>}
      {sansGaz && <div className={styles.actions}>
        <BoutonEnvoi type="submit" size="sm">{enCours ? "Enregistrement…" : etat.erreur ? "Réessayer" : "Enregistrer"}</BoutonEnvoi>
        {modifier && <Button type="button" size="sm" variant="ghost" onClick={() => setModifier(false)}>Annuler</Button>}
      </div>}
    </fieldset>
    {enCours && <span role="status" className="sr-only">Enregistrement en cours.</span>}
    {etat.erreur && <p className={styles.erreurQualification} role="alert">{etat.erreur}</p>}
  </form>;
}
