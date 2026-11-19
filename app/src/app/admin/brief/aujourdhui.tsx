import Link from "next/link";
import { ArrowUpRight, CircleAlert, HeartPulse } from "lucide-react";
import { inTrial, matchesFinanceFilter, paymentIssue, type FinancialSnapshot } from "@/lib/finances-supervision";
import type { DecisionsAttendues } from "@/lib/decisions-attendues";
import type { FaitsDirection } from "@/lib/faits-direction";
import { trierDecisions } from "@/lib/tri-decisions";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import { OuvrirAlertes } from "./ouvrir-alertes";
import styles from "./aujourdhui.module.css";

export type DonneesAccueil = {
  finance: FinancialSnapshot | null; assistance: number | null; decisions: DecisionsAttendues;
  aujourd: string; faits: FaitsDirection | null; erreurFaits: boolean; echecsEquipes: number;
};

/** Présentation des lectures existantes : ni nouvel état métier, ni nouvelle décision. */
export function resumerAccueil({ finance, assistance, decisions, aujourd }: DonneesAccueil) {
  const comptes = finance?.organisations ?? [];
  const partiel = Boolean(finance && finance.total > comptes.length);
  const disponible = finance !== null;
  const nombre = (n: number) => disponible ? `${partiel ? "≥ " : ""}${n}` : "À vérifier";
  const proches = comptes.filter(a => matchesFinanceFilter(a, "essais_proches", aujourd)).length;
  return { partiel, entrees: trierDecisions(decisions.decisions, decisions.signaux), indicateurs: [
    { id: "clients", titre: "Espaces clients", valeur: finance?.total ?? "À vérifier", detail: "Organisations, pas personnes uniques", href: "/admin/clients?vue=espaces" },
    { id: "essais", titre: "En essai", valeur: nombre(comptes.filter(inTrial).length), detail: disponible ? `${partiel ? "Au moins " : ""}${proches} fin${proches > 1 ? "s" : ""} sous 7 jours` : "Lecture indisponible", href: "/admin" },
    { id: "abonnements", titre: "Abonnements actifs", valeur: nombre(comptes.filter(a => a.stripe_statut === "active").length), detail: "Selon l’état d’abonnement enregistré", href: "/admin" },
    { id: "paiements", titre: "Paiements à suivre", valeur: nombre(comptes.filter(paymentIssue).length), detail: "Retards ou paiements à finaliser", href: "/admin" },
    { id: "assistance", titre: "Assistance ouverte", valeur: assistance ?? "À vérifier", detail: "Demandes non résolues, hors idées", href: "/admin/retours" },
    { id: "service", titre: "Service à vérifier", valeur: decisions.tachesIllisibles ? "À vérifier" : decisions.santeBloquants, detail: "Points bloquants des contrôles existants", href: "/admin/sante" },
  ] };
}

