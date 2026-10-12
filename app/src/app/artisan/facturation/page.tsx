import Link from "next/link";
import { ArrowRight, CalendarDays, Check, CheckCircle2, ClipboardList, FileCheck2, FileUp, Info, ReceiptText } from "lucide-react";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan, type LigneAgenda } from "../acces";
import { euros, jourCourt } from "../libelles";
import { EnteteSousPage, Erreur, Etiquette, MarqueAgence, Succes } from "../ui";
import { classerFacturation, montantEngage } from "./suivi-facturation";
import styles from "./facturation.module.css";

export const metadata = { title: "Ma facturation — Espace artisan" };

export default async function PageFacturation(props: PageProps<"/artisan/facturation">) {
  await verifierAccesArtisan();
  const { facture } = await props.searchParams;
  const agenda = await chargerAgenda();
  const { aFacturer, aCompleter, deposees } = classerFacturation(agenda.lignes);
  const montantAFacturer = aFacturer.reduce((total, ligne) => total + (montantEngage(ligne) ?? 0), 0);
  const montantsIncomplets = aFacturer.some(l => montantEngage(l) === null);

  return <div className={styles.page}>
    <EnteteSousPage rubrique="finances" titre="Ma facturation" mention="De l’intervention terminée à la facture transmise."
      action={<Link href="/artisan/agenda" className={styles.lienAgenda}><CalendarDays size={17} aria-hidden/>Mon agenda</Link>}/>
    {facture && <Succes>Facture déposée. Votre interlocuteur est prévenu : il la contrôle et la règle selon ses délais.</Succes>}
    {agenda.erreur ? <Erreur>Vos interventions n’ont pas pu être chargées. Rechargez la page avant de conclure qu’aucune intervention n’est facturable.</Erreur> : <>
      <nav className={styles.indicateurs} aria-label="Résumé de la facturation">
        <Link href="#a-facturer" className={styles.indicateur} data-ton="bleu"><span className={styles.icone}><ReceiptText size={21} aria-hidden/></span><span><strong>{aFacturer.length}</strong><span>À facturer</span><small>Interventions prêtes</small></span><ArrowRight size={16} aria-hidden/></Link>
        <Link href="#a-completer" className={styles.indicateur} data-ton="or"><span className={styles.icone}><ClipboardList size={21} aria-hidden/></span><span><strong>{aCompleter.length}</strong><span>Dossiers à compléter</span><small>Avant de facturer</small></span><ArrowRight size={16} aria-hidden/></Link>
        <Link href="#factures-deposees" className={styles.indicateur} data-ton="vert"><span className={styles.icone}><FileCheck2 size={21} aria-hidden/></span><span><strong>{deposees.length}</strong><span>Factures déposées</span><small>Transmises à vos clients</small></span><ArrowRight size={16} aria-hidden/></Link>
      </nav>
      <div className={styles.contenu}>
        <div className={styles.dossiers}>
          <section id="a-facturer" className={styles.section}>
            <div className={styles.titreSection}><div><h2>À facturer <span>{aFacturer.length}</span></h2><p>Vos interventions terminées avec un dossier complet.</p></div><ReceiptText size={21} aria-hidden/></div>
            {aFacturer.length > 0 ? <>
              <ul className={styles.liste}>{aFacturer.map(l => <LigneFacturation key={l.intervention_id} ligne={l}/>)}</ul>
              <div className={styles.total}><span>{montantsIncomplets ? "Montant engagé connu" : "Montant engagé à facturer"}<small>Devis et avenants acceptés{montantsIncomplets ? " · certains montants restent à préciser" : ""}</small></span><strong>{aFacturer.every(l => montantEngage(l) === null) ? "À préciser" : <>{euros(montantAFacturer)} <small>TTC</small></>}</strong></div>
            </> : <div className={styles.vide}><span className={styles.iconeVide}><ReceiptText size={28} aria-hidden/></span><h3>Aucune facture à déposer pour l’instant</h3><p>Terminez votre intervention et ajoutez le compte rendu ainsi qu’une photo. Vous pourrez ensuite déposer votre facture ici.</p><Link href="/artisan/agenda" className={styles.boutonPrincipal}>Voir mes interventions <ArrowRight size={16} aria-hidden/></Link></div>}
          </section>
          <section id="a-completer" className={styles.section}>
            <div className={styles.titreSection}><div><h2>Dossiers à compléter <span>{aCompleter.length}</span></h2><p>Les pièces nécessaires pour débloquer la facturation.</p></div><ClipboardList size={21} aria-hidden/></div>
            {aCompleter.length ? <ul className={styles.liste}>{aCompleter.map(l => <li key={l.intervention_id} className={styles.aCompleter}>
              <div><h3>{titreIncident(l.categorie)}</h3><p>{l.agence_nom} · {l.incident_numero}</p><div className={styles.pieces}><span data-present={l.compte_rendu_depose}>{l.compte_rendu_depose ? <Check size={14} aria-hidden/> : <span aria-hidden>○</span>}Compte rendu {l.compte_rendu_depose ? "déposé" : "manquant"}</span><span data-present={l.photo_apres_deposee}>{l.photo_apres_deposee ? <Check size={14} aria-hidden/> : <span aria-hidden>○</span>}Photo {l.photo_apres_deposee ? "déposée" : "manquante"}</span></div></div>
              <Link href={`/artisan/missions/${l.intervention_id}/compte-rendu`} className={styles.boutonSecondaire} aria-label={`Compléter le dossier ${l.incident_numero}`}>Compléter <ArrowRight size={15} aria-hidden/></Link>
            </li>)}</ul> : <p className={styles.rienACompleter}><CheckCircle2 size={18} aria-hidden/>Aucun dossier en attente de compte rendu ou de photo.</p>}
          </section>
          <section id="factures-deposees" className={styles.section}>
            <div className={styles.titreSection}><div><h2>Factures déposées <span>{deposees.length}</span></h2><p>Les factures transmises pour vos interventions.</p></div><FileCheck2 size={21} aria-hidden/></div>
            {deposees.length ? <ul className={styles.liste}>{deposees.map(l => <LigneFacturation key={l.intervention_id} ligne={l}/>)}</ul> : <p className={styles.aucuneFacture}>Vos prochaines factures apparaîtront ici après leur dépôt.</p>}
          </section>
        </div>
        <aside className={styles.guide} aria-label="Comment transmettre une facture">
          <p className={styles.surtitre}>Vos repères</p><h2>Facturer en 3 étapes</h2>
          <ol><li><span>1</span><div><h3>Terminez l’intervention</h3><p>Ajoutez le compte rendu et une photo du travail réalisé.</p></div></li><li><span>2</span><div><h3>Déposez votre facture</h3><p>Le montant est prérempli à partir du devis ou de l’avenant accepté. Vous pouvez justifier un écart.</p></div></li><li><span>3</span><div><h3>Votre client est prévenu</h3><p>Il retrouve la facture dans son espace pour la contrôler et la régler.</p></div></li></ol>
          <div className={styles.note}><Info size={17} aria-hidden/><p>Le dépôt est suivi ici. Le règlement reste à vérifier auprès de votre client.</p></div>
          <Link href="/artisan/entreprise#documents" className={styles.lienGuide}>Vérifier ma fiche entreprise <ArrowRight size={15} aria-hidden/></Link>
        </aside>
      </div>
    </>}
  </div>;
}

