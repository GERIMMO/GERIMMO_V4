"use client";

import { useContext, useId, useState, useTransition, type ReactNode } from "react";
import { Eye, FileText, ClipboardCheck, ArrowUp } from "lucide-react";
import { genererDocument, type EtatGeneration } from "@/app/actions/documents-generes";
import type { CodeModele } from "@/lib/documents/modeles";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { LecteurDocument } from "@/components/lecteur-document";
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import { OuvrirSignatureDocument } from "@/components/ouvrir-signature-document";
import { useBaseEspace, useRacineEspace } from "@/components/racine-espace-contexte";
import styles from "./finaliser-parcours-bail.module.css";

type Controle = { manquants: string[]; erreur?: string } | null;
type Generation = { resultat: EtatGeneration; revision: number; controle: Controle };

/** Une erreur ou une modification du dossier retire l'ancien PDF de la relecture. */
export function documentPdfCourant(generation: Pick<Generation, "resultat" | "revision"> | null, revision: number, controle: Controle = null): string | null {
  if (!generation || generation.revision !== revision || generation.resultat.erreur || generation.resultat.manquants?.length
    || controle?.erreur || controle?.manquants.length) return null;
  return generation.resultat.documentId ?? null;
}

function ApercuPdf({ fichier, titre, libelle }: { fichier: string; titre: string; libelle: string }) {
  const [ouvert, setOuvert] = useState(false);
  return <><Button type="button" variant="outline" onClick={() => setOuvert(true)} aria-haspopup="dialog"><Eye size={16} aria-hidden="true"/>{libelle}</Button>
    {ouvert && <Modale titre={titre} tresLarge fermer={() => setOuvert(false)}><LecteurDocument fichier={fichier} titre={titre} mime="application/pdf" presentation="fiche"/></Modale>}
  </>;
}

export function PointsManquantsFinalisation({ manquants, manquantsRecap, recapitulatifStructure, orgId, racine }: {
  manquants: string[]; manquantsRecap: string[]; recapitulatifStructure: boolean; orgId: string; racine: string;
}) {
  // Le bilan ne connaît pas encore les nouveaux champs signalés par la génération.
  const aAfficher = [...new Set(manquants)].filter(m => !recapitulatifStructure || !manquantsRecap.includes(m));
  if (!aAfficher.length) return null;
  return <div className={styles.manquants}>
    <h4>{recapitulatifStructure ? "Autres informations à compléter" : "À compléter avant le PDF"} · {aAfficher.length}</h4>
    <ul>{aAfficher.map(m => <li key={m}><a href={cibleChampBail(m, orgId, racine).href}>{m}<span aria-hidden="true">→</span></a></li>)}</ul>
  </div>;
}

function PdfEtatDesLieux({ orgId, edlId, retour, revision, lectureSeule }: { orgId: string; edlId: string; retour: string; revision: number; lectureSeule: boolean }) {
  const base = useBaseEspace(orgId);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [enCours, demarrer] = useTransition();
  const courant = generation?.revision === revision;
  const documentId = documentPdfCourant(generation, revision);
  function generer() {
    if (lectureSeule || enCours) return;
    setGeneration(null);
    demarrer(async () => {
      try { setGeneration({ resultat: await genererDocument(orgId, "edl", edlId, retour), revision, controle: null }); }
      catch { setGeneration({ resultat: { erreur: "La génération a été interrompue. Réessayez." }, revision, controle: null }); }
    });
  }
  return <>
    <div className={styles.actions}>
      {!lectureSeule && <Button type="button" variant="outline" onClick={generer} disabled={enCours}>{enCours ? "Génération…" : documentId ? "Actualiser le PDF" : "Générer le PDF de l’état des lieux"}</Button>}
      {documentId && <ApercuPdf key={documentId} fichier={`${base}/documents/${documentId}/fichier`} titre="État des lieux d’entrée" libelle="Relire l’état des lieux"/>}
    </div>
    {courant && generation?.resultat.erreur && <p className={styles.erreur} role="alert">{generation.resultat.erreur}</p>}
    {courant && Boolean(generation?.resultat.manquants?.length) && <p className={styles.message}>À compléter dans la grille : {generation!.resultat.manquants!.join(" · ")}.</p>}
    {generation?.resultat.documentId && !courant && <p className={styles.message} role="status">Le dossier a changé. Actualisez le PDF de l’état des lieux.</p>}
    <a className={styles.lien} href={`${retour}/edl/${edlId}`}>{lectureSeule ? "Consulter la grille" : "Compléter la grille"} →</a>
    {!lectureSeule && <div className={styles.signatureEdl}><OuvrirSignatureDocument orgId={orgId} selection={{ code: "edl", cibleId: edlId }}/></div>}
  </>;
}

