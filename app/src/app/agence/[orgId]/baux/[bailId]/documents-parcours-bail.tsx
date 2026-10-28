import { createClient } from "@/lib/supabase/server";
import { premier } from "@/lib/postgrest";
import { aujourdhuiParis } from "@/lib/ged";
import { classerPiecesBail, echeanceReglementaire, type DiagnosticBail, type PieceBail } from "@/lib/documents-bail";
import { FileCheck2, BookOpen, Building2, Paperclip, ShieldCheck, KeyRound } from "lucide-react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { FormulaireReglementCopropriete } from "./formulaires-bail";
import { ChoisirReglementBail } from "./choisir-reglement-bail";
import { FormulaireAnnexeBail } from "./formulaire-annexe-bail";
import { DiagnosticsBail } from "./diagnostics-bail";
import { ApercuPieceBail, ChoisirPieceAttendueBail, type FichierPieceBail } from "./piece-attendue-bail";
import styles from "./documents-bail.module.css";
import type { ReactNode } from "react";
import { baseEspace, racineEspace } from "@/lib/racine-espace";
import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { verifierAccesEspace } from "@/lib/espace";
import type { QualificationDiagnostic } from "@/lib/qualification-diagnostics";
import { statutAttestationBail } from "@/lib/statut-attestation-bail";

type DocumentConnu = FichierPieceBail & PieceBail & { created_at: string; versions?: { id: string; purged_at: string | null }[] };
const remplace = (document: DocumentConnu) => Boolean(document.versions?.length);
type Props = { orgId: string; bailId: string; lotId: string; bienId: string; annexes: ReactNode; copropriete: boolean | null; reglementId: string | null; dateDebut: string | null; edlEntree: { id: string; etat: string } | null; erreurEdl: boolean };