function LigneFacturation({ ligne }: { ligne: LigneAgenda }) {
  const deposee = ligne.facture_deposee;
  const montant = montantEngage(ligne);
  return <li className={styles.facture}>
    <div className={styles.client}><MarqueAgence nom={ligne.agence_nom}/><Etiquette ton={deposee ? "ok" : "encre"}>{deposee ? "Facture déposée" : "Prête à facturer"}</Etiquette></div>
    <div className={styles.detailFacture}>
      <div><h3>{titreIncident(ligne.categorie)}</h3><p>{[ligne.incident_numero, ligne.debut_prevu ? jourCourt(ligne.debut_prevu) : null, ligne.ville].filter(Boolean).join(" · ")}</p></div>
      <div className={styles.montant}><strong>{montant !== null ? euros(montant) : "À préciser"}{montant !== null && <small> TTC</small>}</strong><span>{ligne.montant_plafond_cents !== null && ligne.montant_plafond_cents !== ligne.montant_ttc_cents ? "Avenant accepté" : "Devis retenu"}</span></div>
    </div>
    <Link href={`/artisan/missions/${ligne.intervention_id}${deposee ? "" : "/facture"}`} className={deposee ? styles.boutonSecondaire : styles.boutonPrincipal}>{deposee ? <FileCheck2 size={16} aria-hidden/> : <FileUp size={16} aria-hidden/>}{deposee ? "Voir la mission" : "Déposer ma facture"}<ArrowRight size={15} aria-hidden/></Link>
  </li>;
}
