import { chargerTachesConsommations } from "@/lib/taches-consommations";
import { SuiviEcheanciersCharges } from "@/components/suivi-echeanciers-charges";
import Link from "next/link";
import { ArrowRight, Banknote, FileText, Settings2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { baseEspace } from "@/lib/racine-espace";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { chargerVerificationsProprietaire } from "@/lib/lecture-verifications-proprietaire";
import { chargerPilotageProprietaire } from "@/lib/pilotage-proprietaire";
import { ParcoursDemarrage } from "@/components/parcours-demarrage";
import { RappelsLoyers } from "@/components/rappels-loyers";
import { ActionsAccueilProprietaire } from "@/components/actions-accueil-proprietaire";
import { ConseilsAccueilProprietaire } from "@/components/conseils-accueil-proprietaire";
import { resumerLoyersParcMois } from "@/lib/loyers-parc-mois";
import { AccueilBienvenue } from "@/components/accueil-bienvenue";
import { libellesPoints, pointReception } from "@/lib/paliers-reception-loyer";
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
  const [pilotage, lectureVerifications, lectureConsommations, echeances] = await Promise.all([
    chargerPilotageProprietaire(supabase, orgId, aujourdHui),
    chargerVerificationsProprietaire(supabase, orgId, { userId, portefeuille: null, avecPaliers: true }),
    chargerTachesConsommations(supabase, orgId, base, aujourdHui),
    (async () => {
      try { return await supabase.rpc("quittancement_mois", { p_org: orgId, p_mois: `${aujourdHui.slice(0, 7)}-01` }); }
      catch { return { data: null, error: true }; }
    })(),
  ]);
  const { erreurs, lectureLoyers, verifications } = lectureVerifications;
  const { actions, rappels } = verifications;
  const lectureIncidents = await chargerIncidentsVerifications(supabase, orgId, actions);
  const suiviIncomplet = rappels.dus.some(l => l.point?.etape === "inconnu");
  const incertain = suiviIncomplet || lectureConsommations.indisponible || Object.values(erreurs).some(Boolean) || Boolean(lectureLoyers.error);
  const cible = (a: ActionDuJour) => a.source === "alerte" ? a.href ?? `${base}/alertes?traiter=${a.alerte.id}` : a.href;
  const geste = (a: ActionDuJour) => a.source === "bail" ? "Ouvrir le bail"
    : a.source === "rapport" ? "Valider"
    : a.href?.startsWith(`${base}/incidents?`) ? "Ouvrir l’incident" : "Traiter";
  const { patrimoine, reglages, diagnostics } = pilotage;
  const idsLots = new Set(patrimoine?.lots.map(l => l.id) ?? []);
  const loyersMois = patrimoine && !echeances.error && Array.isArray(echeances.data)
    ? resumerLoyersParcMois((echeances.data as { lot_id: string; montant_du: number | string; montant_couvert: number | string }[]).filter(l => idsLots.has(l.lot_id))) : null;
  const pourcentage = loyersMois && loyersMois.attendu > 0 ? Math.min(100, Math.round(loyersMois.encaisse / loyersMois.attendu * 100)) : null;
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
  if (pilotage.coordonneesACompleter) taches.unshift({
    cle: "coordonnees-courriers", type: "coordonnees", titre: "Compléter les coordonnées pour vos courriers",
    detail: null, contexte: null, lieu: null, echeance: null, href: `${base}/profil`, geste: "Compléter le profil", nature: "demande",
  });
  taches.push(...lectureConsommations.taches);
  const points = rappels.dus.map(ligne => ligne.point === undefined ? pointReception(ligne, aujourdHui) : ligne.point);
  const loyersAConfirmer = rappels.dus.reduce((n, ligne, i) => n + (points[i]?.aConfirmer ? ligne.dette_bail.echeances : 0), 0);
  const totalPrioritaire = critiques.length + loyersAConfirmer;
  const automatisations = [
    { nom: "Avis d’échéance", active: reglages?.appels_envoi_auto },
    { nom: "Envoi des quittances", active: reglages?.quittances_envoi_auto },
    { nom: "Relances d’impayés", active: reglages?.relances_envoi_auto },
  ];

  return <main className={styles.page}>
    <AccueilBienvenue jourParis={aujourdHui} prenom={prenom} base={base} lectureSeule={lectureSeule} />

    <section className={styles.indicateurs} aria-label="Votre patrimoine en bref">
      <Link href={`${base}/loyers`} className={styles.indicateur}>
        <span><Banknote size={22} aria-hidden="true"/>Loyers encaissés</span>
        <small>En {nomMois}</small>
        <div className={styles.montantLoyer}><strong>{loyersMois ? eur(loyersMois.encaisse) : "—"}</strong>{loyersMois && loyersMois.attendu > 0 && <em>sur {eur(loyersMois.attendu)}</em>}</div>
        {pourcentage !== null ? <div className={styles.progressionLoyer}><span role="progressbar" aria-label={`Loyers encaissés en ${nomMois}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pourcentage}><i style={{width:`${pourcentage}%`}}/></span><small>{pourcentage} %</small></div> : <small>{loyersMois ? "Aucun loyer attendu ce mois-ci" : "Montants indisponibles"}</small>}
        <ArrowRight size={18} className={styles.flecheIndicateur} aria-hidden="true"/>
      </Link>
      <CarteVerifications base={base} patrimoine={patrimoine ? { biens: patrimoine.biens, lots: patrimoine.lots.length } : null}
        loyersAConfirmer={loyersAConfirmer} paliersLoyers={libellesPoints(points)}
        total={totalPrioritaire || (incertain ? 0 : taches.length)} critiques={verifications.critiques} apercu={verifications.premiere?.titre ?? null}
        hrefTaches="#taches-proprietaire"
        indisponible={incertain} className={styles.indicateur}>
        {Object.values(erreurs).some(Boolean) && <p className="err" role="alert">Certaines demandes sont indisponibles. La liste peut être incomplète.</p>}
        {suiviIncomplet && <p className={styles.note}>Le palier de certains loyers n’a pas pu être vérifié. <Link href={`${base}/loyers`}>Voir les finances</Link></p>}
        {lectureIncidents.indisponible && <p className={styles.note}>Certaines actions rapides sont indisponibles. Vous pouvez ouvrir la fiche de l’incident.</p>}
        {listeDemandes(critiques, "Prioritaires", "priorites-titre")}
        <RappelsLoyers supabase={supabase} orgId={orgId} lectureSeule={lectureSeule} rappelsLus={rappels} />
        {(critiques.length > 0 || (actions.length > 0 && !loyersAConfirmer)) && <Link className={styles.toutesDemandes} href={`${base}/alertes`}>Voir toutes les demandes<ArrowRight size={15} aria-hidden="true" /></Link>}
      </CarteVerifications>
      <Link href={`${base}/parc`} className={styles.indicateur}><span><FileText size={18} aria-hidden="true" />Locations en cours</span><strong>{patrimoine ? patrimoine.contrats : "—"}</strong><small>{patrimoine ? `${patrimoine.lotsOccupes} lot${patrimoine.lotsOccupes > 1 ? "s" : ""} occupé${patrimoine.lotsOccupes > 1 ? "s" : ""}` : "Locations indisponibles"}</small><ArrowRight size={18} className={styles.flecheIndicateur} aria-hidden="true" /></Link>
    </section>
    {(loyersMois === null || patrimoine === null) && <p className="err" role="alert">Certains chiffres n’ont pas pu être vérifiés. Rechargez la page.</p>}

    <ActionsAccueilProprietaire base={base} lots={patrimoine?.lots ?? null} lectureSeule={lectureSeule}/>

    <SuiviEcheanciersCharges org={orgId} proprietaire base={base} rappelsSeulement />

    <div className={styles.grille}>
      <div className={styles.principal}>
        <CarteTachesProprietaire titre="Mes événements" limite={3}
          introduction={<ParcoursDemarrage supabase={supabase} orgId={orgId} estProprietaire automatiqueProposeAilleurs/>} taches={taches} base={base} indisponible={incertain || patrimoine === null || diagnostics === null || lectureConsommations.indisponible}
          prioritesPresentes={totalPrioritaire > 0} chambresSansBail={patrimoine?.chambresSansBail ?? 0} />
      </div>

      <aside className={styles.secondaire} aria-label="Articles et outils du propriétaire">
        <ConseilsAccueilProprietaire db={supabase} base={base}/>
      </aside>
    </div>
    <details className={styles.reglagesDiscrets}>
      <summary><Settings2 size={17} aria-hidden="true"/>Mes automatismes et outils</summary>
      <div className={styles.outilsSecondaires}>
        <section aria-label="Envois automatiques">
          {reglages ? <dl className={styles.automatismes}>{automatisations.map(a => <div key={a.nom}><dt>{a.nom}</dt><dd data-actif={a.active === true}>{a.active ? "Activé" : "Manuel"}</dd></div>)}</dl> : <p className="err" role="alert">Réglages d’envoi indisponibles.</p>}
          <Link className={styles.lienPied} href={`${base}/profil#envois`}>Régler les envois<ArrowRight size={15} aria-hidden="true"/></Link>
        </section>
        <nav className={styles.outils} aria-label="Outils du propriétaire">
          <Link href={`${base}/comptabilite/fiscal`}>Préparer ma déclaration<ArrowRight size={16} aria-hidden="true"/></Link>
          <Link href={`${base}/parc/import`}>Importer mon parc<ArrowRight size={16} aria-hidden="true"/></Link>
        </nav>
      </div>
    </details>
  </main>;
}
