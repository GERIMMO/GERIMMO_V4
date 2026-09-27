import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIONS_RETOUR, ETATS_RETOUR, GRAVITES_RETOUR, moisRevue, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { CloreRevue, DecisionRetour, RegrouperIdees } from "./decisions-retour";

// Même nom que l'entrée de la barre (24/09) : les contestations artisan restent une puce de la file.
export const metadata = { title: "Retours des utilisateurs — Gerimmo" };
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
  const mention = file.error ? "File indisponible" : !lignes.length && page > 1 ? null : `${total} demande${total > 1 ? "s" : ""}`;

  return <main className="mx-auto w-full max-w-4xl p-4 sm:p-7 space-y-5">
    <div className="entete-page"><div><h1>Retours des utilisateurs</h1><p className="mt-2 text-sm text-muted-foreground">Répondre aux utilisateurs, qualifier les problèmes et préparer la revue des idées.</p></div>{mention && <span className="mono-discret">{mention}</span>}</div>
    {/* Rien à filtrer sur une liste vide (audit 25/09, C19) : puces et
        sélecteurs n'apparaissent que s'il y a des demandes ou un filtre actif. */}
    {(total > 0 || filtreActif || file.error) && <nav aria-label="Files de retours" className="flex flex-wrap gap-2">{Object.entries(NATURES).map(([k, v]) => <Link key={k} href={adresse(1, k)} aria-current={nature === k ? "page" : undefined} className={`filtre inline-flex items-center${nature === k ? " actif" : ""}`}>{v}</Link>)}</nav>}
    {nature === "idee" && <section className="rounded-xl border border-[var(--or)] bg-[var(--ivoire)] p-4 text-sm">
      <h2 className="font-heading text-lg">Revue de {new Date(mois + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
      {revue.error ? <p>Le bilan de la revue est indisponible.</p> : revue.data ? <><p className="mt-2">Revue terminée le {new Date(revue.data.cree_le).toLocaleDateString("fr-FR")}.</p><p className="mt-2 whitespace-pre-wrap">{revue.data.bilan}</p></> : <><p className="mt-2">La revue mensuelle est à faire. Examinez les idées et leurs dates de réexamen, puis consignez le bilan.</p><CloreRevue /></>}
      {!reexamens.error && Number(reexamens.count) > 0 && <p className="mt-3 font-medium">{reexamens.count} idée(s) ont atteint leur date de réexamen.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Classement sur tout l’historique : organisations distinctes, soutiens uniques, puis ancienneté. Regrouper des idées conserve la confidentialité de leurs descriptions.</p>
    </section>}
    {/* Libellé au-dessus du sélecteur : à 390 px, État et Organisation tiennent sur une ligne et « Filtrer » prend la suivante (24/09). */}
    {(total > 0 || filtreActif || file.error) && <form className="flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="nature" value={nature} />
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1"><span>État</span><select name="etat" defaultValue={etat} className="w-full rounded border bg-white p-2"><option value="">Tous</option>{Object.entries(ETATS_RETOUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1"><span>Organisation</span><select name="org" defaultValue={org} className="w-full rounded border bg-white p-2"><option value="">Toutes</option>{(organisations.data ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <button type="submit" className="btn-or w-full justify-center sm:w-auto">Filtrer</button>
    </form>}
    {erreur && <p role="alert" className="err">Une partie du suivi est indisponible. Rechargez avant de prendre une décision.</p>}
    {!file.error && !lignes.length && (page > 1
      ? <div className="vide-guide"><p className="titre">Cette page est vide</p><p className="explication">La liste compte moins de pages : reprenez depuis la première.</p><div className="geste"><Link href={adresse(1)} className="btn-secondaire">Revenir à la première page</Link></div></div>
      : filtreActif
        ? <div className="vide-guide"><p className="titre">Aucune demande pour ces filtres</p><p className="explication">Élargissez la nature, l’état ou l’organisation, ou revenez à la file complète.</p><div className="geste"><Link href="/admin/retours" className="btn-secondaire">Voir toutes les demandes</Link></div></div>
        : <div className="vide-guide"><p className="titre">Aucune demande en attente</p><p className="explication">Les problèmes, questions, idées et contestations envoyés depuis « Aide et retours » arrivent ici.</p></div>)}
    {lignes.map(({ retour: r, organisation, soutiens, organisations: nbOrg }) => <article key={r.id} className="loc-carte">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-heading text-xl">{r.titre}</h2><span className="puce puce-prep">{ETATS_RETOUR[r.etat]}</span></div>
      <p className="mt-2 text-xs text-muted-foreground">{NATURES[r.nature]} · Gravité : {GRAVITES_RETOUR[r.gravite] ?? r.gravite} · {new Date(r.cree_le).toLocaleString("fr-FR")} · Réf. {r.id.slice(0, 8).toUpperCase()} · {organisation ?? (r.nature === "contestation" ? "Espace artisan privé" : "Compte personnel")}</p>
      <p className="mt-4 whitespace-pre-wrap text-sm">{r.description}</p>
      {r.attendu && <p className="mt-3 whitespace-pre-wrap text-sm"><strong>Attendu : </strong>{r.attendu}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Écran : {r.ecran} · {ACTIONS_RETOUR[r.action_origine]}</p>
      {r.nature === "idee" && <p className="mt-3 text-sm">{nbOrg} organisation(s) · {soutiens} soutien(s)</p>}
      {r.reexaminer_le && <p className="mt-3 text-sm">À réexaminer le {new Date(r.reexaminer_le + "T12:00:00").toLocaleDateString("fr-FR")}.</p>}
      {r.publication_id && <Link href={`/admin/publications/${r.publication_id}`} className="mt-3 inline-block text-sm underline">Préparer l’article lié à cette idée</Link>}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Historique des réponses</summary><ol className="mt-3 space-y-3">{(historique.data ?? []).filter(h => h.retour_id === r.id).map(h => <li key={h.id} className="border-l-2 border-[var(--filet)] pl-3"><time className="text-xs text-muted-foreground">{new Date(h.cree_le).toLocaleString("fr-FR")}</time><p className="whitespace-pre-wrap">{h.message}</p></li>)}</ol></details>
      <DecisionRetour retour={r} />{r.nature === "idee" && <RegrouperIdees retour={r} idees={idees} />}
    </article>)}
    {/* Pas de pagination sur une liste vide ; le total est dans l'en-tête (24/09). */}
    {total > 0 && <nav aria-label="Pages des demandes" className="flex justify-between gap-3 text-sm">{page > 1 ? <Link href={adresse(page - 1)} className="underline">Précédente</Link> : <span />}<span>Page {page} sur {pages}</span>{page * 50 < total ? <Link href={adresse(page + 1)} className="underline">Suivante</Link> : <span />}</nav>}
  </main>;
}
