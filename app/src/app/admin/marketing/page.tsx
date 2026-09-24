import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Lightbulb, Megaphone, PenLine, Radar, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { campagnesFacebook, depenseFacebookDuMois, santeFacebook } from "@/lib/marketing-meta";
import { sansJargon } from "@/lib/erreurs";
import { ActualisationAuto } from "./actualisation-auto";
import { FormulaireCampagne } from "./formulaire-campagne";
import { ReglagesAutomatiques } from "./reglages-automatiques";

export const metadata = { title: "Agent marketing — Gerimmo" };
export const dynamic = "force-dynamic";

type Campagne = { id: string; nom: string; description: string | null; canal: string; nature: string; objectif: string; statut: string; publication_prevue_le: string | null; budget_cents: number | null; cree_le: string };
type Publication = { id: string; titre: string; statut: string; slug: string | null; propose_le: string; publie_le: string | null; facebook_post_id: string | null; facebook_publie_le: string | null; facebook_erreur: string | null; facebook_image_url: string | null };
type Reglages = { actif: boolean; publication_automatique: boolean; publicite_active: boolean; jours_semaine: number[]; heure_paris: number; budget_mensuel_cents: number };

const JOURS: Record<number, string> = { 1: "lundi", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi", 7: "dimanche" };
const date = (valeur: string | null) => valeur ? new Date(valeur).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date à choisir";
const argent = (cents: number | null) => cents == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const nombre = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
// UNE seule table d'objectifs (24/09) : le formulaire proposait « Obtenir des
// inscriptions » et le calendrier affichait « obtenir de nouveaux clients »
// pour la même valeur. Elle vit ici et descend au formulaire en propriété :
// un fichier « use server » (actions.ts) ne peut exporter que des fonctions.
const OBJECTIFS: [string, string][] = [
  ["notoriete", "Faire connaître Gerimmo"],
  ["trafic", "Amener des visites sur le site"],
  ["prospects", "Obtenir des demandes de contact"],
  ["conversion", "Obtenir des inscriptions"],
];
const objectif = (cle: string) => {
  const libelle = OBJECTIFS.find(([valeur]) => valeur === cle)?.[1] ?? "Développer Gerimmo";
  return libelle[0].toLowerCase() + libelle.slice(1);
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

// La pastille dit l'état réel (24/09) : « À finaliser » s'affichait en vert,
// la couleur de « fait » partout ailleurs sur la page. La carte n'est pas un
// lien : elle ne se soulève plus au survol.
function Capacite({ icone, titre, detail, statut, operationnel }: { icone: React.ReactNode; titre: string; detail: string; statut: string; operationnel: boolean }) {
  return <article className="rounded-2xl border border-[var(--filet)] bg-[var(--carte)] p-5">
    <div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--marque-clair)] text-[var(--marque)]">{icone}</span><span className={`puce ${operationnel ? "puce-loue" : "puce-prep"}`}>{statut}</span></div>
    <h3 className="mt-4 font-heading text-lg text-[var(--encre)]">{titre}</h3><p className="mt-1.5 text-sm leading-relaxed text-[var(--texte-secondaire)]">{detail}</p>
  </article>;
}

// Un canal et son état, dans « Canaux et contrôle » (24/09) : l'état des
// connexions était dit trois fois sur la page, sans jamais dire où relier.
function Canal({ nom, relie, detail }: { nom: string; relie: boolean | null; detail: string }) {
  return <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4">
    <div className="flex items-center justify-between gap-2"><b>{nom}</b><span className={`puce ${relie === null ? "puce-grise" : relie ? "puce-loue" : "puce-prep"}`}>{relie === null ? "Non proposé" : relie ? "Relié" : "À relier"}</span></div>
    <p className="mt-2 text-sm text-[var(--texte-secondaire)]">{detail}</p>
  </div>;
}

