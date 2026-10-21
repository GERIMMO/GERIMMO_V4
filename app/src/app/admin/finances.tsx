"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeEuro, CalendarDays, CircleAlert, CreditCard, RefreshCw, Search, ShieldCheck, TrendingUp, X } from "lucide-react";
import { FINANCE_FILTERS, daysUntil, inTrial, isOwner, matchesFinanceFilter, monthlyCents, offerName, paymentIssue, revenueSummary, scheduledCancellation, subscriptionLabel, syncIssue, upcomingEvents, type FinancialAccount, type FinanceFilter } from "@/lib/finances-supervision";
import { initiales } from "@/lib/clients-supervision";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import { formaterDateHeureParis, formaterDateParis } from "@/lib/heure-paris";
import base from "./repertoires.module.css";
import styles from "./finances.module.css";

const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const accountLink = (a: FinancialAccount) => `/admin/organisations/${a.id}`;

export function FinanceDashboard({ accounts, today, unavailable, partial, budget }: {
  accounts: FinancialAccount[]; today: string; unavailable: boolean; partial: boolean; budget: number | null;
}) {
  const [filter, setFilter] = useState<FinanceFilter>("tous");
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("tous");
  const [page, setPage] = useState(1);
  const revenue = revenueSummary(accounts);
  const safeCount = (n: number) => unavailable ? "—" : n;
  const focus = (value: FinanceFilter) => { setFilter(value); setQuery(""); setFamily("tous"); setPage(1); document.getElementById("abonnements-clients")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const visible = accounts.filter(a => matchesFinanceFilter(a, filter, today) && (family === "tous" || (isOwner(a) ? "proprietaire" : "agence") === family) && normalise(`${a.name} ${offerName(a)}`).includes(normalise(query.trim())));
  const pages = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, pages);
  const list = visible.slice((currentPage - 1) * 20, currentPage * 20);
  const reset = () => { setFilter("tous"); setQuery(""); setFamily("tous"); setPage(1); };
  const events = upcomingEvents(accounts, today);
  const trials = accounts.filter(inTrial);
  const expiredTrials = trials.filter(a => (daysUntil(a.essai_fin ?? a.periode_fin, today) ?? 1) < 0).length;
  const trialSoon = trials.filter(a => { const n = daysUntil(a.essai_fin ?? a.periode_fin, today); return n !== null && n >= 0 && n <= 7; }).length;
  const states = [
    { title: "Abonnements actifs", count: revenue.active, detail: "État confirmé par Stripe", filter: "actifs" as const, tone: "vert", icon: CreditCard },
    { title: "Clients en essai", count: trials.length, detail: `${trialSoon} fin${trialSoon > 1 ? "s" : ""} d’essai sous 7 jours`, filter: "essais" as const, tone: "bleu", icon: CalendarDays },
    { title: "Paiements à suivre", count: accounts.filter(paymentIssue).length, detail: "En retard, impayés ou à finaliser", filter: "defaut" as const, tone: "rouge", icon: CircleAlert },
    { title: "Résiliations prévues", count: accounts.filter(scheduledCancellation).length, detail: "Accès conservé jusqu’à l’échéance", filter: "resiliations" as const, tone: "ambre", icon: BadgeEuro },
  ];
  const warnings = [
    { name: "Paiements à suivre", count: accounts.filter(paymentIssue).length, filter: "defaut" as const, tone: "rouge" },
    { name: "Essais terminés", count: expiredTrials, filter: "essais_expires" as const, tone: "ambre" },
    { name: "Fins d’essai sous 7 jours", count: trialSoon, filter: "essais_proches" as const, tone: "ambre" },
    { name: "Synchronisations à vérifier", count: accounts.filter(syncIssue).length, filter: "synchro" as const, tone: "ambre" },
  ];
  const offers = [...new Set(accounts.filter(a => a.stripe_statut === "active").map(offerName))].map(name => ({ name, count: accounts.filter(a => a.stripe_statut === "active" && offerName(a) === name).length }));
  const billedOwners = accounts.filter(a => a.stripe_statut === "active" && isOwner(a));
  const billedAgencies = accounts.filter(a => a.stripe_statut === "active" && !isOwner(a));

  return <>
    <div className={base.stats}>{states.map(({ icon: Icon, ...s }) => <button type="button" key={s.filter} className={base.stat} data-tone={s.count ? s.tone : "bleu"} disabled={unavailable} aria-pressed={filter === s.filter} onClick={() => focus(s.filter)}><span className={base.statIcon}><Icon size={19} aria-hidden="true" /></span><strong>{safeCount(s.count)}</strong><span>{s.title}</span><small>{unavailable ? "Lecture indisponible" : s.detail}</small></button>)}</div>

    <div className={styles.overview}>
      <section className={styles.revenue} aria-labelledby="revenus-titre">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>VOTRE ACTIVITÉ RÉCURRENTE</p><h2 id="revenus-titre">Revenus des abonnements</h2></div><TrendingUp size={23} aria-hidden="true" /></div>
        <div className={styles.revenueFigures}>{([{ name: "Propriétaires bailleurs", tax: "TTC", data: revenue.owner }, { name: "Agences", tax: "HT", data: revenue.agency }]).map(g => <div key={g.tax}><span>{g.name}</span><strong>{unavailable || g.data.unknown ? "—" : money(g.data.monthly)}<small>{g.tax} / mois</small></strong><p>{unavailable ? "Revenus indisponibles" : g.data.unknown ? `${g.data.unknown} montant${g.data.unknown > 1 ? "s" : ""} à vérifier · ${money(g.data.monthly)} connus` : `${money(g.data.annual)} ${g.tax} annualisés`}</p><p>{safeCount(g.data.count)} abonnement{g.data.count > 1 ? "s" : ""} actif{g.data.count > 1 ? "s" : ""}{g.data.cancelling > 0 ? ` · ${money(g.data.cancelling)} / mois en résiliation` : ""}</p></div>)}</div>
        <div className={styles.revenueFoot}><span>{safeCount(revenue.monthly)} mensuel{revenue.monthly > 1 ? "s" : ""}</span><span>{safeCount(revenue.annual)} annuel{revenue.annual > 1 ? "s" : ""}</span><span>Montants synchronisés{partial ? " · vue partielle" : ""}</span></div>
        <p className={styles.revenueNote}>Équivalent mensuel : les abonnements annuels sont divisés par 12. Essais et paiements en défaut exclus. Les montants HT et TTC restent séparés. Il ne s’agit pas des sommes encaissées.</p>
      </section>
      <section className={styles.attention} aria-labelledby="vigilance-titre"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>À SURVEILLER</p><h2 id="vigilance-titre">Votre suivi du jour</h2></div><ShieldCheck size={22} aria-hidden="true" /></div>
        {warnings.map(w => <button type="button" key={w.name} disabled={unavailable} onClick={() => focus(w.filter)}><span>{w.name}</span><b className={base.badge} data-tone={w.count ? w.tone : "vert"}>{safeCount(w.count)}</b><ArrowUpRight size={15} aria-hidden="true" /></button>)}
        <Link className={styles.textLink} href="/admin/sante">Vérifier les services de facturation <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </section>
    </div>

    <div className={styles.secondary}>
      <section className={styles.panel}><div className={styles.sectionHead}><div><h2>Répartition de vos clients</h2><p>Formules des abonnements actifs</p></div></div>
        {unavailable ? <p className={styles.muted}>Répartition indisponible.</p> : !offers.length ? <p className={styles.muted}>Aucune souscription active synchronisée pour le moment.</p> : <div className={styles.offers}>{offers.map(o => <div key={o.name}><span>{o.name}</span><b>{o.count}</b><div className={styles.track}><span style={{ width: `${100 * o.count / revenue.active}%` }} /></div></div>)}</div>}
        <dl className={styles.volumes}><div><dt>Biens des propriétaires</dt><dd>{safeCount(accounts.filter(isOwner).reduce((n, a) => n + a.unites_a_couvrir, 0))}<small>dans les parcs</small></dd></div><div><dt>Lots sous mandat</dt><dd>{safeCount(accounts.filter(a => !isOwner(a)).reduce((n, a) => n + a.unites_a_couvrir, 0))}<small>dans les agences</small></dd></div></dl>
        <p className={styles.muted}>Capacité souscrite : {unavailable || billedOwners.some(a => a.unites_souscrites === null) ? "—" : billedOwners.reduce((n, a) => n + (a.unites_souscrites ?? 0), 0)} biens · {unavailable || billedAgencies.some(a => a.unites_souscrites === null) ? "—" : billedAgencies.reduce((n, a) => n + (a.unites_souscrites ?? 0), 0)} lots sous mandat.</p>
      </section>
      <section className={styles.panel}><div className={styles.sectionHead}><div><h2>Prochaines échéances</h2><p>Essais, renouvellements et départs · sous 30 jours</p></div><CalendarDays size={20} aria-hidden="true" /></div>
        {unavailable ? <p className={styles.muted}>Échéances indisponibles.</p> : !events.length ? <div className={styles.quiet}><CalendarDays size={24} aria-hidden="true" /><p>Aucune échéance connue dans les 30 prochains jours.</p></div> : <div className={styles.events}>{events.slice(0, 5).map(e => <Link key={e.account.id} href={accountLink(e.account)}><span className={styles.eventDate}>{formaterDateParis(e.date).slice(0, 5)}<small>{e.days === 0 ? "Aujourd’hui" : `Dans ${e.days} j`}</small></span><span><b>{e.account.name}</b><small>{e.label}{!inTrial(e.account) && e.account.montant_periode_cents !== null ? ` · ${money(e.account.montant_periode_cents)} ${isOwner(e.account) ? "TTC" : "HT"}` : ""}</small></span><ArrowUpRight size={15} aria-hidden="true" /></Link>)}{events.length > 5 && <p className={styles.muted}>{events.length - 5} autre(s) échéance(s) dans la liste ci-dessous.</p>}</div>}
      </section>
    </div>

    <section id="abonnements-clients" className={`${base.directory} ${styles.directory}`} aria-labelledby="abonnements-titre">
      <div className={base.directoryHeading}><div><h2 id="abonnements-titre">Tous vos abonnements</h2><p>Offre, montant, échéance et suivi de chaque client.</p></div><Link className={styles.textLink} href="/admin/clients">Annuaire des utilisateurs <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      <div className={base.searchBar}><label className={base.search}><Search size={17} aria-hidden="true" /><span className="sr-only">Rechercher un abonnement</span><input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Nom du client ou formule…" /></label><label className={base.select}><span className="sr-only">Type de client</span><select value={family} onChange={e => { setFamily(e.target.value); setPage(1); }}><option value="tous">Tous les clients</option><option value="proprietaire">Propriétaires bailleurs</option><option value="agence">Agences</option></select></label></div>
      <div className={styles.filters}>{FINANCE_FILTERS.map(f => <button type="button" key={f.value} aria-pressed={filter === f.value} onClick={() => { setFilter(f.value); setPage(1); }}>{f.label}<span>{safeCount(accounts.filter(a => matchesFinanceFilter(a, f.value, today)).length)}</span></button>)}</div>
      <div className={styles.resultLine}><p role="status">{unavailable ? "Abonnements indisponibles" : `${visible.length} client${visible.length > 1 ? "s" : ""}${partial ? " · vue partielle" : ""}`}</p>{(filter !== "tous" || query || family !== "tous") && <button type="button" className={base.reset} onClick={reset}><X size={14} aria-hidden="true" />Effacer les filtres</button>}</div>
      {unavailable ? <div className={base.empty}><CircleAlert size={25} aria-hidden="true" /><h3>La lecture est indisponible</h3><p>Rechargez la page pour retrouver les abonnements.</p></div> : !visible.length ? <div className={base.empty}><Search size={25} aria-hidden="true" /><h3>Aucun abonnement dans cette sélection</h3><p>Retirez un filtre ou essayez un autre nom.</p><button type="button" onClick={reset}>Voir tous les clients</button></div> : <>
        <div className={styles.tableHead} aria-hidden="true"><span>Client et accès</span><span>Offre et montant</span><span>Échéance</span><span>Suivi</span><span /></div>
        {list.map(a => <article key={a.id} className={styles.account} data-warning={paymentIssue(a)}>
          <div className={styles.identity}><span className={base.avatar} data-family={isOwner(a) ? "proprietaire" : "agence"} aria-hidden="true">{initiales(a.name)}</span><div><Link href={accountLink(a)}><strong>{a.name}</strong></Link><small>{isOwner(a) ? "Propriétaire bailleur" : "Agence"}</small><small>Accès : {LIBELLES_STATUT_ORGANISATION[a.status] ?? a.status}</small></div></div>
          <div className={styles.cell}><span className={styles.mobileLabel}>Offre et montant</span><strong>{a.stripe_statut ? offerName(a) : "Pas d’offre souscrite"}</strong><p>{a.stripe_statut ? `${money(a.montant_periode_cents)} ${isOwner(a) ? "TTC" : "HT"}${a.periodicite === "annuel" ? " / an" : a.periodicite === "mensuel" ? " / mois" : ""}` : "Aucun montant facturé connu"}</p><small>{a.unites_a_couvrir} {isOwner(a) ? "bien(s)" : "lot(s) sous mandat"}{a.unites_souscrites !== null ? ` · ${a.unites_souscrites} souscrit(s)` : ""}</small>{a.stripe_statut === "active" && monthlyCents(a) === null && <small className={styles.warning}>Montant à vérifier</small>}</div>
          <div className={styles.cell}><span className={styles.mobileLabel}>Échéance</span><strong>{formaterDateParis(inTrial(a) ? a.essai_fin ?? a.periode_fin : a.periode_fin)}</strong><small>{scheduledCancellation(a) ? "Fin d’abonnement prévue" : inTrial(a) ? "Fin de l’essai" : ["canceled", "incomplete_expired"].includes(a.stripe_statut ?? "") ? "Dernière période" : a.periode_fin ? "Prochain renouvellement" : "Aucune date connue"}</small>{a.periodicite_suivante && a.periodicite_suivante !== a.periodicite && <small>Passage {a.periodicite_suivante === "annuel" ? "à l’annuel" : "au mensuel"} prévu</small>}</div>
          <div className={styles.cell}><span className={styles.mobileLabel}>Suivi</span><span className={base.badge} data-tone={paymentIssue(a) ? "rouge" : a.stripe_statut === "active" ? "vert" : inTrial(a) ? "bleu" : "gris"}>{subscriptionLabel(a)}</span>{a.paiement_en_defaut_depuis && <small className={styles.warning}>Depuis le {formaterDateParis(a.paiement_en_defaut_depuis)}</small>}{syncIssue(a) && <small className={styles.warning}>{a.synchro_en_erreur ? "Erreur de synchronisation" : "Actualisation en attente"}</small>}{a.avantages_en_attente > 0 && <small>{a.avantages_en_attente} avantage(s) de parrainage à examiner</small>}<small>{a.derniere_synchro ? `Synchronisé le ${formaterDateHeureParis(a.derniere_synchro)}` : "Aucune synchronisation reçue"}</small></div>
          <Link className={styles.openAccount} href={accountLink(a)} aria-label={`Ouvrir la fiche — abonnement de ${a.name}`}><ArrowUpRight size={18} aria-hidden="true" /><span>Ouvrir la fiche</span></Link>
        </article>)}
        {pages > 1 && <nav className={base.pagination} aria-label="Pages des abonnements"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Précédent</button><span>Page {currentPage} sur {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Suivant →</button></nav>}
      </>}
    </section>

    <section className={styles.financeScope} aria-labelledby="suivi-financier-titre"><div className={styles.sectionHead}><div><h2 id="suivi-financier-titre">Trésorerie et dépenses</h2><p>Les abonnements sont suivis ci-dessus. Ces éléments complètent votre lecture financière.</p></div></div><div className={styles.scopeGrid}>
      <article><span>ENCAISSEMENTS & FACTURES</span><h3>Relevé de trésorerie</h3><p>Le relevé en haut de cette page présente les mouvements réellement reçus de Stripe. Le tableau de bord Stripe reste disponible pour les opérations.</p><a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">Ouvrir Stripe <ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (nouvel onglet)</span></a></article>
      <article><span>SEUIL D’ALERTE MARKETING</span><h3>{money(budget)} <small>/ mois</small></h3><p>{budget === null ? "Seuil non disponible." : "Alerte sur les dépenses Meta constatées. Ce seuil ne bloque ni ne déclenche de dépense."}</p><Link href="/admin/marketing">Dépenses et réglages <ArrowUpRight size={15} aria-hidden="true" /></Link></article>
      <article><span>COÛTS & RENTABILITÉ</span><h3>Registre des coûts</h3><p>Enregistrez les factures payées dans le registre ci-dessus. Le solde suivi reste provisoire tant que les dépenses ne sont pas toutes déclarées.</p><Link href="/admin/sante">Services et consommation <ArrowUpRight size={15} aria-hidden="true" /></Link></article>
    </div></section>
    <details className={styles.method}><summary>Comprendre les chiffres et leur périmètre</summary><p>La source est le dernier état d’abonnement enregistré dans Gerimmo. Un espace ouvert manuellement peut être actif sans souscription payante. Les revenus récurrents affichés ne prouvent pas un paiement et conservent les abonnements en résiliation jusqu’à leur fin. Un montant absent reste inconnu ; le tarif catalogue ne le remplace jamais.</p><p>Les montants suivent la convention de la grille Gerimmo : propriétaires TTC, agences HT. Ils ne sont pas additionnés. Aucun montant de dette, taux de résiliation ou taux de conversion historique n’est déduit d’un simple état instantané. Les horaires sont ceux de Paris.{partial ? " La limite de lecture est atteinte : tous les indicateurs portent uniquement sur les clients chargés." : ""}</p><Link href="/admin/sante"><RefreshCw size={13} aria-hidden="true" /> Contrôler la synchronisation</Link></details>
  </>;
}
