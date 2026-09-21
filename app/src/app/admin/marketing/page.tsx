import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { campagnesFacebook, santeFacebook } from "@/lib/marketing-meta";
import { ActualisationAuto } from "./actualisation-auto";
import { FormulaireCampagne } from "./formulaire-campagne";

export const metadata = { title: "Agent marketing — Gerimmo" };
export const dynamic = "force-dynamic";

type Campagne = { id: string; nom: string; description: string | null; canal: string; nature: string; objectif: string; statut: string; publication_prevue_le: string | null; budget_cents: number | null; cree_le: string };
type Publication = { id: string; titre: string; statut: string; slug: string | null; propose_le: string; publie_le: string | null; facebook_post_id: string | null; facebook_publie_le: string | null; facebook_erreur: string | null };

const date = (valeur: string | null) => valeur ? new Date(valeur).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date à choisir";
const argent = (cents: number | null) => cents == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const nombre = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

export default async function PageAgentMarketing() {
  const supabase = await createClient();
  const [campagnesResultat, publicationsResultat, facebook, meta] = await Promise.all([
    supabase.from("marketing_campagnes").select("id,nom,description,canal,nature,objectif,statut,publication_prevue_le,budget_cents,cree_le").order("publication_prevue_le", { ascending: true, nullsFirst: false }),
    supabase.from("publications").select("id,titre,statut,slug,propose_le,publie_le,facebook_post_id,facebook_publie_le,facebook_erreur").order("propose_le", { ascending: false }).limit(100),
    santeFacebook(),
    campagnesFacebook(),
  ]);
  const campagnes = (campagnesResultat.data ?? []) as Campagne[];
  const publications = (publicationsResultat.data ?? []) as Publication[];
  const futures = campagnes.filter((c) => ["idee", "planifiee"].includes(c.statut));
  const actives = meta.campagnes.filter((c) => ["ACTIVE", "IN_PROCESS", "PENDING_REVIEW"].includes(c.statut));
  const anciennesMeta = meta.campagnes.filter((c) => !actives.includes(c));
  const parutionsFacebook = publications.filter((p) => p.facebook_post_id);

  return <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-7">
    <div className="entete-page"><div><h1>Agent marketing</h1><p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">Préparer les prises de parole de Gerimmo, suivre Facebook et mesurer les publicités depuis un seul écran.</p></div><ActualisationAuto /></div>

    <div className="grille-kpi">
      <div className={`kpi ${facebook.erreur ? "rouge" : facebook.configure ? "vert" : "or"}`}><span className="libelle-champ">Page Facebook</span><div className="chiffre">{facebook.erreur ? "À réparer" : facebook.configure ? "Connectée" : "À connecter"}</div><span className="mono-discret sans-majuscules">{facebook.nom ?? facebook.erreur ?? "Jeton Meta manquant"}</span></div>
      <div className="kpi bleu"><span className="libelle-champ">Communauté</span><div className="chiffre">{facebook.abonnes == null ? "—" : nombre(facebook.abonnes)}</div><span className="mono-discret sans-majuscules">abonnés Facebook</span></div>
      <div className="kpi or"><span className="libelle-champ">À venir</span><div className="chiffre">{futures.length + publications.filter((p) => ["proposition", "brouillon"].includes(p.statut)).length}</div><span className="mono-discret sans-majuscules">campagnes et articles</span></div>
      <div className="kpi vert"><span className="libelle-champ">Publicités en direct</span><div className="chiffre">{meta.configure ? actives.length : "—"}</div><span className="mono-discret sans-majuscules">Meta Ads</span></div>
    </div>

    {(campagnesResultat.error || publicationsResultat.error) && <p role="alert" className="err">Une partie des informations marketing est momentanément indisponible. Rechargez la page.</p>}

    <section className="section-ecran grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div><div className="entete-carte"><div><h2>Calendrier à venir</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Ce que Gerimmo publiera ou proposera. Une campagne planifiée ne dépense jamais d’argent sans validation.</p></div><Link href="/admin/publications/nouvelle" className="btn-or text-sm">Créer un article</Link></div>
      <div className="mt-4 divide-y divide-[var(--filet)] border border-[var(--filet)] bg-[var(--ivoire)]">{futures.length === 0 ? <div className="vide-guide"><p className="titre">Aucune campagne programmée</p><p className="explication">Ajoutez la prochaine prise de parole avec le formulaire.</p></div> : futures.map((c) => <article key={c.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-heading text-lg">{c.nom}</h3><span className="puce puce-prep">{date(c.publication_prevue_le)}</span></div><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Facebook · {c.nature === "sponsorisee" ? `sponsorisée · ${argent(c.budget_cents)}` : "gratuite"} · objectif {c.objectif}</p>{c.description && <p className="mt-2 text-sm">{c.description}</p>}</article>)}</div></div>
      <details className="border border-[var(--filet)] bg-[var(--ivoire)] p-4" open><summary className="cursor-pointer font-heading text-lg">Programmer une campagne</summary><p className="my-3 text-sm text-[var(--texte-secondaire)]">Le planning reste modifiable. La création réelle d’une publicité Meta sera activée avec le compte publicitaire.</p><FormulaireCampagne /></details>
    </section>

    <section className="section-ecran"><div className="entete-carte"><div><h2>Publicités en direct</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Résultats lus chez Meta, actualisés chaque minute.</p></div></div>
      {!meta.configure ? <div className="vide-guide mt-4"><p className="titre">Compte publicitaire à relier</p><p className="explication">La page et les articles peuvent fonctionner sans publicité payante. Ajoutez le compte Meta Ads pour afficher portée, clics et dépenses.</p></div> : meta.erreur ? <p role="alert" className="err mt-4">Meta Ads : {meta.erreur}</p> : actives.length === 0 ? <p className="vide mt-4">Aucune publicité active actuellement.</p> : <div className="mt-4 overflow-x-auto"><table><thead><tr><th>Campagne</th><th>Portée</th><th>Impressions</th><th>Clics</th><th>Dépense</th></tr></thead><tbody>{actives.map((c) => <tr key={c.id}><td>{c.nom}</td><td>{nombre(c.portee)}</td><td>{nombre(c.impressions)}</td><td>{nombre(c.clics)}</td><td>{argent(Math.round(c.depense * 100))}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="section-ecran grid gap-5 lg:grid-cols-2"><div><h2>Historique publicitaire</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Anciennes campagnes Meta et résultats conservés par la plateforme.</p><div className="mt-3 divide-y divide-[var(--filet)] border border-[var(--filet)] bg-[var(--ivoire)]">{anciennesMeta.length === 0 ? <p className="p-4 text-sm text-[var(--texte-secondaire)]">Aucune ancienne publicité trouvée.</p> : anciennesMeta.map((c) => <div key={c.id} className="p-4 text-sm"><div className="flex justify-between gap-2"><b>{c.nom}</b><span className="puce puce-grise">{c.statut}</span></div><p className="mt-2 text-[var(--texte-secondaire)]">{nombre(c.portee)} personnes · {nombre(c.clics)} clics · {argent(Math.round(c.depense * 100))}</p></div>)}</div></div>
      <div><h2>Publications Facebook</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Articles envoyés depuis le Journal Gerimmo.</p><div className="mt-3 divide-y divide-[var(--filet)] border border-[var(--filet)] bg-[var(--ivoire)]">{parutionsFacebook.length === 0 ? <p className="p-4 text-sm text-[var(--texte-secondaire)]">Aucune publication Facebook envoyée pour le moment.</p> : parutionsFacebook.map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]"><div className="flex justify-between gap-2"><b>{p.titre}</b><span className="puce puce-loue">Publiée</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">{date(p.facebook_publie_le)} · référence {p.facebook_post_id}</p></Link>)}</div></div>
    </section>

    <section className="section-ecran"><h2>Connexions</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="border border-[var(--filet)] bg-[var(--ivoire)] p-4"><b>Facebook</b><p className="mt-1 text-sm text-[var(--texte-secondaire)]">{facebook.configure && !facebook.erreur ? "Page reliée à Gerimmo" : "Connexion à terminer"}</p></div><div className="border border-[var(--filet)] bg-[var(--ivoire)] p-4"><b>Meta Ads</b><p className="mt-1 text-sm text-[var(--texte-secondaire)]">{meta.configure ? "Compte publicitaire relié" : "Compte publicitaire non relié"}</p></div><div className="border border-[var(--filet)] bg-[var(--ivoire)] p-4 opacity-70"><b>Instagram</b><p className="mt-1 text-sm text-[var(--texte-secondaire)]">En pause selon votre choix</p></div></div></section>
  </main>;
}
