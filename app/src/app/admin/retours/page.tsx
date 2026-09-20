import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIONS_RETOUR, ETATS_RETOUR, moisRevue, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { CloreRevue, DecisionRetour, RegrouperIdees } from "./decisions-retour";

export const metadata = { title: "Retours et contestations — Gerimmo" };
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
  function adresse(n: number) {
    const q = new URLSearchParams({ nature, page: String(n) });
    if (etat) q.set("etat", etat);
    if (org) q.set("org", org);
    return `/admin/retours?${q}`;
  }

  return <main className="mx-auto w-full max-w-4xl p-4 sm:p-7 space-y-5">
    <div className="entete-page"><h1>Retours et contestations</h1><p className="text-sm text-muted-foreground">Répondre aux utilisateurs, qualifier les problèmes et préparer la revue des idées.</p></div>
    <nav aria-label="Files de retours" className="flex flex-wrap gap-2">{Object.entries(NATURES).map(([k, v]) => <Link key={k} href={`/admin/retours?nature=${k}`} aria-current={nature === k ? "page" : undefined} className={`rounded-full border px-3 py-2 text-sm ${nature === k ? "border-[var(--or)] bg-[var(--encre)] text-white" : "border-[var(--filet)] bg-white"}`}>{v}</Link>)}</nav>
    {nature === "idee" && <section className="rounded-xl border border-[var(--or)] bg-[var(--ivoire)] p-4 text-sm">
      <h2 className="font-heading text-lg">Revue de {new Date(mois + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
      {revue.error ? <p>Le bilan de la revue est indisponible.</p> : revue.data ? <><p className="mt-2">Revue terminée le {new Date(revue.data.cree_le).toLocaleDateString("fr-FR")}.</p><p className="mt-2 whitespace-pre-wrap">{revue.data.bilan}</p></> : <><p className="mt-2">La revue mensuelle est à faire. Examinez les idées et leurs dates de réexamen, puis consignez le bilan.</p><CloreRevue /></>}
      {!reexamens.error && Number(reexamens.count) > 0 && <p className="mt-3 font-medium">{reexamens.count} idée(s) ont atteint leur date de réexamen.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Classement sur tout l’historique : organisations distinctes, soutiens uniques, puis ancienneté. Regrouper des idées conserve la confidentialité de leurs descriptions.</p>
    </section>}
    <form className="flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="nature" value={nature} />
      <label>État<select name="etat" defaultValue={etat} className="ml-2 rounded border bg-white p-2"><option value="">Tous</option>{Object.entries(ETATS_RETOUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Organisation<select name="org" defaultValue={org} className="ml-2 rounded border bg-white p-2"><option value="">Toutes</option>{(organisations.data ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <button type="submit" className="btn-or">Filtrer</button>
    </form>
    {erreur && <p role="alert" className="err">Une partie du suivi est indisponible. Rechargez avant de prendre une décision.</p>}
    {!file.error && !lignes.length && <p className="text-sm text-muted-foreground">Aucune demande sur cette page pour ces filtres.</p>}
    {lignes.map(({ retour: r, organisation, soutiens, organisations: nbOrg }) => <article key={r.id} className="rounded-xl border border-[var(--filet)] bg-white p-5">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-heading text-xl">{r.titre}</h2><span className="puce puce-prep">{ETATS_RETOUR[r.etat]}</span></div>
      <p className="mt-2 text-xs text-muted-foreground">{NATURES[r.nature]} · {r.gravite} · {new Date(r.cree_le).toLocaleString("fr-FR")} · {r.id.slice(0, 8).toUpperCase()} · {organisation ?? (r.nature === "contestation" ? "Espace artisan privé" : "Compte personnel")}</p>
      <p className="mt-4 whitespace-pre-wrap text-sm">{r.description}</p>
      {r.attendu && <p className="mt-3 whitespace-pre-wrap text-sm"><strong>Attendu : </strong>{r.attendu}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Écran : {r.ecran} · {ACTIONS_RETOUR[r.action_origine]}</p>
      {r.nature === "idee" && <p className="mt-3 text-sm">{nbOrg} organisation(s) · {soutiens} soutien(s)</p>}
      {r.reexaminer_le && <p className="mt-3 text-sm">À réexaminer le {new Date(r.reexaminer_le + "T12:00:00").toLocaleDateString("fr-FR")}.</p>}
      {r.publication_id && <Link href={`/admin/publications/${r.publication_id}`} className="mt-3 inline-block text-sm underline">Préparer l’article lié à cette idée</Link>}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Historique des réponses</summary><ol className="mt-3 space-y-3">{(historique.data ?? []).filter(h => h.retour_id === r.id).map(h => <li key={h.id} className="border-l-2 border-[var(--filet)] pl-3"><time className="text-xs text-muted-foreground">{new Date(h.cree_le).toLocaleString("fr-FR")}</time><p className="whitespace-pre-wrap">{h.message}</p></li>)}</ol></details>
      <DecisionRetour retour={r} />{r.nature === "idee" && <RegrouperIdees retour={r} idees={idees} />}
    </article>)}
    <nav aria-label="Pages des demandes" className="flex justify-between gap-3 text-sm">{page > 1 ? <Link href={adresse(page - 1)} className="underline">Précédente</Link> : <span />}<span>Page {page}{total > 0 ? ` · ${total} demande(s)` : ""}</span>{page * 50 < total && <Link href={adresse(page + 1)} className="underline">Suivante</Link>}</nav>
  </main>;
}
