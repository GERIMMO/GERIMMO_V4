"use client";

import Link from "next/link";
import { useContext, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Mail, LockKeyhole, BellRing, CalendarDays, Check, CircleDashed, Clock3, Wallet } from "lucide-react";
import type { BilanReception } from "@/lib/bilan-reception-loyer";
import { SessionVerifications } from "./carte-verifications";
import { lireMontant } from "@/lib/saisie-montant";
import { declarerReceptionLoyer, envoyerRelanceReception, type EtatReceptionLoyer } from "@/app/actions/reception-loyer";
import { nouvelleCleEnvoi } from "@/lib/cle-envoi";
import { deElide } from "@/lib/elision";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { eur, formaterDate, formaterDateHeure, moisEnFrancais } from "@/lib/ged";
import { LIBELLES_PALIERS, pointReception, courrierDisponible } from "@/lib/paliers-reception-loyer";
import type { RappelLoyer } from "@/lib/rappels-loyers";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { afficherToast } from "@/components/ui/toast";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import styles from "./rappels-loyers.module.css";
import { RecommandeElectronique } from "./recommande-electronique";

function resteEnCentimes(ligne: RappelLoyer) {
  return Math.round(Number(ligne.montant_du) * 100) - Math.round(Number(ligne.montant_couvert) * 100);
}

const dateLongue = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
});

