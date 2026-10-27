"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarDays } from "lucide-react";
import { declarerReceptionLoyer, envoyerRelanceReception, type EtatReceptionLoyer } from "@/app/actions/reception-loyer";
import { nouvelleCleEnvoi } from "@/lib/cle-envoi";
import { deElide } from "@/lib/elision";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import type { RappelLoyer } from "@/lib/rappels-loyers";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { afficherToast } from "@/components/ui/toast";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import styles from "./rappels-loyers.module.css";

export function RappelsLoyersInteractifs({ orgId, aujourdHui, dus, totalEcheancesDues, lectureSeule, dansFenetre = false }: {
  orgId: string; aujourdHui: string; dus: RappelLoyer[]; prochaine: RappelLoyer | null; totalEcheancesDues: number; lectureSeule: boolean;
  dansFenetre?: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  if (!dus.length) return null;
  return <section className={styles.carte} aria-labelledby="reception-loyers-titre" data-attente={dus.length > 0}>
    {dansFenetre ? <h2 id="reception-loyers-titre" className="sr-only">Avez-vous reçu vos loyers ?</h2> : <div className={styles.entete}><span className={styles.icone}><BellRing size={22} aria-hidden="true" /></span><div><h2 id="reception-loyers-titre">Avez-vous reçu vos loyers ?</h2><p>Confirmez les règlements reçus à l’échéance.</p></div><span className={styles.compteur}>{totalEcheancesDues} à confirmer</span></div>}
    {dus.length > 0 ? <>
      <ul className={styles.liste}>{dus.map(l => <ReceptionLoyer key={`${l.appel_id}:${l.montant_couvert}`} orgId={orgId} ligne={l} aujourdHui={aujourdHui} lectureSeule={lectureSeule} onSucces={setConfirmation} />)}</ul>
      {totalEcheancesDues > dus.length && <p className={styles.precision}>Plusieurs mois restent à vérifier sur certains baux. Le plus ancien est présenté en premier ; le suivant apparaîtra une fois celui-ci réglé.</p>}
    </> : null}
    {confirmation && <p className={`${styles.succes} px-6 pb-4`} role="status">{confirmation}</p>}
    <p className={styles.pied}><Link href={`/espace/${orgId}/loyers`}>Voir mes finances →</Link></p>
  </section>;
}

function ReceptionLoyer({ orgId, ligne, aujourdHui, lectureSeule, onSucces }: { orgId: string; ligne: RappelLoyer; aujourdHui: string; lectureSeule: boolean; onSucces: (message: string) => void }) {
  const [choix, setChoix] = useState<"recu" | "partiel" | "non_recu" | null>(null);
  const [cle, setCle] = useState("");
  const uid = useId();
  const router = useRouter();
  const { etat, enCours, soumettre } = useActionFormulaire<EtatReceptionLoyer>(async (precedent, donnees) => {
    const resultat = await declarerReceptionLoyer(orgId,ligne.appel_id,precedent,donnees);
    if (resultat.succes) { onSucces(resultat.succes); setChoix(null); setCle(""); if (resultat.termine) afficherToast(resultat.succes); router.refresh(); }
    return resultat;
  });
  const choisir = (valeur: "recu" | "partiel" | "non_recu") => {
    if (!cle) setCle(nouvelleCleEnvoi());
    setChoix(valeur);
  };
  const reste = Math.round((Number(ligne.montant_du) - Number(ligne.montant_couvert)) * 100) / 100;
  const partiel = Number(ligne.montant_couvert) > 0;
  // Un arriéré de plusieurs mois reste lisible sur la ligne du bail (audit du 27/10, LAT-03). « Prioritaire » suit le
  // seuil de l'alerte d'impayé, critique à partir de deux termes échus.
  const autresMois = Math.max(0, (ligne.dette_bail?.echeances ?? 1) - 1);
  const prioritaire = (ligne.dette_bail?.termesEchus ?? 0) >= 2;
  return <li className={styles.ligne}>
    <div className={styles.resume}><div className={styles.identite}><div className={styles.titreLigne}><b>{ligne.lot_nom}</b>{prioritaire && <strong className={styles.prioritaire}>Prioritaire</strong>}</div><span>{ligne.locataire ?? "Locataire"} · {moisEnFrancais(ligne.periode.slice(0,7))}</span><span className={styles.date}><CalendarDays size={14} aria-hidden="true" />Prévu le {formaterDate(ligne.date_echeance)}{ligne.date_echeance.slice(0,10) < aujourdHui && " · échéance passée"}</span>{autresMois > 0 && <span className={styles.arriere}>{autresMois === 1 ? "1 autre mois" : `${autresMois} autres mois`} à recevoir sur ce bail</span>}</div><div className={styles.montant}><strong>{eur(reste)}</strong><span>{partiel ? "restant à recevoir" : "à recevoir"}</span>{partiel && <small>{eur(Number(ligne.montant_couvert))} déjà enregistrés</small>}{autresMois > 0 && ligne.dette_bail && <small className={styles.total}>{eur(ligne.dette_bail.reste)} au total</small>}</div></div>
    {ligne.non_recu_signale_le && <p className={styles.signale}>Pas encore reçu · signalé le {formaterDate(ligne.non_recu_signale_le)}</p>}
    {!lectureSeule && !etat.termine && <>
      {!choix && <div className={styles.choix}>
        <button type="button" className="btn-or" onClick={() => choisir("recu")}>{partiel ? "J’ai reçu le reste" : "J’ai reçu le loyer"}</button>
        <button type="button" className="btn-secondaire" onClick={() => choisir("partiel")}>Reçu en partie</button>
        <button type="button" className="btn-secondaire" onClick={() => choisir("non_recu")}>Pas encore reçu</button>
      </div>}
      {choix && <form data-saisie-confirmee onSubmit={soumettre} className={styles.formulaire} aria-label={`Confirmer le loyer de ${ligne.lot_nom}`}>
        <input type="hidden" name="reponse" value={choix} /><input type="hidden" name="cle_envoi" value={cle} /><input type="hidden" name="reste_attendu" value={reste.toFixed(2)} />
        {choix === "non_recu" ? <p>Gerimmo conservera votre réponse. Ce loyer restera à recevoir ; aucun message ne sera envoyé au locataire.</p> : <>
          <p>{choix === "partiel" ? "Indiquez uniquement la somme effectivement reçue." : "Vérifiez la date et le mode de réception avant de confirmer."}</p>
          <div className={styles.champs}>
            <label htmlFor={`${uid}-montant`}>Montant reçu (€)<input id={`${uid}-montant`} name="montant" type="text" inputMode="decimal" required readOnly={choix === "recu"} defaultValue={choix === "recu" ? reste.toFixed(2).replace(".", ",") : ""} /></label>
            <label htmlFor={`${uid}-date`}>Date de réception<input id={`${uid}-date`} name="date_paiement" type="date" required min="1900-01-01" max={aujourdHui} defaultValue={aujourdHui} /></label>
            <label htmlFor={`${uid}-mode`}>Mode de règlement<select id={`${uid}-mode`} name="mode" defaultValue="virement"><option value="virement">Virement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="prelevement">Prélèvement</option><option value="autre">Autre</option></select></label>
          </div>
        </>}
        <div className={styles.choix}><BoutonEnvoi type="submit" className="btn-or" disabled={enCours || !cle}>{enCours ? "Enregistrement…" : choix === "non_recu" ? "Confirmer : pas encore reçu" : "Confirmer la réception"}</BoutonEnvoi><button type="button" className="btn-secondaire" disabled={enCours} onClick={() => setChoix(null)}>Annuler</button></div>
      </form>}
    </>}
    {!lectureSeule && <details className={styles.gestion}>
      <summary>Gérer la relance et le recommandé</summary>
      {ligne.date_echeance.slice(0,10) === aujourdHui ? <p className={styles.precision}>Ce loyer est prévu aujourd’hui. Les relances seront disponibles dès demain si le règlement reste en attente.</p> : <>
        {ligne.historique_relances_disponible === false ? <p className={styles.precision} role="status">Le suivi des relances n’a pas pu être vérifié. Consultez le bail avant de préparer un nouvel envoi.</p> : ligne.derniere_relance ? <p className={styles.precision}>Une {ligne.derniere_relance.niveau === "mise_en_demeure" ? "mise en demeure" : ligne.derniere_relance.niveau === "relance_2" ? "seconde relance" : "première relance"} a été enregistrée le {formaterDate(ligne.derniere_relance.date_envoi)}. Consultez le suivi du bail pour décider de la suite.</p> : <EnvoiRelance orgId={orgId} ligne={ligne} />}
        {!ligne.derniere_relance && ligne.historique_relances_disponible !== false && <div className={styles.choix}>
          <BoutonGenererDocument orgId={orgId} code="relance_simple" cibleId={ligne.bail_id} cheminRetour={`/espace/${orgId}`} libelle="Préparer une relance" />
        </div>}
        {ligne.historique_relances_disponible !== false && ligne.derniere_relance?.niveau !== "mise_en_demeure" && <PreparationRecommande orgId={orgId} ligne={ligne} />}
      </>}
      <div className={styles.choix}><Link className="btn-secondaire" href={`/espace/${orgId}/baux/${ligne.bail_id}#relances`}>Suivre les relances et l’envoi</Link></div>
    </details>}
    {etat.erreur && <p className="err mt-3" role="alert">{etat.erreur}</p>}
  </li>;
}

function EnvoiRelance({ orgId, ligne }: { orgId: string; ligne: RappelLoyer }) {
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
    <p>Envoyer au locataire une relance amiable pour le loyer {deElide(moisEnFrancais(ligne.periode.slice(0,7)))} : {eur(reste)} restant à recevoir{total !== null && <>, {eur(total)} échus au total sur le bail</>}. Vérifiez votre compte bancaire avant l’envoi.</p>
    <label className={styles.confirmationEnvoi}><input type="checkbox" name="confirmer" value="oui" required />Je confirme que ce règlement n’a pas été reçu et souhaite relancer le locataire et les colocataires concernés par e-mail.</label>
    <div className={styles.choix}><BoutonEnvoi className="btn-secondaire" type="submit" disabled={enCours}>{enCours ? "Envoi…" : "Envoyer la relance par e-mail"}</BoutonEnvoi></div>
    {etat.erreur && <p className="err mt-3" role="alert">{etat.erreur}</p>}
  </form>;
}

function PreparationRecommande({ orgId, ligne }: { orgId: string; ligne: RappelLoyer }) {
  const [delai, setDelai] = useState("15");
  const uid = useId();
  const valide = /^\d+$/.test(delai) && Number(delai) >= 1 && Number(delai) <= 90;
  return <details className={styles.recommande}>
    <summary>Préparer le recommandé</summary>
    <p>Choisissez le délai de règlement indiqué dans votre mise en demeure, à compter de sa réception.</p>
    {!ligne.derniere_relance && <p className={styles.signale}>Aucune relance préalable n’est enregistrée pour cette échéance. Vérifiez le dossier avant de préparer la mise en demeure.</p>}
    <label htmlFor={`${uid}-delai`}>Délai de règlement (jours)<input id={`${uid}-delai`} type="number" min="1" max="90" step="1" value={delai} onChange={event => setDelai(event.target.value)} aria-describedby={`${uid}-aide`} /></label>
    <p id={`${uid}-aide`}>De 1 à 90 jours. Le PDF récapitule toutes les échéances impayées du bail.</p>
    <div className={styles.choix}>{valide ? <BoutonGenererDocument key={delai} orgId={orgId} code="mise_en_demeure" cibleId={ligne.bail_id} cheminRetour={`/espace/${orgId}`} libelle="Générer le recommandé en PDF" options={{ delai }} /> : <p role="alert">Indiquez un nombre entier de 1 à 90 jours.</p>}</div>
    <p>Le courrier est à envoyer hors de Gerimmo. Son numéro de suivi et sa première présentation se renseignent dans le bail.</p>
  </details>;
}