export function AccueilDirigeant(props: DonneesAccueil) {
  const { finance, assistance, decisions, faits, erreurFaits, echecsEquipes } = props;
  const { indicateurs, entrees, partiel } = resumerAccueil(props);
  const problemes = entrees.filter(e => e.categorie === "incidents");
  const inconnus = decisions.indisponibles.length > 0 || decisions.tachesIllisibles;
  const difficulte = decisions.santeBloquants > 0 || problemes.length > 0 || echecsEquipes > 0;
  const faitsImportants = faits ? [
    ["incidents", "urgents_ouverts", "incidents urgents"],
    ["echeances", "alertes_critiques", "alertes critiques"],
    ["service", "passages_en_echec_24h", "traitements interrompus ou à vérifier"],
  ].flatMap(([source, mesure, libelle]) => {
    const s = faits.sources[source as keyof FaitsDirection["sources"]];
    const n = s.donnees?.mesures[mesure];
    return typeof n === "number" && n > 0 ? [{ libelle, n, date: s.observe_le, indisponible: s.statut === "indisponible" }] : [];
  }) : [];
  const relevéIncomplet = erreurFaits || !faits || faits.indisponibles.length > 0;
  return <div className={styles.accueil}>
    <section className={styles.sante} aria-label="État de Gerimmo" data-attention={inconnus || difficulte || faitsImportants.length > 0}>
      <HeartPulse size={25} aria-hidden="true" />
      <div><h2>{inconnus ? "L’état du service reste à vérifier" : difficulte || faitsImportants.length ? "Des points demandent votre attention" : "Aucun blocage signalé par les contrôles disponibles"}</h2>
        <p>Services et demandes relus à l’ouverture. <Link href="/admin/sante">Voir les contrôles et leurs dates →</Link></p>
        {echecsEquipes > 0 && <p><strong>{echecsEquipes} échec(s) signalé(s) par les équipes.</strong> <a href="#equipes">Voir les comptes rendus</a></p>}
        {faitsImportants.map(f => <p key={f.libelle}><strong>{f.n} {f.libelle}</strong> · {f.date ? `relevé du ${formaterDateHeureParis(f.date)}` : "date à vérifier"}{f.indisponible ? " · dernier état connu, source indisponible" : ""}. <a href="#faits-direction">Voir les dossiers</a></p>)}
        {relevéIncomplet && <p className={styles.reserve}>{erreurFaits ? "Les points de vigilance ne peuvent pas être lus." : !faits ? "Le relevé des incidents et des échéances reste à préparer." : "Le relevé de vigilance contient des sources indisponibles."} <a href="#faits-direction">Détails du relevé</a></p>}
      </div>
    </section>
    {(!finance || assistance === null || partiel) && <p role="alert" className={styles.lecture}>{!finance ? "Les chiffres clients sont indisponibles. " : partiel ? `Vue partielle : ${finance.organisations.length} espaces lus sur ${finance.total}. Les sous-totaux sont des minimums. ` : ""}{assistance === null && "Le nombre de demandes d’assistance est indisponible."}</p>}
    <nav className={styles.indicateurs} aria-label="Les six repères du dirigeant">{indicateurs.map(i => <Link key={i.id} href={i.href} data-indicateur={i.id} className={styles.indicateur}>
      <span>{i.titre}</span><strong>{i.valeur}</strong><small>{i.detail}</small><ArrowUpRight size={16} aria-hidden="true" />
    </Link>)}</nav>
    <section className={styles.traiter} aria-labelledby="a-traiter-aujourdhui">
      <header><div><h2 id="a-traiter-aujourdhui">À traiter</h2><p>{inconnus ? "Liste partielle : certaines lectures sont indisponibles." : `${decisions.total} demande${decisions.total > 1 ? "s" : ""} en attente${entrees.length > 3 ? " · les trois premières ci-dessous" : ""}`}</p></div><Link href="/admin/brief?vue=decisions">Toutes les demandes →</Link></header>
      {entrees.length ? <ol>{entrees.slice(0, 3).map(e => {
        const lien = e.type === "signal" ? e.signal.href : e.decision.source === "retour" ? `${e.decision.lien}#retour-${e.decision.source_id}` : e.decision.lien;
        const action = e.type === "signal" ? e.signal.action : e.decision.source === "retour" ? "Traiter le signalement" : e.decision.source === "artisan" ? "Examiner l’inscription" : e.decision.source === "publication" ? "Relire la publication" : "Examiner le dossier";
        return <li key={e.cle} data-probleme={e.categorie === "incidents"}><div><h3>{e.categorie === "incidents" && <CircleAlert size={17} aria-hidden="true" />}{e.titre}</h3>{e.type === "signal" && <p>{e.signal.detail}</p>}</div>{lien ? <Link href={lien} className={styles.action}>{action}<ArrowUpRight size={15} aria-hidden="true" /></Link> : <OuvrirAlertes className={styles.action}>{action}<ArrowUpRight size={15} aria-hidden="true" /></OuvrirAlertes>}</li>;
      })}</ol> : <p className={styles.calme}>{inconnus ? "Impossible de confirmer l’absence de demandes." : "Aucune décision en attente. Vous pouvez vous concentrer sur vos clients."}</p>}
      {problemes.length > 3 && <Link className={styles.autres} href="/admin/brief?vue=decisions&categorie=incidents">Voir les {problemes.length} problèmes à examiner — dont {problemes.length - 3} non affichés ci-dessus →</Link>}
    </section>
    <nav className={styles.raccourcis} aria-label="Accès du dirigeant"><Link href="/admin/clients">Rechercher un utilisateur →</Link><Link href="/admin/retours">Répondre aux clients →</Link><Link href="/admin">Abonnements et finances →</Link></nav>
  </div>;
}