export function RappelsLoyersInteractifs({ orgId, aujourdHui, dus, totalEcheancesDues, lectureSeule, dansFenetre = false }: {
  orgId: string; aujourdHui: string; dus: RappelLoyer[]; prochaine: RappelLoyer | null; totalEcheancesDues: number; lectureSeule: boolean;
  dansFenetre?: boolean;
}) {
  const session = useContext(SessionVerifications);
  const [retours, setRetours] = useState<Record<string, { session: number; ligne: RappelLoyer; bilan: BilanReception }>>({});
  const [message, setMessage] = useState<{ session: number; texte: string } | null>(null);
  function memoriser(ligne: RappelLoyer, resultat: EtatReceptionLoyer) {
    const bilan = resultat.bilan;
    if (bilan) {
      setRetours(anciens => ({ ...anciens, [ligne.appel_id]: { session, ligne, bilan } }));
      setMessage(null);
    } else if (resultat.succes) setMessage({ session, texte: resultat.succes });
  }
  const attentes = new Set(dus.map(ligne => ligne.appel_id));
  const reglees = Object.values(retours).filter(r => r.session === session && r.bilan.statut === "regle" && !attentes.has(r.ligne.appel_id));
  const visibles = !dansFenetre ? dus : dus.filter(ligne => ligne.point === undefined || ligne.point?.aConfirmer || retours[ligne.appel_id]?.session === session);
  if (!visibles.length && !reglees.length) return null;
  const lignesAffichees = [...visibles, ...reglees.map(r => r.ligne)].sort((a, b) =>
    a.date_echeance.localeCompare(b.date_echeance) || a.appel_id.localeCompare(b.appel_id));
  const parDate = new Map<string, RappelLoyer[]>();
  for (const ligne of lignesAffichees) {
    const date = ligne.date_echeance.slice(0, 10);
    const groupe = parDate.get(date);
    if (groupe) groupe.push(ligne);
    else parDate.set(date, [ligne]);
  }
  const echeancesVisibles = visibles.reduce((n, ligne) => n + (ligne.dette_bail?.echeances ?? 1), 0);
  const nombre = dansFenetre ? (visibles.length === dus.length ? totalEcheancesDues : echeancesVisibles) : totalEcheancesDues;
  const retards = visibles.reduce((n, ligne) => n + (ligne.dette_bail?.termesEchus ?? Number(ligne.date_echeance.slice(0, 10) < aujourdHui)), 0);
  const totalCentimes = visibles.reduce((somme, ligne) => somme +
    (ligne.dette_bail ? Math.round(ligne.dette_bail.reste * 100) : resteEnCentimes(ligne)), 0);

  return <section className={styles.carte} data-condense={dansFenetre || undefined} aria-labelledby="reception-loyers-titre" data-attente={dus.length > 0}>
    {dansFenetre ? <h2 id="reception-loyers-titre" className="sr-only">Avez-vous reçu vos loyers ?</h2> :
      <div className={styles.entete}><BellRing size={18} aria-hidden="true" /><h2 id="reception-loyers-titre">Avez-vous reçu vos loyers ?</h2></div>}
    <div className={styles.bilan}>
      <span className={styles.icone}><Wallet size={20} aria-hidden="true" /></span>
      <div><span className={styles.libelleTotal}>Total à vérifier</span><strong>{eur(totalCentimes / 100)}</strong></div>
      <span className={styles.compteur}>{dansFenetre && retards ? `${retards} loyer${retards > 1 ? "s" : ""} en retard${retards < nombre ? ` · ${nombre} échéances` : ""}` : nombre ? `${nombre} échéance${nombre > 1 ? "s" : ""}` : dus.length ? "Vérification terminée" : "Tout est réglé"}</span>
    </div>
    {Array.from(parDate, ([date, lignes]) => (
      <div className={styles.groupe} key={date}>
        <h3 className={styles.jour}><CalendarDays size={14} aria-hidden="true" />
          {date === aujourdHui ? "Aujourd’hui" : "Échéance passée"} · <time dateTime={date}>{dateLongue.format(new Date(date + "T12:00:00Z"))}</time>
        </h3>
        <ul className={styles.liste}>{lignes.map(ligne => (
          <ReceptionLoyer key={`${ligne.appel_id}:${ligne.montant_couvert}`} orgId={orgId} ligne={ligne}
            aujourdHui={aujourdHui} lectureSeule={lectureSeule}
            bilan={retours[ligne.appel_id]?.session === session ? retours[ligne.appel_id].bilan : undefined}
            solde={!attentes.has(ligne.appel_id)} onSucces={memoriser} />
        ))}</ul>
        {date === aujourdHui && !lectureSeule && lignes.some(ligne => attentes.has(ligne.appel_id)) && <p className={styles.noteJour}>La première relance sera disponible au délai prévu dans vos paramètres.</p>}
      </div>
    ))}
    {nombre > visibles.length && <p className={styles.precision}>Pour chaque bail, confirmez d’abord le mois le plus ancien.</p>}
    {message?.session === session && <p className={styles.precision} role="status">{message.texte}</p>}
    <p className={styles.pied}><Link href={`/espace/${orgId}/loyers`}>Voir mes finances →</Link></p>
  </section>;
}

function JustificatifReception({ bilan, hrefBail }: { bilan: BilanReception; hrefBail: string }) {
  const doc = bilan.document;
  const nature = bilan.statut === "regle" ? "Quittance" : "Reçu partiel";
  const concordant = doc && doc.quittance === (bilan.statut === "regle");
  return <div className={styles.justificatif} role="status">
    {bilan.comptabilise !== undefined && <p>{bilan.comptabilise ? "Paiement inscrit dans vos comptes." : "Écriture comptable à vérifier."}</p>}
    {concordant ? <>
      <p><Link href={`/quittance/${doc.id}`}>{doc.quittance ? "Quittance créée" : "Reçu partiel créé"}</Link>
        {doc.disponibilite === "disponible" ? " · Disponible dans votre espace et celui du locataire."
          : doc.disponibilite === "en_preparation" ? " · Informations à compléter avant la mise à disposition." : " · Disponibilité à vérifier."}</p>
      {doc.envoyeLe && <p>{doc.quittance ? "Quittance envoyée" : "Reçu envoyé"} au locataire le <time dateTime={doc.envoyeLe}>{formaterDateHeure(doc.envoyeLe)}</time>.</p>}
      {bilan.informationEnvoi ? <p>{bilan.informationEnvoi}</p>
        : !doc.envoyeLe && doc.disponibilite === "disponible" && <p>Aucun envoi par e-mail enregistré.</p>}
    </> : <p>{nature} et envoi à vérifier. <Link href={hrefBail}>Voir le suivi du bail</Link></p>}
  </div>;
}

