import Link from "next/link";
import { ArrowRight, ArrowUpRight, Banknote, FileText, Settings2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { baseEspace } from "@/lib/racine-espace";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { chargerVerificationsProprietaire } from "@/lib/lecture-verifications-proprietaire";
import { chargerPilotageProprietaire } from "@/lib/pilotage-proprietaire";
import { ParcoursDemarrage } from "@/components/parcours-demarrage";
import { RappelsLoyers } from "@/components/rappels-loyers";
import { AccueilBienvenue } from "@/components/accueil-bienvenue";
import { CarteVerifications } from "@/components/carte-verifications";
import { CarteTachesProprietaire } from "@/components/carte-taches-proprietaire";
import { construireTachesAccueil } from "@/lib/taches-accueil-proprietaire";
import { ActionsRapidesIncident } from "@/components/actions-rapides-incident";
import { chargerIncidentsVerifications } from "@/lib/incidents-verifications";
import styles from "./accueil-proprietaire.module.css";

export async function AccueilProprietaire({ supabase, orgId, prenom = null, userId, lectureSeule = false }: {
  supabase: SupabaseClient; orgId: string;
  organisation: { name: string; status: string; essai_fin: string | null };
  userId: string; lectureSeule?: boolean; prenom?: string | null;
}) {
  const base = baseEspace(orgId, true);
  const aujourdHui = aujourdhuiParis();
  const [pilotage, lectureVerifications] = await Promise.all([
    chargerPilotageProprietaire(supabase, orgId, aujourdHui),
    chargerVerificationsProprietaire(supabase, orgId, { userId, portefeuille: null }),
  ]);
  const { erreurs, lectureLoyers, verifications } = lectureVerifications;
  const { actions, rappels } = verifications;
  const lectureIncidents = await chargerIncidentsVerifications(supabase, orgId, actions);
  const incertain = Object.values(erreurs).some(Boolean) || Boolean(lectureLoyers.error);
  const cible = (a: ActionDuJour) => a.source === "alerte" ? a.href ?? `${base}/alertes?traiter=${a.alerte.id}` : a.href;
  const geste = (a: ActionDuJour) => a.source === "bail" ? "Ouvrir le bail"
    : a.source === "rapport" ? "Valider"
    : a.href?.startsWith(`${base}/incidents?`) ? "Ouvrir l’incident" : "Traiter";
  const { patrimoine, encaisse, reglages, diagnostics } = pilotage;
  const nomsLots = new Map(patrimoine?.lots.map(lot => [lot.id, lot.nom]) ?? []);
  const contexteAction = (action: ActionDuJour) => action.source === "alerte" && typeof action.alerte.details?.lot_id === "string"
    ? nomsLots.get(action.alerte.details.lot_id) : null;
  const critiques = actions.filter(a => a.criticite === "critique");
  const incidentsAvecActions = new Set<string>();
  const listeDemandes = (liste: ActionDuJour[], titre: string, id: string) => liste.length > 0 && <section className={styles.demandes} aria-labelledby={id}>
    <h2 id={id} className="sr-only">{titre}</h2>
    <ul className={`${styles.liste} ${styles.listeDemandes}`}>{liste.map(a => {
      const incidentId = a.source === "alerte" ? a.alerte.details?.incident_id : null;
      const incident = typeof incidentId === "string" && !incidentsAvecActions.has(incidentId) ? lectureIncidents.incidents.get(incidentId) : null;
      if (incident) {
        incidentsAvecActions.add(incident.id);
        return <li key={a.cle} className={styles.demandeIncident}>
          <div className={styles.titreIncident}><div><h3>{a.titre}</h3>{contexteAction(a) && <p>{contexteAction(a)}</p>}{a.detail && a.detail.trim() !== incident.description?.trim() && <p>{a.detail}</p>}</div>{a.criticite === "critique" && <strong className={styles.urgent}>Prioritaire</strong>}</div>
          <ActionsRapidesIncident orgId={orgId} href={cible(a)} incident={incident} lectureSeule={lectureSeule} />
        </li>;
      }
      return <li key={a.cle}><Link className={styles.rang} href={cible(a)}><span><b>{a.titre}</b>{contexteAction(a) && <small className={styles.contexte}>{contexteAction(a)}</small>}{a.detail && <small>{a.detail}</small>}{a.echeance && <small>Échéance : {formaterDate(a.echeance)}</small>}</span><span className={styles.geste}>{a.criticite === "critique" && <strong className={styles.urgent}>Prioritaire</strong>}{geste(a)}<ArrowRight size={14} aria-hidden="true" /></span></Link></li>;
    })}</ul>
  </section>;
  const date = new Date(`${aujourdHui}T12:00:00Z`);
  const nomMois = date.toLocaleDateString("fr-FR", { month: "long", timeZone: "Europe/Paris" });
  const candidats = patrimoine?.lotsSansBail.slice(0, 3) ?? [];
  const preparation = await Promise.all(candidats.map(async lot => {
    try {
      const { data, error } = await supabase.rpc("lot_blocages_location", { p_lot: lot.id });
      return { lot, blocages: error || !Array.isArray(data) ? null : data as string[] };
    } catch { return { lot, blocages: null }; }
  }));
  const taches = construireTachesAccueil({ base, actions, lots: patrimoine?.lots ?? [], lotsSansBail: patrimoine?.lotsSansBail ?? [], lotsEnPreparation: patrimoine?.lotsEnPreparation ?? [], preparation, diagnostics: diagnostics ?? [] });
  // Chaque échéance due compte, même quand la fenêtre ne présente que la plus ancienne de son bail (audit du 27/10, LAT-03).
  const totalPrioritaire = critiques.length + rappels.totalEcheancesDues;
  const automatisations = [
    { nom: "Avis d’échéance", active: reglages?.appels_envoi_auto },
    { nom: "Envoi des quittances", active: reglages?.quittances_envoi_auto },
    { nom: "Relances d’impayés", active: reglages?.relances_envoi_auto },
  ];

  return <main className={styles.page}>
    <AccueilBienvenue jourParis={aujourdHui} prenom={prenom} base={base} lectureSeule={lectureSeule} />

    <section className={styles.indicateurs} aria-label="Votre patrimoine en bref">
      {/* Total des règlements datés du mois, quelle que soit l'échéance réglée : il mène aux recettes datées de Finances,
          pas à la couverture des échéances du mois (audit du 27/10, LAT-06). */}
      <Link href={`${base}/loyers#operations`} className={styles.indicateur}><span><Banknote size={18} aria-hidden="true" />Encaissé en {nomMois}</span><strong>{encaisse === null ? "—" : eur(encaisse)}</strong><small>{encaisse === null ? "Montant indisponible" : "Reçus ce mois, toutes échéances"}</small><ArrowUpRight size={18} className={styles.flecheIndicateur} aria-hidden="true" /></Link>
      <CarteVerifications base={base} patrimoine={patrimoine ? { biens: patrimoine.biens, lots: patrimoine.lots.length } : null}
        loyersAConfirmer={rappels.totalEcheancesDues}
        total={totalPrioritaire || (incertain ? 0 : taches.length)} critiques={verifications.critiques} apercu={verifications.premiere?.titre ?? null}
        hrefTaches="#taches-proprietaire"
        indisponible={incertain} className={styles.indicateur}>
        {Object.values(erreurs).some(Boolean) && <p className="err" role="alert">Certaines demandes sont indisponibles. La liste peut être incomplète.</p>}
        {lectureIncidents.indisponible && <p className={styles.note}>Certaines actions rapides sont indisponibles. Vous pouvez ouvrir la fiche de l’incident.</p>}
        {listeDemandes(critiques, "Prioritaires", "priorites-titre")}
        <RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} />
        {actions.length > 0 && <Link className={styles.toutesDemandes} href={`${base}/alertes`}>Voir toutes les demandes<ArrowRight size={15} aria-hidden="true" /></Link>}
      </CarteVerifications>
      <Link href={`${base}/parc`} className={styles.indicateur}><span><FileText size={18} aria-hidden="true" />Locations en cours</span><strong>{patrimoine ? patrimoine.contrats : "—"}</strong><small>{patrimoine ? `${patrimoine.lotsOccupes} lot${patrimoine.lotsOccupes > 1 ? "s" : ""} occupé${patrimoine.lotsOccupes > 1 ? "s" : ""}` : "Locations indisponibles"}</small><ArrowUpRight size={18} className={styles.flecheIndicateur} aria-hidden="true" /></Link>
    </section>
    {(encaisse === null || patrimoine === null) && <p className="err" role="alert">Certains chiffres n’ont pas pu être vérifiés. Rechargez la page.</p>}

    <div className={styles.grille}>
      <div className={styles.principal}>
        <ParcoursDemarrage supabase={supabase} orgId={orgId} estProprietaire automatiqueProposeAilleurs />

        <CarteTachesProprietaire taches={taches} base={base} indisponible={incertain || patrimoine === null || diagnostics === null}
          prioritesPresentes={totalPrioritaire > 0} chambresSansBail={patrimoine?.chambresSansBail ?? 0} totalAFaire={incertain ? 0 : verifications.total} />
      </div>

      <aside className={styles.secondaire} aria-label="Outils de gestion">
        <section className={styles.carte} aria-labelledby="auto-titre">
          <div className={styles.teteCarte}><h2 id="auto-titre"><Settings2 size={20} aria-hidden="true" />Vos automatismes</h2></div>
          <p className={styles.note}>Les échéances sont calculées depuis vos baux. Les quittances sont préparées après confirmation du règlement.</p>
          {reglages ? <dl className={styles.automatismes}>{automatisations.map(a => <div key={a.nom}><dt>{a.nom}</dt><dd data-actif={a.active === true}>{a.active ? "Activé" : "Manuel"}</dd></div>)}</dl> : <p className="err" role="alert">Réglages d’envoi indisponibles.</p>}
          <Link className={styles.lienPied} href={`${base}/profil#envois`}>Régler les envois<ArrowRight size={15} aria-hidden="true" /></Link>
        </section>
        <nav className={styles.outils} aria-label="Outils du propriétaire">
          <Link href={`${base}/documents?sel=depot`}>Déposer un document<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href={`${base}/comptabilite/fiscal`}>Préparer ma déclaration<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href={`${base}/parc/import`}>Importer mon parc<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href={`${base}/journal`}>Le journal Gerimmo<ArrowRight size={16} aria-hidden="true" /></Link>
        </nav>
      </aside>
    </div>
  </main>;
}