export default async function PageAgentMarketing() {
  const supabase = await createClient();
  const [campagnesResultat, publicationsResultat, reglagesResultat, depenses, facebook, meta] = await Promise.all([
    supabase.from("marketing_campagnes").select("id,nom,description,canal,nature,objectif,statut,publication_prevue_le,budget_cents,cree_le").order("publication_prevue_le", { ascending: true, nullsFirst: false }),
    supabase.from("publications").select("id,titre,statut,slug,propose_le,publie_le,facebook_post_id,facebook_publie_le,facebook_erreur,facebook_image_url").order("propose_le", { ascending: false }).limit(100),
    supabase.from("marketing_reglages").select("actif,publication_automatique,publicite_active,jours_semaine,heure_paris,budget_mensuel_cents").eq("singleton", true).single(),
    depenseFacebookDuMois(),
    santeFacebook(),
    campagnesFacebook(),
  ]);
  const campagnes = (campagnesResultat.data ?? []) as Campagne[];
  const publications = (publicationsResultat.data ?? []) as Publication[];
  const reglages = (reglagesResultat.data ?? { actif: false, publication_automatique: false, publicite_active: false, jours_semaine: [2, 5], heure_paris: 9, budget_mensuel_cents: 0 }) as Reglages;
  const depenseMois = depenses.cents;
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
  const aTraiter = aRelire.length + aDiffuser.length;
  // La tuile des dépenses ne rougit que si le plafond est dépassé (24/09) :
  // elle était rouge en permanence, sans dépense ni dépassement.
  const depassement = depenseMois != null && depenseMois > reglages.budget_mensuel_cents;

  return <main className="mx-auto w-full max-w-7xl flex-1 space-y-7 p-4 sm:p-7">
    {/* L'en-tête commun de la console (24/09) : le grand bandeau à photo, son
        slogan et ses trois cartes vitrées occupaient un à deux écrans. Les
        deux liens deviennent les boutons communs, cibles tactiles comprises. */}
    <div className="entete-page">
      <div className="min-w-0 flex-[1_1_20rem]"><h1>Agent marketing</h1><p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">L’agent choisit des sujets utiles, prépare les articles, les diffuse sur Facebook et centralise les résultats. Vous gardez ici les décisions, le budget et l’historique.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-discret">{reglages.actif ? `Deux sujets ${jours}, le matin · ${reglages.publication_automatique ? "diffusion automatique" : "brouillons à valider"}` : "Préparation des brouillons en pause"}</span>
        {prochaineAction && <Link href={`/admin/publications/${prochaineAction.id}`} className="btn-secondaire">Traiter la prochaine action <ArrowRight className="size-4" /></Link>}
        <Link href="/admin/publications/nouvelle" className="btn-or"><PenLine className="size-4" /> Créer un article</Link>
      </div>
    </div>

    {/* Seules les lectures de la base déclenchent l'alerte (24/09) : un compte
        Meta non relié est un état de configuration, dit par la tuile et par
        « Canaux et contrôle », pas une panne que recharger réparerait. */}
    {(campagnesResultat.error || publicationsResultat.error || reglagesResultat.error) && <p role="alert" className="err">Une partie des informations marketing est momentanément indisponible. Rechargez la page.</p>}

    {/* La tuile commune de la console ; la couleur suit la valeur (24/09). Les
        deux tuiles qui désignent une liste de la page y mènent. */}
    <section aria-label="Situation marketing" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Link href="#publications" className={`kpi ${aTraiter > 0 ? "ambre" : ""}`}><span className="libelle-champ">Publications à traiter</span><div className="chiffre montant">{aTraiter}</div><span className="mono-discret sans-majuscules">{aRelire.length} à relire · {aDiffuser.length} à diffuser</span></Link>
      <div className={`kpi ${facebookOperationnel ? "" : "ambre"}`}><span className="libelle-champ">Facebook</span><div className="chiffre montant">{parutionsFacebook.length}</div><span className="mono-discret sans-majuscules">publications envoyées · {facebookOperationnel ? (facebook.abonnes == null ? "audience en lecture" : `${nombre(facebook.abonnes)} abonnés`) : "Page à relier"}</span></div>
      <Link href="#calendrier" className="kpi"><span className="libelle-champ">Campagnes à venir</span><div className="chiffre montant">{futures.length}</div><span className="mono-discret sans-majuscules">planning modifiable avant diffusion</span></Link>
      <div className={`kpi ${depassement ? "rouge" : depenses.erreur ? "ambre" : ""}`}><span className="libelle-champ">Dépenses ce mois</span><div className="chiffre montant">{argent(depenseMois)}</div><span className="mono-discret sans-majuscules">budget autorisé : {argent(reglages.budget_mensuel_cents)}{depenses.erreur && <span className="mt-1 block">{depenses.erreur}</span>}</span></div>
    </section>

    {/* Le travail du jour d'abord (24/09) : la publication « À diffuser »
        n'arrivait qu'au cinquième écran de téléphone. */}
    <section id="publications" className="section-ecran scroll-mt-6"><div className="entete-carte"><div><p className="libelle-champ">Réseaux sociaux</p><h2>Publications Facebook</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">À relire, à diffuser et déjà publiées depuis Gerimmo.</p></div><Link href="/admin/publications" className="lien-discret text-[12.5px]">Tous les articles →</Link></div><div className="mt-4 divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--ivoire)]">{aRelire.slice(0, 5).map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]">{p.facebook_image_url&&<Image unoptimized width={264} height={176} src={p.facebook_image_url} alt="Illustration du sujet" loading="lazy" className="mb-3 aspect-[3/2] max-h-44 rounded-xl object-cover"/>}<div className="flex justify-between gap-2"><b>{p.titre}</b><span className="puce puce-grise">À relire</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">{p.facebook_erreur ? sansJargon(p.facebook_erreur) : "Vérifier l’article et son texte Facebook avant diffusion."}</p></Link>)}{aDiffuser.map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]">{p.facebook_image_url&&<Image unoptimized width={264} height={176} src={p.facebook_image_url} alt="Illustration du sujet" loading="lazy" className="mb-3 aspect-[3/2] max-h-44 rounded-xl object-cover"/>}<div className="flex justify-between gap-2"><b>{p.titre}</b><span className={`puce ${p.facebook_erreur ? "puce-prep" : "puce-grise"}`}>{p.facebook_erreur ? "Action requise" : "À diffuser"}</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">{p.facebook_erreur ? sansJargon(p.facebook_erreur) : "L’article est en ligne et attend sa diffusion Facebook."}</p></Link>)}{parutionsFacebook.slice(0, 10).map((p) => <Link key={p.id} href={`/admin/publications/${p.id}`} className="block p-4 hover:bg-[var(--survol)]">{p.facebook_image_url&&<Image unoptimized width={264} height={176} src={p.facebook_image_url} alt="Illustration du sujet" loading="lazy" className="mb-3 aspect-[3/2] max-h-44 rounded-xl object-cover"/>}<div className="flex justify-between gap-2"><b>{p.titre}</b><span className="puce puce-loue">Publiée</span></div><p className="mt-1 text-xs text-[var(--texte-secondaire)]">Diffusée le {date(p.facebook_publie_le)}</p></Link>)}{aRelire.length === 0 && aDiffuser.length === 0 && parutionsFacebook.length === 0 && <p className="p-4 text-sm text-[var(--texte-secondaire)]">Aucune publication Facebook pour le moment.</p>}</div></section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="section-ecran rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4"><h2>Vous gardez le dernier mot</h2><p className="mt-2 text-sm">Le mode automatique diffuse deux publications par semaine avec un visuel original : Gerimmo, ses fonctionnalités, conseils et relais de la veille officielle. Vous pouvez le suspendre à tout moment. Les études internes ne sont pas publiées comme des règles vérifiées ; les posts de veille renvoient à leur source. Les développements du logiciel et les campagnes payantes restent soumis à votre accord.</p><Link href="/admin/publications" className="btn-secondaire mt-3">Examiner les propositions</Link></section>
      <div id="calendrier" className="section-ecran scroll-mt-6"><div className="entete-carte"><div><p className="libelle-champ">Feuille de route</p><h2>Calendrier éditorial</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Les campagnes prévues, dans l’ordre de diffusion.</p></div></div><div className="mt-4 divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--ivoire)]">{futures.length === 0 ? <div className="vide-guide"><p className="titre">Aucune campagne programmée</p><p className="explication">Le rythme automatique suit les deux jours choisis dans les réglages. Les campagnes supplémentaires se préparent ici.</p><div className="geste"><a className="btn-secondaire" href="#programmer">Programmer une campagne</a></div></div> : futures.map((c) => <article key={c.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-heading text-lg">{c.nom}</h3><span className="puce puce-prep">{date(c.publication_prevue_le)}</span></div><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Facebook · {c.nature === "sponsorisee" ? `sponsorisée · ${argent(c.budget_cents)}` : "gratuite"} · objectif : {objectif(c.objectif)}</p>{c.description && <p className="mt-2 text-sm">{c.description}</p>}</article>)}</div></div>
      {/* Un en-tête de carte comme les autres sections (24/09) : l'action de
          création de la page n'avait pas à se replier derrière un triangle. */}
      <div id="programmer" className="section-ecran scroll-mt-6"><div className="entete-carte"><div><p className="libelle-champ">Nouvelle campagne</p><h2>Programmer une campagne</h2><p className="mt-1 text-sm leading-relaxed text-[var(--texte-secondaire)]">Choisissez le message, le public, la date et le budget. Une campagne sponsorisée reste en préparation tant que les droits Ads et le moyen de paiement ne sont pas opérationnels.</p></div></div><FormulaireCampagne objectifs={OBJECTIFS} /></div>
    </section>

    <section className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">Automatisation et garde-fous</p><h2>Rythme, diffusion et budget</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Vous pouvez tout mettre en pause instantanément. Le plafond est une limite maximale, jamais un objectif de dépense.</p></div><span className={`puce ${reglages.actif ? "puce-loue" : "puce-prep"}`}>{reglages.actif ? "Agent actif" : "En pause"}</span></div><div className="mt-4"><ReglagesAutomatiques reglages={reglages} comptePublicitaire={metaOperationnel} /></div></section>

    {/* L'état des canaux, en un seul endroit, avec le moyen de les relier
        (24/09). Instagram n'a aucun réglage : il n'est pas « en pause selon
        votre choix », il n'est pas proposé. */}
    <section className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">État des connexions</p><h2>Canaux et contrôle</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">La Page Facebook permet les publications gratuites. Le compte publicitaire sert aux campagnes payantes et à leurs résultats. Chaque connexion a son propre état.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3">
      <Canal nom="Facebook" relie={facebookOperationnel} detail={facebookOperationnel ? `${facebook.nom ?? "La Page Gerimmo"} peut publier sans votre présence.` : facebook.configure ? `Connexion à vérifier : ${facebook.erreur ?? "la Page ne répond pas"}.` : "À relier par la configuration du service (jeton Meta de la Page)."} />
      <Canal nom="Meta Ads" relie={metaOperationnel} detail={metaOperationnel ? `Compte relié et statistiques en direct, budget autorisé de ${argent(reglages.budget_mensuel_cents)} par mois.` : meta.configure ? "Compte relié : les droits publicitaires ou le moyen de paiement restent à terminer." : "À relier par la configuration du service (compte publicitaire Meta). Facebook gratuit fonctionne sans lui."} />
      <Canal nom="Instagram" relie={null} detail="Non proposé pour l’instant." />
    </div></section>

    {meta.configure && <section className="section-ecran"><div className="entete-carte"><div><p className="libelle-champ">Publicité payante</p><h2>Résultats Meta Ads</h2><p className="mt-1 text-sm text-[var(--texte-secondaire)]">Portée, clics et dépense, lus directement dans le compte publicitaire.</p></div></div>{meta.erreur ? <div className="mt-4 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-4"><div className="flex gap-3"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warning-soft-foreground)]" /><div><p className="font-semibold text-[var(--warning-soft-foreground)]">Lecture des résultats à terminer</p><p className="mt-1 text-sm text-[var(--warning-soft-foreground)]">{meta.erreur}</p><p className="mt-2 text-xs text-[var(--warning-soft-foreground)]">Le compte est rattaché. Il reste à autoriser la lecture publicitaire et à ajouter le moyen de paiement Meta.</p></div></div></div> : actives.length === 0 ? <p className="vide mt-4">Compte relié. Aucune publicité active actuellement.</p> : <div className="mt-4 overflow-x-auto"><table><thead><tr><th>Campagne</th><th>Portée</th><th>Impressions</th><th>Clics</th><th>Dépense</th></tr></thead><tbody>{actives.map((c) => <tr key={c.id}><td>{c.nom}</td><td>{nombre(c.portee)}</td><td>{nombre(c.impressions)}</td><td>{nombre(c.clics)}</td><td>{argent(Math.round(c.depense * 100))}</td></tr>)}</tbody></table></div>}{anciennesMeta.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-[var(--bleu)]">Voir l’historique publicitaire ({anciennesMeta.length})</summary><div className="mt-3 divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)]">{anciennesMeta.map((c) => <div key={c.id} className="p-4 text-sm"><div className="flex justify-between gap-2"><b>{c.nom}</b><span className="puce puce-grise">{ETATS_PUBLICITE[c.statut] ?? "Terminée"}</span></div><p className="mt-2 text-[var(--texte-secondaire)]">{nombre(c.portee)} personnes · {nombre(c.clics)} clics · {argent(Math.round(c.depense * 100))}</p></div>)}</div></details>}</section>}

    {/* La présentation ne revient plus à chaque visite en tête de page
        (24/09) : elle se replie tout en bas. */}
    <details className="section-ecran group"><summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><div className="entete-carte"><div><p className="libelle-champ">Vos possibilités</p><h2>Ce que l’équipe marketing Gerimmo prend en charge</h2></div><span className="lien-discret text-[12.5px]"><span className="group-open:hidden">Afficher</span><span className="hidden group-open:inline">Masquer</span></span></div></summary><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Capacite icone={<Lightbulb className="size-5" />} titre="Stratégie éditoriale" detail="Alterner Gerimmo, gestion locative, investissement et conseils pratiques pour les particuliers, professionnels et artisans." statut="En service" operationnel />
      <Capacite icone={<PenLine className="size-5" />} titre="Création de contenus" detail="Préparer l’article, le texte Facebook et le visuel avec une information vérifiable et une présentation cohérente." statut="En service" operationnel />
      <Capacite icone={<Megaphone className="size-5" />} titre="Diffusion" detail="Deux sujets par semaine, un nouveau visuel par post, diffusion automatique activable ou mise en pause depuis cet écran." statut={facebookOperationnel ? "Connectée" : "À finaliser"} operationnel={facebookOperationnel} />
      <Capacite icone={<Radar className="size-5" />} titre="Mesure et amélioration" detail="Suivre portée, clics, dépenses et campagnes afin de proposer les prochains sujets et arbitrages." statut={metaOperationnel ? "En direct" : "Autorisation à terminer"} operationnel={metaOperationnel} />
    </div></details>
    <ActualisationAuto />
  </main>;
}