function ReceptionLoyer({ orgId, ligne, aujourdHui, lectureSeule, bilan, solde, onSucces }: {
  orgId: string; ligne: RappelLoyer; aujourdHui: string; lectureSeule: boolean;
  bilan?: BilanReception; solde: boolean; onSucces: (ligne: RappelLoyer, resultat: EtatReceptionLoyer) => void;
}) {
  const [choix, setChoix] = useState<"recu" | "partiel" | "non_recu" | null>(null);
  const [cle, setCle] = useState("");
  const [montantSaisi, setMontantSaisi] = useState("");
  const uid = useId();
  const router = useRouter();
  const { etat, enCours, soumettre } = useActionFormulaire<EtatReceptionLoyer>(async (precedent, donnees) => {
    const resultat = await declarerReceptionLoyer(orgId,ligne.appel_id,precedent,donnees);
    if (resultat.succes) { onSucces(ligne, resultat); setChoix(null); setCle(""); router.refresh(); }
    return resultat;
  });
  const choisir = (valeur: "recu" | "partiel" | "non_recu") => {
    if (!cle) setCle(nouvelleCleEnvoi());
    setMontantSaisi("");
    setChoix(valeur);
  };
  const reste = resteEnCentimes(ligne) / 100;
  const montantPartiel = lireMontant(montantSaisi);
  const soldeApresSaisie = choix === "partiel" && "montant" in montantPartiel && montantPartiel.montant < reste
    ? (resteEnCentimes(ligne) - Math.round(montantPartiel.montant * 100)) / 100
    : null;
  const dateEcheance = ligne.date_echeance.slice(0, 10);
  const hrefBail = `/espace/${orgId}/baux/${ligne.bail_id}#loyers`;
  const partiel = Number(ligne.montant_couvert) > 0;
  // Un arriéré de plusieurs mois reste lisible sur la ligne du bail (audit du 27/10, LAT-03). « Prioritaire » suit le
  // seuil de l'alerte d'impayé, critique à partir de deux termes échus.
  const autresMois = Math.max(0, (ligne.dette_bail?.echeances ?? 1) - 1);
  const suivi = ligne.relances_automatiques;
  const point = ligne.point === undefined ? pointReception(ligne, aujourdHui) : ligne.point;
  const courrier = courrierDisponible(ligne, aujourdHui);
  const aTraiter = point?.aConfirmer;
  const confirme = point && !aTraiter && point.date <= aujourdHui;
  const prioritaire = (ligne.dette_bail?.termesEchus ?? 0) >= 2;
  const nonRecu = Boolean(ligne.non_recu_signale_le) || bilan?.statut === "non_recu";
  const statut = solde ? "regle" : nonRecu ? "non_recu" : partiel ? "partiel" : undefined;
  return <li id={"suivi-" + ligne.appel_id} tabIndex={-1} className={styles.ligne} data-reception={statut}>
    <div className={styles.resume}>
      <div className={styles.identite}>
        <div className={styles.titreLigne}>
          <b><Link href={hrefBail}>{ligne.lot_nom}</Link></b>
          {!solde && prioritaire && <strong className={styles.prioritaire}>Prioritaire</strong>}
        </div>
        <span>{ligne.locataire ?? "Locataire"}{ligne.periode.slice(0, 7) !== dateEcheance.slice(0, 7) && ` · Loyer ${deElide(moisEnFrancais(ligne.periode.slice(0, 7)))}`}</span>
        {!solde && autresMois > 0 && <span className={styles.arriere}>{autresMois === 1 ? "1 autre mois" : `${autresMois} autres mois`} à recevoir sur ce bail</span>}
      </div>
      <div className={styles.montant}>
        <strong>{eur(solde ? Number(ligne.montant_du) : reste)}</strong>
        {!solde && dateEcheance < aujourdHui && <small className={styles.retard}>En retard</small>}
        {solde && <small className={styles.regle}><Check size={14} aria-hidden="true" />Réglé</small>}
        {!solde && partiel && <small>Restant après {eur(Number(ligne.montant_couvert))} reçus</small>}
        {!solde && autresMois > 0 && ligne.dette_bail && <small className={styles.total}>{eur(ligne.dette_bail.reste)} au total</small>}
      </div>
    </div>
    {bilan && (solde || bilan.statut === "partiel") && <JustificatifReception bilan={bilan} hrefBail={hrefBail} />}
    {!solde && point && point.etape !== "inconnu" && <>
      {point.date > aujourdHui ? <p className={styles.point}>Prochain point le {formaterDate(point.date)} · {LIBELLES_PALIERS[point.etape]}</p>
        : point.confirmationExpiree ? <p className={styles.point}>L’envoi n’a pas été enregistré. Vérifiez à nouveau le solde.</p>
        : point.etape === "echeance" && point.date > dateEcheance ? <p className={styles.point}>Nouveau loyer dû le {formaterDate(point.date)}. Confirmez d’abord le mois le plus ancien.</p>
        : confirme && point.etape !== "recommande" && <p className={styles.point}>{suivi?.active ? "Confirmation enregistrée pour la relance automatique." : "Confirmation enregistrée. Aucun courrier envoyé par cette réponse."}</p>}
    </>}
    {!solde && point?.etape === "inconnu" && <p className={styles.precision}>Le palier de relance n’a pas pu être vérifié.</p>}
    {!solde && nonRecu && <p className={styles.signale} role="status">Pas encore reçu{ligne.non_recu_signale_le && ` · signalé le ${formaterDate(ligne.non_recu_signale_le)}`}</p>}
    {!solde && !lectureSeule && !etat.termine && <>
      {!choix && <div className={styles.reponses}>
        <button type="button" className={styles.recu} onClick={() => choisir("recu")}><Check size={15} aria-hidden="true" />{partiel ? "J’ai reçu le reste" : "J’ai reçu le loyer"}</button>
        <button type="button" className={styles.partiel} onClick={() => choisir("partiel")}><CircleDashed size={15} aria-hidden="true" />Reçu en partie</button>
        <button type="button" className={styles.attente} onClick={() => choisir("non_recu")}><Clock3 size={15} aria-hidden="true" />Pas encore reçu</button>
      </div>}
      {choix && <form data-saisie-confirmee onSubmit={soumettre} className={styles.formulaire} aria-label={`Confirmer le loyer de ${ligne.lot_nom}`}>
        <input type="hidden" name="reponse" value={choix} /><input type="hidden" name="cle_envoi" value={cle} /><input type="hidden" name="reste_attendu" value={reste.toFixed(2)} />
        {choix === "non_recu" ? <p>{point?.etape === "recommande" ? "Votre réponse confirme le solde impayé. Le recommandé ne partira que si vous choisissez de l’envoyer." : suivi?.active ? "Cette réponse autorise la relance automatique si son délai est atteint. Vous serez à nouveau interrogé au prochain palier." : "Votre réponse est enregistrée sans envoyer de courrier. Gerimmo vous redemandera de vérifier votre compte au prochain palier."}</p> : <>
          <p>{choix === "partiel" ? "Indiquez la somme reçue. La confirmation envoie le reçu partiel par e-mail si le locataire a donné son accord." : "En confirmant, vous déclenchez l’envoi de la quittance par e-mail si le locataire a donné son accord."}</p>
          <div className={styles.champs}>
            <label htmlFor={`${uid}-montant`}>Montant reçu (€)<input id={`${uid}-montant`} name="montant" type="text" inputMode="decimal" required readOnly={choix === "recu"} value={choix === "recu" ? reste.toFixed(2).replace(".", ",") : montantSaisi} onChange={event => setMontantSaisi(event.target.value)} /></label>
            <label htmlFor={`${uid}-date`}>Date de réception<input id={`${uid}-date`} name="date_paiement" type="date" required min="1900-01-01" max={aujourdHui} defaultValue={aujourdHui} /></label>
            <label htmlFor={`${uid}-mode`}>Mode de règlement<select id={`${uid}-mode`} name="mode" defaultValue="virement"><option value="virement">Virement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="prelevement">Prélèvement</option><option value="autre">Autre</option></select></label>
          </div>
          {soldeApresSaisie !== null && <p className={styles.apercuSolde} role="status">Restera à recevoir après confirmation <strong>{eur(soldeApresSaisie)}</strong></p>}
        </>}
        <div className={styles.choix}><BoutonEnvoi type="submit" className="btn-or" disabled={enCours || !cle}>{enCours ? "Enregistrement…" : choix === "non_recu" ? "Confirmer : pas encore reçu" : choix === "partiel" ? "Confirmer et envoyer le reçu" : "Confirmer et envoyer la quittance"}</BoutonEnvoi><button type="button" className="btn-secondaire" disabled={enCours} onClick={() => setChoix(null)}>Annuler</button></div>
      </form>}
    </>}
    {!solde && dateEcheance < aujourdHui && <div className={styles.suivi}>
      <div><h4><Mail size={17}/> Suivi des relances</h4>
        <ol className={styles.frise}>{(["relance_1","relance_2","mise_en_demeure"] as const).map((niveau, index) => {
          const envoi = (ligne.historique ?? [ligne.derniere_relance]).find(r => r?.niveau === niveau);
          const transmis = Boolean(envoi || (index === 2 && ligne.recommande_transmis));
          const actif = courrier === (index === 2 ? "recommande" : niveau);
          return <li key={niveau} aria-current={actif ? "step" : undefined} data-etat={transmis ? "fait" : actif ? "actif" : "attente"}>
            <span>{transmis ? <Check size={16}/> : actif && aTraiter ? "?" : index === 2 ? <Mail size={15}/> : index+1}</span>
            <b>{["Relance 1","Relance 2","Recommandé"][index]}</b>
            <small>{envoi ? "Envoyé le " + formaterDate(envoi.date_envoi) : transmis ? "Envoyé" : actif && aTraiter ? "À confirmer" : actif ? "À préparer" : "En attente"}</small>
          </li>;
        })}</ol>
      </div><div className={styles.suite}>
      {!courrier && point?.etape === "recommande" && point.date > aujourdHui && <p className={styles.verrou}><LockKeyhole size={15}/> En attente du délai après la deuxième relance.</p>}
      {!lectureSeule && !choix && confirme && nonRecu && bilan?.statut !== "partiel" && <>
      {(courrier === "relance_1" || courrier === "relance_2") && <>
        <details className={styles.gestion}><summary>{courrier === "relance_1" ? "Gérer la première relance" : "Gérer la deuxième relance"}</summary>
        <EnvoiRelance key={courrier} orgId={orgId} ligne={ligne} niveau={courrier} />
        <div className={styles.choix}><BoutonGenererDocument key={courrier} orgId={orgId} code={courrier === "relance_1" ? "relance_simple" : "seconde_relance"} cibleId={ligne.bail_id}
          cheminRetour={`/espace/${orgId}`} libelle={courrier === "relance_1" ? "Préparer la première relance en PDF" : "Préparer la deuxième relance en PDF"} /></div></details>
      </>}
      {courrier === "recommande" && <PreparationRecommande orgId={orgId} ligne={ligne} />}
      </>}<Link className={styles.lienSuivi} href={`/espace/${orgId}/baux/${ligne.bail_id}#relances`}>Suivre les relances dans le bail</Link></div>
    </div>}
    {etat.erreur && <p className="err mt-3" role="alert">{etat.erreur}</p>}
  </li>;
}