export function FinaliserParcoursBail({ orgId, bailId, code, edlId, preparationEdl, proprietaireDirect = false, documentSigne = null, lectureSeule = false, recapitulatifStructure = false }: {
  orgId: string; bailId: string; code: CodeModele; signataires: { id: string; nom: string }[]; edlId: string | null;
  preparationEdl: ReactNode; signatureManuelle: ReactNode; proprietaireDirect?: boolean; documentSigne?: string | null;
  lectureSeule?: boolean; recapitulatifStructure?: boolean;
}) {
  const base = useBaseEspace(orgId), racine = useRacineEspace(), titreId = useId();
  const controle = useContext(CompletudeBail);
  const revision = useContext(EtapeComplementsBail)?.revision ?? 0;
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [enCours, demarrer] = useTransition();
  const retour = `${base}/baux/${bailId}`;
  const pdfCourant = generation?.revision === revision;
  // Une erreur de génération reste valable jusqu'à la prochaine vérification.
  const manquantsGeneration = pdfCourant && generation?.controle === controle ? generation.resultat.manquants ?? [] : [];
  const manquants = [...new Set([...(controle?.manquants ?? []), ...manquantsGeneration])];
  const controleBloquant = Boolean(controle?.erreur) || manquants.length > 0;
  const documentId = documentPdfCourant(generation, revision, controle);
  const perime = Boolean(generation?.resultat.documentId && !pdfCourant);
  const statut = documentSigne ? "Signé" : controle?.erreur ? "Vérification nécessaire" : manquants.length ? "À compléter"
    : documentId ? "À relire" : perime ? "À régénérer" : "À générer";
  function generer() {
    if (lectureSeule || enCours || controleBloquant) return;
    setGeneration(null);
    demarrer(async () => {
      try { setGeneration({ resultat: await genererDocument(orgId, code, bailId, retour), revision, controle }); }
      catch { setGeneration({ resultat: { erreur: "La génération a été interrompue. Réessayez." }, revision, controle }); }
    });
  }
  return <section className={styles.finalisation} id="signature" aria-labelledby={titreId}>
    <header className={styles.entete}><h3 id={titreId}>Documents et signatures</h3><p>{documentSigne ? "Le contrat signé est disponible. La location reste à activer." : "Relisez les documents avant de lancer les signatures."}</p></header>
    {!documentSigne && <PointsManquantsFinalisation manquants={manquants} manquantsRecap={controle?.manquants ?? []} recapitulatifStructure={recapitulatifStructure} orgId={orgId} racine={racine}/>}
    <div className={styles.documents}>
      <section className={styles.carte} aria-labelledby={`${titreId}-contrat`}>
        <header><FileText size={20} aria-hidden="true"/><h4 id={`${titreId}-contrat`}>Contrat de location</h4><span className={styles.statut} data-attention={(controleBloquant && !documentSigne) || perime || undefined}>{statut}</span></header>
        {documentSigne ? <ApercuPdf key={documentSigne} fichier={`${base}/documents/${documentSigne}/fichier`} titre="Bail signé" libelle="Consulter le bail signé"/> : <>
          {controleBloquant && <div className={styles.avertissement}>
            <p>{controle?.erreur ? "Le contrôle du dossier doit être rétabli avant la génération." : "Complétez les informations signalées avant de préparer le contrat."}</p>
            {recapitulatifStructure && <a className={styles.lien} href="#bilan-bail"><ArrowUp size={14} aria-hidden="true"/>Revenir aux points à vérifier</a>}
            {!recapitulatifStructure && controle?.erreur && <p role="alert">{controle.erreur}</p>}
          </div>}
          <div className={styles.actions}>
            {!lectureSeule && <Button type="button" onClick={generer} disabled={enCours || controleBloquant}>{enCours ? "Génération…" : documentId ? "Actualiser le PDF du bail" : "Générer le PDF du bail"}</Button>}
            {documentId && <ApercuPdf key={documentId} fichier={`${base}/documents/${documentId}/fichier`} titre="Contrat de location" libelle="Relire le contrat"/>}
          </div>
          {pdfCourant && generation?.resultat.erreur && <p className={styles.erreur} role="alert">{generation.resultat.erreur}</p>}
          {perime && <p className={styles.message} role="status">Le dossier a changé. Générez un nouveau PDF avant les signatures.</p>}
        </>}
      </section>
      <section className={styles.carte} id="edl" aria-labelledby={`${titreId}-edl`}>
        <header><ClipboardCheck size={20} aria-hidden="true"/><h4 id={`${titreId}-edl`}>État des lieux d’entrée</h4><span className={styles.statut}>{edlId ? "Grille disponible" : "À préparer"}</span></header>
        {edlId ? <PdfEtatDesLieux key={edlId} orgId={orgId} edlId={edlId} retour={retour} revision={revision} lectureSeule={lectureSeule}/> : <>
          <p className={styles.message}>{lectureSeule ? "Aucune grille disponible." : "Préparez la grille pour la visite : pièces, compteurs et clés."}</p>{!lectureSeule && preparationEdl}
        </>}
        <p className={styles.precision}>À compléter et signer avec les parties lors de la remise des clés.</p>
      </section>
    </div>
    {lectureSeule && <p className={styles.message}>Consultation uniquement. Le propriétaire gère la signature et l’activation depuis son espace.</p>}
    {proprietaireDirect && !lectureSeule && <SignatureElectroniqueBail orgId={orgId} bailId={bailId} manquantsDejaAffiches={recapitulatifStructure ? controle?.manquants : undefined}/>}
  </section>;
}