export async function DocumentsParcoursBail({ orgId, bailId, lotId, bienId, annexes, copropriete, reglementId, dateDebut, edlEntree, erreurEdl }: Props) {
  const db = await createClient();
  const { estProprietaire } = await verifierAccesEspace(orgId);
  const base = baseEspace(orgId, estProprietaire);
  const aujourd = aujourdhuiParis();
  const referenceDate = dateDebut && dateDebut > aujourd ? dateDebut : aujourd;
  const champs = "id,type,date_realisation,date_expiration,document_id,classe_dpe,document:documents!diagnostics_document_meme_org_fk(id,purged_at)";
  const champsDocument = "id,titre,type,purged_at,created_at,expire_le,mime_type,versions:documents!documents_remplace_id_fkey(id,purged_at)";
  const [lot, bien, docsBail, docsLot, batiment, qualifications, pieces, reglement, assurancesDisponibles] = await Promise.all([
    db.from("diagnostics").select(champs).eq("organization_id", orgId).eq("lot_id", lotId).is("archived_at", null).order("date_realisation", { ascending: false }),
    db.from("diagnostics").select(champs).eq("organization_id", orgId).eq("bien_id", bienId).is("lot_id", null).is("archived_at", null).order("date_realisation", { ascending: false }),
    db.from("document_liens").select(`document:documents(${champsDocument})`).eq("organization_id", orgId).eq("entite", "bail").eq("entite_id", bailId),
    db.from("document_liens").select(`document:documents(${champsDocument})`).eq("organization_id", orgId).eq("entite", "lot").eq("entite_id", lotId),
    db.from("biens").select("type,annee_construction").eq("organization_id", orgId).eq("id", bienId).maybeSingle(),
    db.from("qualifications_diagnostics_lot").select("type,situation,date_installation,annee_installation").eq("organization_id", orgId).eq("lot_id", lotId),
    db.from("pieces_attendues_bail").select(`nature,bail_id,document_id,document:documents(${champsDocument})`).eq("organization_id", orgId).eq("lot_id", lotId),
    reglementId ? db.from("documents").select(champsDocument).eq("organization_id", orgId).eq("id", reglementId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("documents").select(champsDocument).eq("organization_id", orgId).is("purged_at", null).in("type", ["attestation_assurance", "autre", "justificatif"]).order("created_at", { ascending: false }),
  ]);
  const diagnostics: DiagnosticBail[] = [...(lot.data ?? []).map(d => ({ ...d, niveau: "lot" as const })), ...(bien.data ?? []).map(d => ({ ...d, niveau: "bien" as const }))].map(d => {
    const document = premier(d.document);
    // DOC-01 : l'échéance d'un DPE d'avant le 01/07/2021 est plafonnée (décret n° 2020-1610).
    return { ...d, document_id: document && !document.purged_at ? d.document_id : null, date_expiration: echeanceReglementaire(d.type, d.date_realisation, d.date_expiration) };
  });
  // Une affectation explicite fait foi : le titre ne prouve pas qui est assuré.
  const identifiees = (pieces.data ?? []).filter(p => p.nature === "assurance_proprietaire" ? p.bail_id === null : p.bail_id === bailId);
  const documentsBail = (docsBail.data ?? []).map(d => premier(d.document)).filter(Boolean) as unknown as DocumentConnu[];
  const tous = [...documentsBail, ...(docsLot.data ?? []).map(d => premier(d.document)), ...identifiees.map(d => premier(d.document))] as (DocumentConnu | null)[];
  const documents = [...new Map(tous.filter((d): d is DocumentConnu => Boolean(d && !d.purged_at)).map(d => [d.id, d])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { notices } = classerPiecesBail(documentsBail, [], reglementId);
  const notice = notices[0];
  const dejaAffiches = new Set([...notices.map(d => d.id), ...diagnostics.map(d => d.document_id), ...identifiees.map(d => d.document_id), reglementId]);
  const autres = documents.filter(d => !dejaAffiches.has(d.id));
  const luReglement = reglement.data as unknown as DocumentConnu | null;
  const fichierReglement = luReglement && !luReglement.purged_at ? luReglement : null;
  const erreurReglement = Boolean(reglement.error || (reglementId && !luReglement) || (!reglementId && (docsBail.error || docsLot.error)));
  const reglementsDisponibles = documents.filter(d => d.type === "reglement_copropriete" && d.mime_type === "application/pdf" && !remplace(d));
  const fichier = (id: string) => `${base}/documents/${id}/fichier`;
  const erreurDocuments = Boolean(docsBail.error || docsLot.error || pieces.error);
  const candidats = [...new Map([...documents, ...((assurancesDisponibles.data ?? []) as unknown as DocumentConnu[])].filter(d => !d.purged_at && !remplace(d) && ["attestation_assurance", "autre", "justificatif"].includes(d.type)).map(d => [d.id, d])).values()];
  const lienBatiment = lienLotDepuisBail(orgId, bienId, lotId, bailId, "bien", 5, racineEspace(estProprietaire));

  return <div id="documents-bail" className={styles.page}>
    <p className={styles.introduction}>Les pièces attendues sont listées ci-dessous. Les documents du logement sont repris automatiquement ; seuls les éléments manquants restent à compléter.</p>
    <section id="completer-dpe" className={styles.section}>
      <header className={styles.entete}><FileCheck2 size={20} aria-hidden="true"/><h3>Diagnostics du logement et du bâtiment</h3></header>
      {lot.error || bien.error ? <p role="alert">Les diagnostics n’ont pas pu être chargés. Rechargez la page avant d’effectuer un dépôt.</p> : <DiagnosticsBail orgId={orgId} bailId={bailId} lotId={lotId} bienId={bienId} diagnostics={diagnostics} aujourdhui={aujourd}
        contexte={batiment.data ? { typeBien: batiment.data.type, anneeConstruction: batiment.data.annee_construction, qualifications: (qualifications.data ?? []) as QualificationDiagnostic[], referenceDate } : undefined}
        erreurContexte={Boolean(batiment.error || !batiment.data || qualifications.error)}/>}
    </section>
    {erreurDocuments && <p className={styles.avertissement} role="alert">Certains documents n’ont pas pu être chargés. Leur absence n’est pas confirmée : rechargez la page avant d’en ajouter.</p>}
    <section className={styles.section} aria-labelledby="assurances-bail">
      <header className={styles.entete}><ShieldCheck size={20} aria-hidden="true"/><h3 id="assurances-bail">Les assurances</h3></header>
      <div className={styles.annexes}>
        {(["assurance_proprietaire", "assurance_locataire"] as const).map(nature => {
          const proprietaire = nature === "assurance_proprietaire";
          const affectation = identifiees.find(p => p.nature === nature);
          const piece = premier(affectation?.document ?? null) as unknown as DocumentConnu | null;
          const doc = piece && !piece.purged_at ? piece : null;
          const statut = !erreurDocuments && !doc && proprietaire && copropriete === false ? { libelle: "Facultative", ton: "neutre" }
            : !erreurDocuments && !doc && proprietaire && copropriete === null ? { libelle: "À préciser", ton: "attention" }
            : !erreurDocuments && doc && remplace(doc) ? { libelle: "Version à actualiser", ton: "attention" }
            : statutAttestationBail(doc, aujourd, referenceDate, erreurDocuments);
          return <article key={nature} className={styles.carte} data-ton={statut.ton}>
            <div className={styles.carteEntete}><h4>{proprietaire ? "Assurance du propriétaire" : "Assurance du locataire"}</h4><span className={styles.etat} data-ton={statut.ton}>{statut.libelle}</span></div>
            <p className={styles.obligation}>{proprietaire ? copropriete === true ? "Responsabilité civile obligatoire · Copropriété" : copropriete === false ? "Recommandée · Hors copropriété" : "Obligation à préciser · Copropriété inconnue" : "Obligatoire · À la remise des clés"}</p>
            <p>{proprietaire ? "Attestation couvrant votre responsabilité de bailleur pour ce logement (souvent appelée PNO)." : "Attestation d’assurance habitation couvrant les risques locatifs et les occupants de ce bail."}</p>
            {proprietaire && copropriete === null && <a className={styles.lien} href={lienBatiment}>Préciser la situation du bâtiment</a>}
            {doc && <div className={styles.documentRepris}><strong>{doc.titre || "Attestation d’assurance"}</strong><span>{doc.expire_le ? `Échéance indiquée : ${doc.expire_le.split("-").reverse().join("/")}` : "Dates de couverture à vérifier sur l’attestation."}</span></div>}
            {assurancesDisponibles.error && <p role="alert">La liste des attestations déjà déposées est indisponible. Réessayez avant d’ajouter un fichier.</p>}
            <div className={styles.actions}>{doc && <ApercuPieceBail fichier={fichier(doc.id)} titre={doc.titre || "Attestation d’assurance"} mime={doc.mime_type}/>}<ChoisirPieceAttendueBail orgId={orgId} bailId={bailId} nature={nature} documents={candidats} dejaPresent={Boolean(doc)} documentPrecedentId={affectation?.document_id ?? null} indisponible={erreurDocuments || Boolean(assurancesDisponibles.error)}/></div>
          </article>;
        })}
      </div>
    </section>
    <section className={styles.section} aria-labelledby="annexes-attendues">
      <header className={styles.entete}><BookOpen size={20} aria-hidden="true"/><h3 id="annexes-attendues">À remettre avec le bail</h3></header>
      <div className={styles.annexes}>
        <article className={styles.carte} data-ton={docsBail.error ? undefined : notice ? "ok" : "attention"}>
          <div className={styles.carteEntete}><h4>Notice d’information</h4><span className={styles.etat} data-ton={docsBail.error ? undefined : notice ? "ok" : "attention"}>{docsBail.error ? "Indisponible" : notice ? "Disponible" : "À générer"}</span></div>
          <p className={styles.obligation}>Obligatoire · Avec le bail</p><p>Gerimmo prépare un résumé des droits et obligations. Le texte intégral de la notice fixée par l’arrêté du 29 mai 2015 doit être annexé au bail : <a className="underline" href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000030649868" target="_blank" rel="noopener noreferrer">texte officiel sur Légifrance</a>.</p>
          {!docsBail.error && <div className={styles.actions}>{notice && <ApercuPieceBail fichier={fichier(notice.id)} titre="Notice d’information" mime="application/pdf"/>}<BoutonGenererDocument orgId={orgId} code="notice" cibleId={bailId} cheminRetour={`${base}/baux/${bailId}`} libelle={notice ? "Actualiser la notice" : "Générer la notice"}/></div>}
        </article>
        <article id="reglement-copro" className={styles.carte} data-ton={erreurReglement ? undefined : fichierReglement ? "ok" : copropriete !== false ? "attention" : undefined}>
          <div className={styles.carteEntete}><h4>Extraits du règlement de copropriété</h4><span className={styles.etat} data-ton={erreurReglement ? undefined : fichierReglement ? "ok" : copropriete !== false ? "attention" : undefined}>{erreurReglement ? "Indisponible" : fichierReglement ? "Déposé" : copropriete === false ? "Non concerné" : copropriete === true ? reglementsDisponibles.length ? "À rattacher" : "À joindre" : "À préciser"}</span></div>
          <p className={styles.obligation}>{copropriete === false ? "Bâtiment hors copropriété" : "Obligatoires en copropriété · Avec le bail"}</p>
          {erreurReglement ? <p role="alert">Les pièces de copropriété n’ont pas pu être vérifiées. Rechargez la page avant d’effectuer un dépôt.</p> : fichierReglement ? <div className={styles.actions}><ApercuPieceBail fichier={fichier(fichierReglement.id)} titre="Règlement de copropriété" mime={fichierReglement.mime_type}/></div> : copropriete === true ? <><p>Usage des parties privatives et communes, destination de l’immeuble et répartition des charges du lot.</p>{reglementsDisponibles.length > 0 && <ChoisirReglementBail orgId={orgId} bailId={bailId} documents={reglementsDisponibles}/>}<details className={styles.details}><summary>{reglementsDisponibles.length ? "Déposer un autre fichier" : "Ajouter les extraits"}</summary><FormulaireReglementCopropriete orgId={orgId} bailId={bailId}/></details></> : copropriete === null ? <a className={styles.lien} href={lienBatiment}>Préciser la situation du bâtiment</a> : null}
        </article>
      </div>
      <div className={styles.annexesContrat}>{annexes}</div>
    </section>
    <section className={styles.section}>
      <header className={styles.entete}><KeyRound size={20} aria-hidden="true"/><h3>À l’entrée du locataire</h3><span className={styles.etat} data-ton={!erreurEdl && edlEntree?.etat === "signe" ? "ok" : undefined}>{erreurEdl ? "Indisponible" : edlEntree?.etat === "signe" ? "Signé" : edlEntree ? "En préparation" : "À préparer"}</span></header>
      <p>L’état des lieux d’entrée se complète et se signe avec le locataire lors de la remise des clés.</p>
      {!erreurEdl && <a className={styles.lien} href={edlEntree ? `${base}/baux/${bailId}/edl/${edlEntree.id}` : "#etape-bail-7"}>{edlEntree ? "Ouvrir l’état des lieux" : "Préparer l’état des lieux"}</a>}
    </section>
    <details className={styles.details}>
      <summary><Building2 size={17} aria-hidden="true"/>Autres pièces selon le logement</summary>
      <div className={styles.conditions}>
        <div><h4>Autorisation ou déclaration de mise en location</h4><p>Si l’adresse se situe dans un secteur soumis au permis de louer : joindre l’autorisation ou le récépissé demandé par la commune. Cette situation n’est pas encore renseignée dans Gerimmo.</p><FormulaireAnnexeBail orgId={orgId} bailId={bailId} titreInitial="Autorisation ou déclaration de mise en location"/></div>
        <div><h4>Convention Anah</h4><p>À joindre si le logement est conventionné avec l’Anah.</p><FormulaireAnnexeBail orgId={orgId} bailId={bailId} titreInitial="Convention Anah"/></div>
        <p className={styles.aide}>Une grille de vétusté convenue entre les parties peut aussi être jointe. <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F2066" target="_blank" rel="noreferrer">Voir les pièces prévues selon votre situation</a>.</p>
      </div>
    </details>
    <details className={styles.details}>
      <summary><Paperclip size={17} aria-hidden="true"/>Autres fichiers enregistrés{!erreurDocuments && <span className={styles.etat}>{autres.length}</span>}</summary>
      {autres.length > 0 ? <ul className={styles.liste}>{autres.map(d => <li key={d.id}><span className={styles.identite}><strong>{d.titre || "Justificatif"}</strong></span><ApercuPieceBail fichier={fichier(d.id)} titre={d.titre || "Justificatif"}/></li>)}</ul> : !erreurDocuments && <p className={styles.vide}>Aucun autre fichier rattaché au logement ou à ce bail.</p>}
      <FormulaireAnnexeBail orgId={orgId} bailId={bailId}/>
    </details>
  </div>;
}