function EnvoiRelance({ orgId, ligne, niveau }: { orgId: string; ligne: RappelLoyer; niveau: "relance_1" | "relance_2" }) {
  const router = useRouter();
  const { etat, enCours, soumettre } = useActionFormulaire(async (precedent, donnees) => {
    const resultat = await envoyerRelanceReception(orgId,ligne.appel_id,precedent,donnees);
    if (resultat.succes) { afficherToast(resultat.succes); router.refresh(); }
    return resultat;
  });
  if (etat.succes) return <p className={styles.succes} role="status">{etat.succes}</p>;
  const reste = Number(ligne.montant_du)-Number(ligne.montant_couvert);
  // Le courriel annonce aussi la dette échue totale du bail : la confirmation la montre avant l'envoi.
  const total = ligne.dette_bail && ligne.dette_bail.resteEchu > reste + 0.004 ? ligne.dette_bail.resteEchu : null;
  return <form data-saisie-confirmee onSubmit={soumettre} className={styles.formulaire}>
    <input type="hidden" name="reste_attendu" value={reste.toFixed(2)} />
    <input type="hidden" name="niveau" value={niveau} />
    <p>Envoyer au locataire {niveau === "relance_1" ? "une première relance" : "une deuxième relance"} pour le loyer {deElide(moisEnFrancais(ligne.periode.slice(0,7)))} : {eur(reste)} restant à recevoir{total !== null && <>, {eur(total)} échus au total sur le bail</>}. Vérifiez votre compte bancaire avant l’envoi.</p>
    <label className={styles.confirmationEnvoi}><input type="checkbox" name="confirmer" value="oui" required />Je confirme que ce règlement n’a pas été reçu et souhaite relancer le locataire et les colocataires concernés par e-mail.</label>
    <div className={styles.choix}><BoutonEnvoi variant="outline" className="btn-secondaire" type="submit" disabled={enCours}>{enCours ? "Envoi…" : (niveau === "relance_1" ? "Envoyer la première relance par e-mail" : "Envoyer la deuxième relance par e-mail")}</BoutonEnvoi></div>
    {etat.erreur && <p className="err mt-3" role="alert">{etat.erreur}</p>}
  </form>;
}

