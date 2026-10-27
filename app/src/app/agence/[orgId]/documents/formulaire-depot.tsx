"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, ChevronDown, FileUp } from "lucide-react";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { deposerDocument, type EtatDepot } from "@/app/actions/ged";
import { TYPES_DEPOSABLES, TYPES_DOCUMENT } from "@/lib/ged";
import { titreDepuisFichier, typeDepotAutorise, typeSuggereParNom } from "@/lib/preparation-depot-document";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";
import { useBaseEspace } from "@/components/racine-espace-contexte";
import styles from "./formulaire-depot.module.css";

type Personne = { id: string; nom: string; prenom: string | null };
type Props = {
  orgId: string;
  personnes: Personne[];
  lienAnnuler?: string;
  typeInitial?: string;
};

export function FormulaireDepot(props: Props) {
  const base = useBaseEspace(props.orgId);
  const { etat, soumettre, enCours, version } = useActionFormulaire<EtatDepot>(deposerDocument.bind(null, props.orgId), true);
  const [resultatMasque, setResultatMasque] = useState<EtatDepot | null>(null);
  const [versionEnvoyee, setVersionEnvoyee] = useState(0);
  const succesAffiche = Boolean(etat.succes) && resultatMasque !== etat;
  const lienDocument = etat.documentId ? `${base}/documents?sel=${encodeURIComponent(etat.documentId)}` : props.lienAnnuler;

  // La saisie n'est réinitialisée que si la réponse confirme exactement cet envoi.
  // En erreur, le fichier sélectionné et les champs restent en place.
  if (succesAffiche && version > versionEnvoyee) return (
    <div className={styles.succes}>
      <span className={styles.iconeSucces}><Check size={22} aria-hidden="true" /></span>
      <p role="status">{etat.succes}</p>
      {etat.avertissement && <p className={styles.avertissement} role="alert">{etat.avertissement}</p>}
      <div className={styles.actions}>
        {lienDocument && <Link href={lienDocument} className="btn-or">Consulter le document</Link>}
        <button type="button" className="btn-secondaire" onClick={() => setResultatMasque(etat)}>Déposer un autre document</button>
      </div>
    </div>
  );

  return <>
    {succesAffiche && <p role="status" className="mb-4 text-sm">{etat.succes} {lienDocument && <Link href={lienDocument} className="lien-discret">Consulter le document</Link>}</p>}
    <ChampsDepot key={version} {...props} etat={resultatMasque === etat ? {} : etat} soumettre={(event) => {
      setVersionEnvoyee(version);
      return soumettre(event);
    }} enCours={enCours} />
  </>;
}

function ChampsDepot({ personnes, lienAnnuler, typeInitial, etat, soumettre, enCours }: Props & {
  etat: EtatDepot;
  soumettre: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  enCours: boolean;
}) {
  const id = useId();
  const typeConnu = typeDepotAutorise(typeInitial);
  const [type, setType] = useState(typeConnu);
  const [typeModifie, setTypeModifie] = useState(false);
  const [titre, setTitre] = useState("");
  const [titreModifie, setTitreModifie] = useState(false);
  const [nomFichier, setNomFichier] = useState("");
  const [personne, setPersonne] = useState("");
  const suggestion = nomFichier ? typeSuggereParNom(nomFichier) : "";

  return (
    <form data-saisie-confirmee onSubmit={soumettre} aria-busy={enCours} className={styles.formulaire}>
      <div className={styles.fichier}>
        <div className={styles.enteteFichier}>
          <FileUp size={24} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <Label htmlFor={`${id}-fichier`}>Votre document</Label>
            <p>PDF, JPEG ou PNG · 10 Mo maximum</p>
          </div>
        </div>
        <ChampFichier depotDirect id={`${id}-fichier`} name="fichier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required onChange={(event) => {
          const nom = event.currentTarget.files?.[0]?.name ?? "";
          setNomFichier(nom);
          if (!titreModifie) setTitre(titreDepuisFichier(nom));
          if (!typeModifie) setType(typeConnu || typeSuggereParNom(nom));
        }} />
      </div>

      <div className={styles.champ}>
        <Label htmlFor={`${id}-type`}>Type de document</Label>
        <select id={`${id}-type`} name="type" required value={type} aria-describedby={`${id}-type-aide`} onChange={(event) => {
          setType(event.target.value);
          setTypeModifie(true);
        }}>
          <option value="" disabled>Choisir un type</option>
          {TYPES_DEPOSABLES.map((valeur) => <option key={valeur} value={valeur}>{TYPES_DOCUMENT[valeur]}</option>)}
        </select>
        <p id={`${id}-type-aide`} className={styles.aide} aria-live="polite">
          {!typeModifie && typeConnu ? "Repris du filtre de vos documents." : !typeModifie && suggestion ? "Suggéré d’après le nom du fichier. À vérifier." : "Le type détermine le classement et les accès au document."}
        </p>
      </div>

      <details className={styles.options}>
        <summary><span>{personnes.length ? "Renommer ou lier à une personne" : "Renommer le document"} <small>Facultatif</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className={styles.champsOptions}>
          <div className={styles.champ}>
            <Label htmlFor={`${id}-titre`}>Nom du document</Label>
            <Input id={`${id}-titre`} name="titre" maxLength={200} placeholder="Nom du fichier utilisé par défaut" value={titre} onChange={(event) => {
              setTitre(event.target.value);
              setTitreModifie(true);
            }} />
            <p className={styles.aide}>Repris du nom du fichier, modifiable ici.</p>
          </div>
          {personnes.length > 0 && <div className={styles.champ}>
            <Label htmlFor={`${id}-personne`}>Personne concernée</Label>
            <select id={`${id}-personne`} name="personne" value={personne} onChange={(event) => setPersonne(event.target.value)}>
              <option value="">Aucune personne liée</option>
              {personnes.map((p) => <option key={p.id} value={p.id}>{p.prenom ? `${p.prenom} ` : ""}{p.nom}</option>)}
            </select>
            {personne && ["piece_identite", "justificatif", "attestation_assurance"].includes(type) && <p className={styles.aide}>Cette personne pourra consulter le document dans son espace.</p>}
          </div>}
        </div>
      </details>
      {personne && <p className={styles.resumeLien}>Lié à {personnes.find(p => p.id === personne)?.prenom} {personnes.find(p => p.id === personne)?.nom}</p>}
      {etat.erreur && <p className="message-formulaire" role="alert">{etat.erreur}</p>}
      {etat.avertissement && <p className={styles.avertissement} role="alert">{etat.avertissement}</p>}
      <div className={styles.actions}>
        <BoutonEnvoi enCours={enCours} enCoursTexte="Dépôt…">Déposer le document</BoutonEnvoi>
        {lienAnnuler && <Link href={lienAnnuler} className="lien-discret">Annuler</Link>}
      </div>
    </form>
  );
}
