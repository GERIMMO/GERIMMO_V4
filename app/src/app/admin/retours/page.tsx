import { ArrowUpRight, Bug, CheckCheck, ChevronDown, ClipboardCheck, History, Info, Lightbulb, MessageCircle, MessagesSquare, Monitor, Scale, TriangleAlert } from "lucide-react";
import shared from "../repertoires.module.css";
import styles from "../relation-clients.module.css";
import { deElide } from "@/lib/elision";
import { TitreEcran } from "@/components/titre-ecran";
import { formaterDateHeureParis, formaterDateParis } from "@/lib/heure-paris";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIONS_RETOUR, ETATS_RETOUR, GRAVITES_RETOUR, moisRevue, nomEcran, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { CloreRevue, DecisionRetour, RegrouperIdees } from "./decisions-retour";

// Même nom que l'entrée de la barre (24/09) : les contestations artisan restent une puce de la file.
export const metadata = { title: "Assistance clients" };
const NATURES: Record<string, string> = { tous: "Tous", bug: "Problèmes", question: "Questions", idee: "Idées", contestation: "Contestations artisan" };
type Ligne = { retour: RetourUtilisateur; organisation: string | null; soutiens: number; organisations: number; premiere: string | null; total: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageRetours({ searchParams }: { searchParams: Promise<{ nature?: string; etat?: string; org?: string; page?: string }> }) {
  const p = await searchParams;
  const c = await createClient();
  const { data: sa, error: acces } = await c.rpc("is_super_admin");
  if (acces || sa !== true) redirect("/espaces");
  const nature = p.nature && Object.hasOwn(NATURES, p.nature) ? p.nature : "tous";
  const etat = p.etat && Object.hasOwn(ETATS_RETOUR, p.etat) ? p.etat : "";
  const org = p.org && UUID.test(p.org) ? p.org : "";
  const page = pageRetour(p.page);
  const mois = moisRevue();
  const [file, organisations, revue, reexamens] = await Promise.all([
    c.rpc("file_retours_supervision", { p_nature: nature === "tous" ? null : nature, p_etat: etat || null, p_org: org || null, p_page: page }),
    c.from("organizations").select("id,name").order("name"),
    c.from("retours_revues").select("mois,bilan,cree_le").eq("mois", mois).maybeSingle(),
    c.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "idee").lte("reexaminer_le", new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" })),
  ]);
  const lignes = (file.data ?? []) as Ligne[];
  const total = Number(lignes[0]?.total ?? 0);
  const idees = lignes.map(l => l.retour).filter(r => r.nature === "idee");
  const ids = lignes.map(l => l.retour.id);
  const historique = ids.length ? await c.from("retours_historique").select("id,retour_id,message,cree_le").in("retour_id", ids).order("cree_le", { ascending: true }) : { data: [], error: null };
  const erreur = file.error || organisations.error || revue.error || reexamens.error || historique.error;
  // Puces de nature et pagination passent par la même adresse : changer de
  // nature garde l'état et l'organisation choisis (24/09).
  function adresse(n: number, natureCible = nature) {
    const q = new URLSearchParams({ nature: natureCible, page: String(n) });
    if (etat) q.set("etat", etat);
    if (org) q.set("org", org);
    return `/admin/retours?${q}`;
  }
  const filtreActif = nature !== "tous" || etat !== "" || org !== "";
  const pages = Math.max(1, Math.ceil(total / 50));
  // Au-delà de la dernière page, la file ne renvoie aucun total : on ne l'affirme pas.
  const totalConnu = !file.error && (lignes.length > 0 || page === 1);
  const nouveaux = lignes.filter(l => l.retour.etat === "nouveau").length;
  const aTraiter = new Set(["nouveau", "en_examen", "en_cours"]);
  const bloquants = lignes.filter(l => l.retour.gravite === "N1" && aTraiter.has(l.retour.etat)).length;
  const icones: Record<string, typeof MessageCircle> = { bug: Bug, question: MessageCircle, idee: Lightbulb, contestation: Scale };
  const revueLabel = deElide(new Date(mois + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));

  return <main className={shared.page}>
    <header className={shared.header}>
      <div><p className={shared.eyebrow}>À L’ÉCOUTE DES UTILISATEURS</p><TitreEcran rubrique="messages">Assistance clients</TitreEcran><p className={shared.subtitle}>Comprenez la demande, apportez une réponse et gardez le fil jusqu’à sa résolution.</p></div>
      <Link href="/admin/retours?nature=idee" className="btn-or"><Lightbulb size={16} aria-hidden="true" />Revue des idées</Link>
    </header>
    <div className={shared.stats} data-columns="3" aria-label="Résumé des demandes">
      <a href="#demandes" className={shared.stat}><span className={shared.statIcon}><MessagesSquare size={20} aria-hidden="true" /></span><strong>{totalConnu ? total : "—"}</strong><span>Demandes{filtreActif ? " sélectionnées" : " reçues"}</span><small>{file.error ? "Lecture indisponible" : !totalConnu ? "Total indisponible sur cette page" : filtreActif ? "Selon les filtres en cours" : "Tous les états et catégories"}</small></a>
      <a href="#demandes" className={shared.stat} data-tone="ambre"><span className={shared.statIcon}><MessageCircle size={20} aria-hidden="true" /></span><strong>{file.error ? "—" : nouveaux}</strong><span>Nouvelles demandes</span><small>Parmi les demandes affichées</small></a>
      <a href="#demandes" className={shared.stat} data-tone="rouge"><span className={shared.statIcon}><TriangleAlert size={20} aria-hidden="true" /></span><strong>{file.error ? "—" : bloquants}</strong><span>Blocages à traiter</span><small>Parmi les demandes affichées</small></a>
    </div>
    {erreur && <p role="alert" className="err mb-5">Une partie du suivi est indisponible. Rechargez avant de prendre une décision.</p>}
    {nature === "idee" && <section className={styles.review} aria-labelledby="revue-titre">
      <h2 id="revue-titre">Revue {revueLabel}</h2>
      {revue.error ? <p>Le bilan de la revue est indisponible.</p> : revue.data ? <><p>Revue terminée le {formaterDateParis(revue.data.cree_le)}.</p><p className="whitespace-pre-wrap">{revue.data.bilan}</p></> : <><p>Examinez les idées et leurs dates de réexamen, puis consignez le bilan de ce mois.</p><CloreRevue /></>}
      {!reexamens.error && Number(reexamens.count) > 0 && <strong>{reexamens.count} idée{reexamens.count === 1 ? " a" : "s ont"} atteint {reexamens.count === 1 ? "sa" : "leur"} date de réexamen.</strong>}
      <p>Classement sur tout l’historique : organisations distinctes, soutiens uniques, puis ancienneté. Regrouper des idées conserve la confidentialité de leurs descriptions.</p>
    </section>}
    <div className={styles.layout}>
      <section id="demandes" className={styles.panel} aria-labelledby="demandes-titre">
        <div className={styles.panelHeading}><div><h2 id="demandes-titre">Les demandes clients</h2><p>{filtreActif ? "La liste tient compte de la catégorie, de l’état et de l’organisation choisis." : "Problèmes, questions, idées et contestations : un suivi pour chaque demande."}</p></div><MessagesSquare size={20} aria-hidden="true" /></div>
        {(total > 0 || filtreActif || file.error) && <>
          <nav aria-label="Files de retours" className={shared.filters}>{Object.entries(NATURES).map(([k,v]) => <Link key={k} href={adresse(1,k)} aria-current={nature === k ? "true" : undefined}>{v}</Link>)}</nav>
          <form key={`${nature}:${etat}:${org}`} data-saisie-libre method="get" action="/admin/retours" className={styles.filterForm}>
            <input type="hidden" name="nature" value={nature} />
            <label><span>État de la demande</span><select name="etat" defaultValue={etat}><option value="">Tous les états</option>{Object.entries(ETATS_RETOUR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label><span>Organisation</span><select name="org" defaultValue={org}><option value="">Toutes les organisations</option>{(organisations.data ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <button type="submit" className="btn-secondaire">Appliquer</button>
            {filtreActif && <Link href="/admin/retours">Tout effacer</Link>}
          </form>
        </>}
        {file.error ? <p role="alert" className={styles.notice}>La liste des demandes est momentanément indisponible.</p> : !lignes.length ? <div className={styles.empty}><CheckCheck size={28} aria-hidden="true" /><h3>{page > 1 ? "Cette page est vide" : filtreActif ? "Aucune demande pour ces filtres" : "Aucune demande reçue"}</h3><p>{page > 1 ? "La liste compte moins de pages. Reprenez depuis la première." : filtreActif ? "Élargissez la catégorie, l’état ou l’organisation pour retrouver les autres demandes." : "Les messages envoyés depuis « Aide et retours » apparaîtront ici avec leur contexte et leur historique."}</p>{(page > 1 || filtreActif) && <Link href={page > 1 ? adresse(1) : "/admin/retours"}>{page > 1 ? "Revenir à la première page" : "Voir toutes les demandes"}<ArrowUpRight size={15} aria-hidden="true" /></Link>}</div> : <div className={styles.requestList}>
          {lignes.map(({retour:r,organisation,soutiens,organisations:nbOrg}) => {
            const Icone = icones[r.nature] ?? MessageCircle;
            const echanges = (historique.data ?? []).filter(h => h.retour_id === r.id);
            const bloque = r.gravite === "N1" && aTraiter.has(r.etat);
            return <article id={`retour-${r.id}`} key={r.id} className={styles.request} data-blocking={bloque}>
              <header className={styles.requestHeader}><span className={shared.avatar} aria-hidden="true"><Icone size={19} /></span><div className={styles.requestTitle}><h3>{r.titre}</h3><p>{organisation ?? (r.nature === "contestation" ? "Espace artisan privé" : "Compte personnel")} · {formaterDateHeureParis(r.cree_le)}</p><div className={styles.badges}><span className={shared.badge} data-tone={r.etat === "resolu" || r.etat === "retenue" ? "vert" : r.etat === "nouveau" ? "ambre" : "bleu"}>{ETATS_RETOUR[r.etat] ?? r.etat}</span><span className={shared.badge}>{NATURES[r.nature]}</span><span className={shared.badge} data-tone={bloque ? "rouge" : "gris"}>{GRAVITES_RETOUR[r.gravite] ?? r.gravite}</span></div></div></header>
              <div className={styles.requestContent}>
                <p className={styles.description}>{r.description}</p>
                {r.attendu && <div className={styles.expected}><strong>Résultat attendu</strong>{r.attendu}</div>}
                <div className={styles.requestMeta}><span><Monitor size={12} aria-hidden="true" />{nomEcran(r.ecran)} · {ACTIONS_RETOUR[r.action_origine]}</span><span>Réf. {r.id.slice(0,8).toUpperCase()}</span></div>
                {(r.nature === "idee" || r.reexaminer_le) && <div className={styles.ideaInfo}>{r.nature === "idee" && <span>{nbOrg} organisation{nbOrg > 1 ? "s" : ""} · {soutiens} soutien{soutiens > 1 ? "s" : ""}</span>}{r.reexaminer_le && <span>À réexaminer le {formaterDateParis(r.reexaminer_le)}</span>}</div>}
                {r.publication_id && <Link href={`/admin/publications/${r.publication_id}`} className={styles.articleLink}>Préparer l’article lié à cette idée<ArrowUpRight size={14} aria-hidden="true" /></Link>}
                <details className={styles.responses}><summary><History size={14} aria-hidden="true" />Historique des réponses{!historique.error && ` · ${echanges.length}`}<ChevronDown size={14} aria-hidden="true" /></summary>{historique.error ? <p role="alert" className="err">Les réponses précédentes sont indisponibles.</p> : echanges.length ? <ol>{echanges.map(h => <li key={h.id}><time dateTime={h.cree_le}>{formaterDateHeureParis(h.cree_le)}</time><p>{h.message}</p></li>)}</ol> : <p className={styles.subtle}>Aucune réponse enregistrée pour le moment.</p>}</details>
              </div>
              <details className={styles.response} open={lignes.length === 1}><summary><MessageCircle size={16} aria-hidden="true" />Répondre et décider<ChevronDown size={16} aria-hidden="true" /></summary><div><DecisionRetour retour={r} />{r.nature === "idee" && <RegrouperIdees retour={r} idees={idees} />}</div></details>
            </article>;
          })}
        </div>}
        {total > 0 && pages > 1 && <nav aria-label="Pages des demandes" className={shared.pagination}>{page > 1 ? <Link href={adresse(page-1)}>Précédente</Link> : <span />}<span>Page {page} sur {pages}</span>{page*50 < total ? <Link href={adresse(page+1)}>Suivante</Link> : <span />}</nav>}
      </section>
      <aside className={styles.sidebar} aria-label="Suivi de la relation clients">
        <section className={styles.networkCard}><Lightbulb size={29} aria-hidden="true" /><p className={styles.eyebrow}>LES IDÉES FONT AVANCER GERIMMO</p><h2>Écouter.<br />Puis améliorer.</h2><p>Retrouvez les propositions, leurs soutiens et les décisions de la revue mensuelle.</p><Link href="/admin/retours?nature=idee">Ouvrir la revue des idées<ArrowUpRight size={16} aria-hidden="true" /></Link></section>
        <section className={styles.guide}><p className={styles.eyebrow}>À REPRENDRE</p><h2>Les idées à réexaminer</h2><div className={styles.reviewNumber}><strong>{reexamens.error ? "—" : reexamens.count ?? 0}</strong><span>{reexamens.error ? "Lecture indisponible" : "dont la date de réexamen est atteinte"}</span></div><p>La revue {revueLabel} {revue.error ? "est indisponible." : revue.data ? "est terminée." : "reste à compléter."}</p><Link href="/admin/autonomie?vue=ameliorations"><ClipboardCheck size={15} aria-hidden="true" />Améliorations du produit<ArrowUpRight size={15} aria-hidden="true" /></Link><Link href="/admin/brief/qualite">Compte rendu de l’équipe qualité<ArrowUpRight size={15} aria-hidden="true" /></Link></section>
      </aside>
    </div>
    <p className={styles.context}><Info size={15} aria-hidden="true" /><span>Les réponses restent dans le suivi de la demande. Les contestations artisan sont privées entre l’artisan et la supervision.</span></p>
  </main>;
}