function PreparationRecommande({ orgId, ligne }: { orgId: string; ligne: RappelLoyer }) {
  const [delai, setDelai] = useState("15");
  const uid = useId();
  const valide = /^\d+$/.test(delai) && Number(delai) >= 1 && Number(delai) <= 90;
  return <div className={styles.recommande}>
    <div className={styles.disponible}><Info size={17} aria-hidden="true" /><strong>Recommandé AR24 disponible</strong></div>
    <RecommandeElectronique orgId={orgId} bailId={ligne.bail_id} delai={Number(delai)} libelle="Préparer l’envoi du recommandé AR24" />
    <div className={styles.choix}>{valide ? <BoutonGenererDocument key={delai} orgId={orgId} code="mise_en_demeure" cibleId={ligne.bail_id} cheminRetour={`/espace/${orgId}`} libelle="Générer le recommandé en PDF" options={{ delai }} /> : <p role="alert">Indiquez un nombre entier de 1 à 90 jours.</p>}</div>
    <details><summary>Délai de règlement · {delai} jours</summary>
    <label htmlFor={`${uid}-delai`}>Délai de règlement (jours)<input id={`${uid}-delai`} type="number" min="1" max="90" step="1" value={delai} onChange={event => setDelai(event.target.value)} aria-describedby={`${uid}-aide`} /></label>
    <p id={`${uid}-aide`}>De 1 à 90 jours. Le PDF récapitule toutes les échéances impayées du bail.</p></details>


  </div>;
}
