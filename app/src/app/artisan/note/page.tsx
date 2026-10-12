import Link from "next/link";
import { ArrowRight, CalendarClock, Check, CircleHelp, Clock3, LockKeyhole, MessageSquareText, Scale, ShieldCheck, Star, XCircle } from "lucide-react";
import { chargerNote, verifierAccesArtisan } from "../acces";
import { EnteteSousPage, Erreur, Etiquette } from "../ui";
import { Contestation } from "./contestation";
import styles from "./evaluations.module.css";

export const metadata = { title: "Mes évaluations — Espace artisan" };

/** La projection ne contient que des agrégats : ni auteur, ni commentaire individuel.
 * Les indicateurs de fiabilité ne sont pas intégrés à la note actuelle. */
export default async function PageNote() {
  await verifierAccesArtisan();
  const { note, erreur } = await chargerNote();
  const moyenne = note?.note_publiee !== null && note?.note_publiee !== undefined ? Number(note.note_publiee) : null;
  const publiee = Boolean(note?.publiable && moyenne !== null);
  const evaluations = note?.nb_evaluations ?? 0;
  const restant = Math.max(0, 3 - evaluations);
  const format = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return <div className={styles.page}>
    <EnteteSousPage rubrique="suivi" titre="Mes évaluations" mention="Votre note et les repères de qualité de vos interventions." action={<Link href="/artisan/entreprise" className={styles.retour}>Ma fiche entreprise <ArrowRight size={16} aria-hidden/></Link>}/>
    {(erreur || !note) ? <Erreur>Vos évaluations n’ont pas pu être lues à l’instant. <a href="/artisan/note" className="underline">Recharger la page</a>.</Erreur> : <>
      <section className={styles.resume} aria-label="Votre note sur Gerimmo">
        <div className={styles.note}><span className={styles.etoile}><Star size={26} aria-hidden/></span><span className={styles.surtitre}>Votre note Gerimmo</span>{publiee ? <><div className={styles.moyenne}>{format(moyenne!)}<span>/ 5</span></div><Etiquette ton="ok">Note publiée</Etiquette></> : <><h2>{restant > 0 ? "Votre réputation se construit" : "Publication en attente"}</h2><Etiquette ton="neutre">Pas encore publiée</Etiquette></>}<p>{evaluations} évaluation{evaluations > 1 ? "s" : ""} reçue{evaluations > 1 ? "s" : ""}</p></div>
        <div className={styles.publication}><h2>{publiee ? "Une note visible dans le réseau" : "La publication commence à 3 évaluations"}</h2><p>{publiee ? "Cette moyenne accompagne votre nom dans les recherches. Elle reflète les appréciations des clients et des locataires." : "Avant ce seuil, votre profil apparaît comme « nouveau ». Les premières évaluations permettent de construire une moyenne représentative."}</p>
          {!publiee && <><div className={styles.progression} aria-label={`${Math.min(evaluations, 3)} évaluations reçues sur les 3 nécessaires`}>{[1,2,3].map(i => <span key={i} data-atteint={evaluations >= i}>{evaluations >= i ? <Check size={16} aria-hidden/> : <Star size={16} aria-hidden/>}<span>{i}</span></span>)}</div><p className={styles.restant}>{restant > 0 ? `Encore ${restant} évaluation${restant > 1 ? "s" : ""} avant publication.` : "Le seuil est atteint. Votre note n’est pas encore disponible."}</p></>}
          <p className={styles.confidentialite}><LockKeyhole size={15} aria-hidden/>Les auteurs et les commentaires individuels ne sont pas affichés.</p>
        </div>
      </section>
      <section aria-labelledby="titre-fiabilite"><div className={styles.titreSection}><div><h2 id="titre-fiabilite">Mes indicateurs de fiabilité</h2><p>Des repères personnels, présentés séparément de votre note.</p></div><span><LockKeyhole size={13} aria-hidden/>Visibles par vous</span></div>
        <div className={styles.indicateurs}>
          <div className={styles.indicateur}><span className={styles.icone} data-ton="bleu"><Clock3 size={21} aria-hidden/></span><h3>Délai d’acceptation</h3><strong>{Number(note.delai_acceptation_heures ?? 0) > 0 ? `${format(Number(note.delai_acceptation_heures))} h` : "Pas encore mesuré"}</strong><p>Pour répondre à une mission.</p></div>
          <div className={styles.indicateur}><span className={styles.icone} data-ton="violet"><CalendarClock size={21} aria-hidden/></span><h3>Délai d’intervention</h3><strong>{Number(note.delai_intervention_jours ?? 0) > 0 ? `${format(Number(note.delai_intervention_jours))} j` : "Pas encore mesuré"}</strong><p>En moyenne après acceptation.</p></div>
          <div className={styles.indicateur}><span className={styles.icone} data-ton="or"><XCircle size={21} aria-hidden/></span><h3>Taux de refus</h3><strong>{note.taux_refus !== null && note.taux_refus !== undefined ? `${Math.round(Number(note.taux_refus) * 100)} %` : "Pas encore mesuré"}</strong><p>Part des missions refusées.</p></div>
          <div className={styles.indicateur} data-attention={note.pieces_expirees > 0}><span className={styles.icone} data-ton="vert"><ShieldCheck size={21} aria-hidden/></span><h3>Attestations expirées</h3><strong>{note.pieces_expirees ?? 0}</strong><Link href="/artisan/attestations">{note.pieces_expirees > 0 ? "Renouveler mes documents" : "Voir mes attestations"}<ArrowRight size={14} aria-hidden/></Link></div>
        </div>
        <p className={styles.noteMesure}>Les rendez-vous manqués ne sont pas encore mesurés. Ces indicateurs n’entrent pas dans le calcul de votre note.</p>
      </section>
    </>}
    <div className={styles.informations}>
      <section className={styles.calcul}><div className={styles.titreCarte}><CircleHelp size={21} aria-hidden/><h2>Comprendre ma note</h2></div><p>La moyenne repose sur les appréciations humaines après les interventions.</p><div className={styles.sources}><div><span>2/3</span><div><h3>Le client</h3><p>Qualité, délai et rapport qualité-prix.</p></div></div><div><span>1/3</span><div><h3>Le locataire</h3><p>Son expérience lors de l’intervention.</p></div></div></div><p className={styles.aide}>Cette répartition s’applique lorsque les deux avis sont disponibles. Sinon, seule la source disponible est utilisée.</p></section>
      {!erreur && note && <section className={styles.recours}><div className={styles.titreCarte}><Scale size={21} aria-hidden/><h2>Une note à faire réexaminer ?</h2></div><p>Contester votre note est un droit. Votre demande est étudiée par une personne de Gerimmo, jamais par le client qui vous a évalué.</p>{evaluations > 0 ? <><ul><li>Une évaluation retirée est exclue du calcul et la moyenne est recalculée.</li><li>Vous continuez à recevoir des demandes pendant l’examen.</li></ul><Contestation/></> : <div className={styles.recoursVide}><MessageSquareText size={19} aria-hidden/><p>Vous pourrez demander un réexamen dès la première évaluation reçue.</p></div>}</section>}
    </div>
  </div>;
}
