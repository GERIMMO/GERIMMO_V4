import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Lightbulb, Megaphone, PenLine, Radar, Share2, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { campagnesFacebook, santeFacebook } from "@/lib/marketing-meta";
import { sansJargon } from "@/lib/erreurs";
import { ActualisationAuto } from "./actualisation-auto";
import { FormulaireCampagne } from "./formulaire-campagne";
import { ReglagesAutomatiques } from "./reglages-automatiques";

export const metadata = { title: "Agent marketing — Gerimmo" };
export const dynamic = "force-dynamic";

type Campagne = { id: string; nom: string; description: string | null; canal: string; nature: string; objectif: string; statut: string; publication_prevue_le: string | null; budget_cents: number | null; cree_le: string };
type Publication = { id: string; titre: string; statut: string; slug: string | null; propose_le: string; publie_le: string | null; facebook_post_id: string | null; facebook_publie_le: string | null; facebook_erreur: string | null };
type Reglages = { actif: boolean; publication_automatique: boolean; publicite_active: boolean; jours_semaine: number[]; heure_paris: number; budget_mensuel_cents: number };

const JOURS: Record<number, string> = { 1: "lundi", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi", 7: "dimanche" };
const date = (valeur: string | null) => valeur ? new Date(valeur).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date à choisir";
const argent = (cents: number | null) => cents == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const nombre = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const OBJECTIFS: Record<string, string> = {
  notoriete: "faire connaître Gerimmo",
  trafic: "amener des visiteurs sur le site",
  prospects: "obtenir des demandes de contact",
  conversions: "obtenir de nouveaux clients",
};
const ETATS_PUBLICITE: Record<string, string> = {
  ACTIVE: "En cours",
  PAUSED: "En pause",
  DELETED: "Supprimée",
  ARCHIVED: "Archivée",
  IN_PROCESS: "En préparation",
  PENDING_REVIEW: "En vérification",
  DISAPPROVED: "Refusée",
};

function Etape({ faite, titre, detail }: { faite: boolean; titre: string; detail: string }) {
  return <div className="flex gap-3 rounded-xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-sm">
    {faite ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />}
    <div><p className="font-semibold text-white">{titre}</p><p className="mt-0.5 text-xs leading-relaxed text-white/70">{detail}</p></div>
  </div>;
}

function Capacite({ icone, titre, detail, statut }: { icone: React.ReactNode; titre: string; detail: string; statut: string }) {
  return <article className="group rounded-2xl border border-[var(--filet)] bg-white p-5 shadow-[0_12px_35px_rgba(23,42,78,.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(23,42,78,.1)]">
    <div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eaf1ff] text-[#2458d3]">{icone}</span><span className="rounded-full bg-[#edf8f3] px-2.5 py-1 text-[11px] font-semibold text-[#08755a]">{statut}</span></div>
    <h3 className="mt-4 font-heading text-lg text-[var(--bleu)]">{titre}</h3><p className="mt-1.5 text-sm leading-relaxed text-[var(--texte-secondaire)]">{detail}</p>
  </article>;
}

export default async function PageAgentMarketing() {
  const supabase = await createClient();
  const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
  const [campagnesResultat, publicationsResultat, reglagesResultat, mesuresResultat, facebook, meta] = await Promise.all([
    supabase.from("marketing_campagnes").select("id,nom,description,canal,nature,objectif,statut,publication_prevue_le,budget_cents,cree_le").order("publication_prevue_le", { ascending: true, nullsFirst: false }),
    supabase.from("publications").select("id,titre,statut,slug,propose_le,publie_le,facebook_post_id,facebook_publie_le,facebook_erreur").order("propose_le", { ascending: false }).limit(100),
    supabase.from("marketing_reglages").select("actif,publication_automatique,publicite_active,jours_semaine,heure_paris,budget_mensuel_cents").eq("singleton", true).single(),
    supabase.from("marketing_mesures").select("depense_cents").gte("mesure_le", debutMois.toISOString()),
    santeFacebook(),
    campagnesFacebook(),
  ]);
  const campagnes = (campagnesResultat.data ?? []) as Campagne[];
  const publications = (publicationsResultat.data ?? []) as Publication[];
  const reglages = (reglagesResultat.data ?? { actif: true, publication_automatique: true, publicite_active: true, jours_semaine: [2, 5], heure_paris: 9, budget_mensuel_cents: 1000 }) as Reglages;
  const depenseMois = (mesuresResultat.data ?? []).reduce((total, m) => total + Number(m.depense_cents ?? 0), 0);
  const futures = campagnes.filter((c) => ["idee", "planifiee"].includes(c.statut));
  const actives = meta.campagnes.filter((c) => ["ACTIVE", "IN_PROCESS", "PENDING_REVIEW"].includes(c.statut));
  const anciennesMeta = meta.campagnes.filter((c) => !actives.includes(c));
  const parutionsFacebook = publications.filter((p) => p.facebook_post_id);
  const aDiffuser = publications.filter((p) => p.statut === "publiee" && !p.facebook_post_id);
  const aRelire = publications.filter((p) => ["proposition", "brouillon"].includes(p.statut));
  const facebookOperationnel = facebook.configure && !facebook.erreur;
  const metaOperationnel = meta.configure && !meta.erreur;
  const jours = reglages.jours_semaine.map((jour) => JOURS[jour]).filter(Boolean).join(" et ") || "mardi et vendredi";
  const prochaineAction = aDiffuser[0] ?? aRelire[0] ?? null;

  return <main className="mx-auto w-full max-w-7xl flex-1 space-y-7 p-4 sm:p-7">
    <section className="relative overflow-hidden rounded-[28px] bg-[#112e72] text-white shadow-[0_24px_70px_rgba(22,52,120,.22)]">
      <Image src="/marketing/facebook-cover-gerimmo.jpg" alt="" fill priority sizes="(max-width: 1280px) 100vw, 1280px" className="object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#10275f] via-[#173f9b]/95 to-[#173f9b]/55" />
      <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.15fr_.85fr] lg:p-10">
        <div className="flex flex-col justify-between gap-8">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#bcd1ff]"><Sparkles className="size-4" /> Équipe marketing autonome</div><h1 className="mt-4 max-w-3xl font-heading text-3xl leading-tight sm:text-4xl">Gerimmo transforme son expertise en visibilité, semaine après semaine.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">L’agent choisit des sujets utiles, prépare les articles, les diffuse sur Facebook et centralise les résultats. Vous gardez ici les décisions, le budget et l’historique.</p></div>
          <div className="flex flex-wrap gap-3"><Link href="/admin/publications/nouvelle" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#173f9b] shadow-lg"><PenLine className="size-4" /> Créer un contenu</Link>{prochaineAction && <Link href={`/admin/publications/${prochaineAction.id}`} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur">Traiter la prochaine action <ArrowRight className="size-4" /></Link>}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Etape faite={reglages.actif && reglages.publication_automatique} titre="2 prises de parole par semaine" detail={`${jours}, le matin — articles et publications Facebook.`} />
          <Etape faite={facebookOperationnel} titre="Page Facebook reliée" detail={facebookOperationnel ? `${facebook.nom ?? "Gerimmo"} peut publier sans votre présence.` : facebook.erreur ?? "Connexion Facebook à terminer."} />
          <Etape faite={metaOperationnel} titre="Compte publicitaire relié" detail={metaOperationnel ? `Résultats lus en direct, plafond de ${argent(reglages.budget_mensuel_cents)} par mois.` : meta.erreur ?? "Le compte est enregistré ; les droits Ads ou la facturation restent à terminer."} />
        </div>
      </div>
    </section>

    <section aria-label="Situation marketing" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-[#cfe0ff] bg-[#eef4ff] p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#214d9b]">Publications à traiter</span><PenLine className="size-5 text-[#2f68d8]" /></div><div className="mt-2 text-3xl font-semibold text-[#183b7b]">{aRelire.length + aDiffuser.length}</div><p className="mt-1 text-xs text-[#49658e]">{aRelire.length} à relire · {aDiffuser.length} à diffuser</p></div>
      <div className="rounded-2xl border border-[#cdebe1] bg-[#edfaf6] p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#11664f]">Facebook</span><Share2 className="size-5 text-[#168368]" /></div><div className="mt-2 text-3xl font-semibold text-[#0d5c47]">{parutionsFacebook.length}</div><p className="mt-1 text-xs text-[#477568]">publications envoyées · {facebook.abonnes == null ? "audience en lecture" : `${nombre(facebook.abonnes)} abonnés`}</p></div>
      <div className="rounded-2xl border border-[#f1dfb9] bg-[#fff8e9] p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#855614]">Campagnes à venir</span><CalendarDays className="size-5 text-[#bb7b1e]" /></div><div className="mt-2 text-3xl font-semibold text-[#774808]">{futures.length}</div><p className="mt-1 text-xs text-[#8a6b3e]">planning modifiable avant diffusion</p></div>
      <div className="rounded-2xl border border-[#f0d4d4] bg-[#fff2f2] p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#8b3434]">Dépenses ce mois</span><CircleDollarSign className="size-5 text-[#bd4a4a]" /></div><div className="mt-2 text-3xl font-semibold text-[#832d2d]">{argent(depenseMois)}</div><p className="mt-1 text-xs text-[#936060]">plafond absolu : {argent(reglages.budget_mensuel_cents)}</p></div>
    </section>

    <section><div className="mb-4"><p className="libelle-champ">Vos possibilités</p><h2 className="mt-1 font-heading text-2xl text-[var(--bleu)]">Ce que l’équipe marketing Gerimmo prend en charge</h2></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Capacite icone={<Lightbulb className="size-5" />} titre="Stratégie éditoriale" detail="Alterner Gerimmo, gestion locative, investissement et conseils pratiques pour les particuliers, professionnels et artisans." statut="En service" />
      <Capacite icone={<PenLine className="size-5" />} titre="Création de contenus" detail="Préparer l’article, le texte Facebook et le visuel avec une information vérifiable et une présentation cohérente." statut="En service" />
      <Capacite icone={<Megaphone className="size-5" />} titre="Diffusion" detail="Publier deux fois par semaine sur la Page Gerimmo et conserver chaque prise de parole dans le Journal." statut={facebookOperationnel ? "Connectée" : "À finaliser"} />
      <Capacite icone={<Radar className="size-5" />} titre="Mesure et amélioration" detail="Suivre portée, clics, dépenses et campagnes afin de proposer les prochains sujets et arbitrages." statut={metaOperationnel ? "En direct" : "Autorisation à terminer"} />
    </div></section>

    {(campagnesResultat.error || publicationsResultat.error || reglagesResultat.error || mesuresResultat.error) && <p role="alert" className="err">Une partie des informations marketing est momentanément indisponible. Rechargez la page.</p>}

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">Feuille de route</p><h2>Calendrier éditorial</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Les contenus et campagnes prévus, dans l’ordre de diffusion.</p></div><Link href="/admin/publications/nouvelle" className="btn-or text-sm">Créer un article</Link></div><div className="mt-4 divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--ivoire)]">{futures.length === 0 ? <div className="vide-guide"><p className="titre">Aucune campagne programmée</p><p className="explication">Ajoutez la prochaine prise de parole ou laissez l’agent alimenter le rythme automatique.</p></div> : futures.map((c) => <article key={c.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-heading text-lg">{c.nom}</h3><span className="puce puce-prep">{date(c.publication_prevue_le)}</span></div><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Facebook · {c.nature === "sponsorisee" ? `sponsorisée · ${argent(c.budget_cents)}` : "gratuite"} · objectif : {OBJECTIFS[c.objectif] ?? "développer Gerimmo"}</p>{c.description && <p className="mt-2 text-sm">{c.description}</p>}</article>)}</div></div>
      <details className="section-ecran" open><summary className="cursor-pointer font-heading text-xl text-[var(--bleu)]">Programmer une campagne</summary><p className="my-3 text-sm leading-relaxed text-[var(--texte-secondaire)]">Choisissez le message, le public, la date et le budget. Une campagne sponsorisée reste en préparation tant que les droits Ads et le moyen de paiement ne sont pas opérationnels.</p><FormulaireCampagne /></details>
    </section>

    <section className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">Automatisation et garde-fous</p><h2>Rythme, diffusion et budget</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Vous pouvez tout mettre en pause instantanément. Le plafond est une limite maximale, jamais un objectif de dépense.</p></div><span className={`puce ${reglages.actif ? "puce-loue" : "puce-prep"}`}>{reglages.actif ? "Agent actif" : "En pause"}</span></div><div className="mt-4"><ReglagesAutomatiques reglages={reglages} comptePublicitaire={metaOperationnel} /></div></section>

    <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <div className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">Réseaux sociaux</p><h2>Publications Facebook</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">À relire, à diffuser et déjà publiées depuis Gerimmo.</p></div><Share2 className="size-6 text-[#2f68d8]" /></div><div className="mt-4 divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--ivoire)]">{aRelire.slice(0, 5).map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]"><div className="flex justify-between gap-2"><b>{p.titre}</b><span className="puce puce-grise">À relire</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">Vérifier l’article et son texte Facebook avant diffusion.</p></Link>)}{aDiffuser.map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]"><div className="flex justify-between gap-2"><b>{p.titre}</b><span className={`puce ${p.facebook_erreur ? "puce-prep" : "puce-grise"}`}>{p.facebook_erreur ? "Action requise" : "À diffuser"}</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">{p.facebook_erreur ? sansJargon(p.facebook_erreur) : "L’article est en ligne et attend sa diffusion Facebook."}</p></Link>)}{parutionsFacebook.slice(0, 10).map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]"><div className="flex justify-between gap-2"><b>{p.titre}</b><span className="puce puce-loue">Publiée</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">Diffusée le {date(p.facebook_publie_le)}</p></Link>)}{aRelire.length === 0 && aDiffuser.length === 0 && parutionsFacebook.length === 0 && <p className="p-4 text-sm text-[var(--texte-secondaire)]">Aucune publication Facebook pour le moment.</p>}</div></div>
      <div className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">Publicité payante</p><h2>Résultats Meta Ads</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Portée, clics et dépense, lus directement dans le compte publicitaire.</p></div><CircleDollarSign className="size-6 text-[#b77b22]" /></div>{!meta.configure ? <div className="vide-guide mt-4"><p className="titre">Compte publicitaire à relier</p><p className="explication">Facebook organique continue de fonctionner sans publicité payante.</p></div> : meta.erreur ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-900">Lecture des résultats à terminer</p><p className="mt-1 text-sm text-amber-800">{meta.erreur}</p><p className="mt-2 text-xs text-amber-700">Le compte est rattaché. Il reste à autoriser la lecture publicitaire et à ajouter le moyen de paiement Meta.</p></div></div></div> : actives.length === 0 ? <p className="vide mt-4">Compte relié. Aucune publicité active actuellement.</p> : <div className="mt-4 overflow-x-auto"><table><thead><tr><th>Campagne</th><th>Portée</th><th>Impressions</th><th>Clics</th><th>Dépense</th></tr></thead><tbody>{actives.map((c) => <tr key={c.id}><td>{c.nom}</td><td>{nombre(c.portee)}</td><td>{nombre(c.impressions)}</td><td>{nombre(c.clics)}</td><td>{argent(Math.round(c.depense * 100))}</td></tr>)}</tbody></table></div>}{anciennesMeta.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-[var(--bleu)]">Voir l’historique publicitaire ({anciennesMeta.length})</summary><div className="mt-3 divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)]">{anciennesMeta.map((c) => <div key={c.id} className="p-4 text-sm"><div className="flex justify-between gap-2"><b>{c.nom}</b><span className="puce puce-grise">{ETATS_PUBLICITE[c.statut] ?? "Terminée"}</span></div><p className="mt-2 text-[var(--texte-secondaire)]">{nombre(c.portee)} personnes · {nombre(c.clics)} clics · {argent(Math.round(c.depense * 100))}</p></div>)}</div></details>}</div>
    </section>

    <section className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">État des connexions</p><h2>Canaux et contrôle</h2></div><ShieldCheck className="size-6 text-[#138567]" /></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4"><div className="flex items-center gap-2"><Share2 className="size-5 text-[#2f68d8]" /><b>Facebook</b></div><p className="mt-2 text-sm text-[var(--texte-secondaire)]">{facebookOperationnel ? "Page reliée avec une autorisation durable" : "Connexion à terminer"}</p></div><div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4"><div className="flex items-center gap-2"><CircleDollarSign className="size-5 text-[#b77b22]" /><b>Meta Ads</b></div><p className="mt-2 text-sm text-[var(--texte-secondaire)]">{metaOperationnel ? "Compte relié et statistiques en direct" : meta.configure ? "Compte relié, autorisation publicitaire à terminer" : "Compte publicitaire non relié"}</p></div><div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 opacity-75"><div className="flex items-center gap-2"><Users className="size-5 text-[#7d8798]" /><b>Instagram</b></div><p className="mt-2 text-sm text-[var(--texte-secondaire)]">En pause selon votre choix</p></div></div></section>
    <ActualisationAuto />
  </main>;
}
