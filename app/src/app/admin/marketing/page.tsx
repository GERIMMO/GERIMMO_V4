import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, CheckCheck, ChevronDown, FilePenLine, Megaphone, PenLine, Settings2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { campagnesFacebook, depenseFacebookDuMois, santeFacebook } from "@/lib/marketing-meta";
import { sansJargon } from "@/lib/erreurs";
import { formaterDateHeureLongueParis } from "@/lib/heure-paris";
import { ActualisationAuto } from "./actualisation-auto";
import { FormulaireCampagne } from "./formulaire-campagne";
import { ReglagesAutomatiques } from "./reglages-automatiques";
import { VetoPost, type PostProgramme } from "./veto-post";

export const metadata = { title: "Marketing et contenus" };
export const dynamic = "force-dynamic";

type Campagne = { id: string; nom: string; description: string | null; canal: string; nature: string; objectif: string; statut: string; publication_prevue_le: string | null; budget_cents: number | null; cree_le: string };
type Publication = { id: string; titre: string; statut: string; slug: string | null; propose_le: string; publie_le: string | null; facebook_post_id: string | null; facebook_publie_le: string | null; facebook_erreur: string | null; facebook_image_url: string | null };
type Reglages = { actif: boolean; publication_automatique: boolean; publicite_active: boolean; jours_semaine: number[]; heure_paris: number; heure_preparation_paris: number; budget_mensuel_cents: number; validation_obligatoire: boolean; veille_mots_inclus: string[]; veille_mots_exclus: string[] };

const JOURS: Record<number, string> = { 1: "lundi", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi", 7: "dimanche" };
// À l'heure de Paris (25/09) : sans fuseau, le serveur affichait l'heure UTC.
const date = (valeur: string | null) => formaterDateHeureLongueParis(valeur, "Date à choisir");
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

import base from "../repertoires.module.css";
import styles from "../pilotage.module.css";
export default async function PageAgentMarketing() {
  const supabase = await createClient();
  const [campagnesResultat, publicationsResultat, reglagesResultat, depenses, facebook, meta, programmesResultat] = await Promise.all([
    supabase.from("marketing_campagnes").select("id,nom,description,canal,nature,objectif,statut,publication_prevue_le,budget_cents,cree_le").order("publication_prevue_le", { ascending: true, nullsFirst: false }),
    supabase.from("publications").select("id,titre,statut,slug,propose_le,publie_le,facebook_post_id,facebook_publie_le,facebook_erreur,facebook_image_url").order("propose_le", { ascending: false }).limit(100),
    supabase.from("marketing_reglages").select("actif,publication_automatique,publicite_active,jours_semaine,heure_paris,heure_preparation_paris,budget_mensuel_cents,validation_obligatoire,veille_mots_inclus,veille_mots_exclus").eq("singleton", true).single(),
    depenseFacebookDuMois(),
    santeFacebook(),
    campagnesFacebook(),
    // 06/10 : les posts en fenêtre de veto, du plus proche au plus lointain.
    supabase.from("publications").select("id,titre,chapo,facebook_texte,facebook_image_url,programmee_pour,valide_le,veille_source_id,slug", { count: "exact" }).eq("statut", "programmee").order("programmee_pour", { ascending: true }).limit(5),
  ]);
  const programmes = (programmesResultat.data ?? []) as PostProgramme[];
  const campagnes = (campagnesResultat.data ?? []) as Campagne[];
  const publications = (publicationsResultat.data ?? []) as Publication[];
  const reglages = (reglagesResultat.data ?? { actif: false, publication_automatique: false, publicite_active: false, jours_semaine: [2, 5], heure_paris: 9, heure_preparation_paris: 18, budget_mensuel_cents: 0, validation_obligatoire: false, veille_mots_inclus: [], veille_mots_exclus: [] }) as Reglages;
  const depenseMois = depenses.cents;
  const futures = campagnes.filter((c) => ["idee", "planifiee"].includes(c.statut));
  const actives = meta.campagnes.filter((c) => ["ACTIVE", "IN_PROCESS", "PENDING_REVIEW"].includes(c.statut));
  const anciennesMeta = meta.campagnes.filter((c) => !actives.includes(c));
  const parutionsFacebook = publications.filter((p) => p.facebook_post_id);
  const aDiffuser = publications.filter((p) => p.statut === "publiee" && !p.facebook_post_id);
  const aRelire = publications.filter((p) => ["proposition", "brouillon", "reportee"].includes(p.statut));
  const facebookOperationnel = facebook.configure && !facebook.erreur;
  const metaOperationnel = meta.configure && !meta.erreur;
  const jours = reglages.jours_semaine.map((jour) => JOURS[jour]).filter(Boolean).join(" et ") || "mardi et vendredi";
  // Le seuil est une alerte, pas une autorisation de dépense.
  const depassement = depenseMois != null && depenseMois > reglages.budget_mensuel_cents;

  const iaConfiguree = Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim());
  const fileIndisponible = Boolean(publicationsResultat.error);
  const preparation = reglagesResultat.error ? "État indisponible" : !reglages.actif ? "Préparation en pause" : !iaConfiguree ? "Connexion IA à terminer" : "Préparation activée";
  const prochainsVides = reglagesResultat.error ? "Les réglages ne sont pas disponibles. Actualisez avant de vérifier la programmation." : !reglages.actif ? "La préparation automatique est en pause. Vous pouvez créer un article ou reprendre la préparation dans les réglages." : !iaConfiguree ? "La préparation attend la connexion du service d’IA. Les contenus déjà créés restent accessibles." : `La préparation est prévue la veille des jours choisis (${jours}), à ${reglages.heure_preparation_paris} h, sous réserve des limites et des contrôles du service.`;
  const counts = (n:number) => fileIndisponible ? "—" : n;
  const columns = [
    {title:"À relire",rows:aRelire,tone:"ambre",empty:"Aucun article à relire dans les derniers contenus.",icon:FilePenLine},
    {title:"À diffuser",rows:aDiffuser,tone:"bleu",empty:"Aucun article en attente de diffusion dans les derniers contenus.",icon:Megaphone},
    {title:"Déjà diffusés",rows:parutionsFacebook,tone:"vert",empty:"Aucune publication Facebook parmi les derniers contenus.",icon:CheckCheck},
  ];

  return <main className={base.page}>
    <header className={base.header}><div><p className={base.eyebrow}>FAIRE CONNAÎTRE GERIMMO</p><TitreEcran rubrique="journal">Marketing et contenus</TitreEcran><p className={base.subtitle}>Vos contenus à relire, les prochaines publications et leurs résultats, au même endroit.</p></div><div className={styles.actions}><Link href="/admin/publications" className="btn-secondaire">Tous les articles <ArrowUpRight size={15} aria-hidden="true"/></Link><Link href="/admin/publications/nouvelle" className="btn-or"><PenLine size={16} aria-hidden="true"/>Créer un article</Link></div></header>
    {(campagnesResultat.error||publicationsResultat.error||reglagesResultat.error||programmesResultat.error)&&<p role="alert" className={styles.notice}>Une partie des informations est indisponible. <a href="/admin/marketing" className="underline">Actualiser la page</a></p>}
    <div className={base.stats}>
      <a href="#publications" className={base.stat} data-tone="ambre"><span className={base.statIcon}><FilePenLine size={19} aria-hidden="true"/></span><strong>{counts(aRelire.length)}</strong><span>Contenus à relire</span><small>Dans les 100 derniers articles</small></a>
      <a href="#veto" className={base.stat} data-tone="bleu"><span className={base.statIcon}><CalendarDays size={19} aria-hidden="true"/></span><strong>{programmesResultat.error?"—":programmesResultat.count??programmes.length}</strong><span>Posts programmés</span><small>À venir dans le calendrier</small></a>
      <a href="#canaux" className={base.stat} data-tone={facebookOperationnel?"vert":"ambre"}><span className={base.statIcon}><Megaphone size={19} aria-hidden="true"/></span><strong>{facebookOperationnel&&facebook.abonnes!=null?nombre(facebook.abonnes):"—"}</strong><span>Abonnés Facebook</span><small>{facebookOperationnel?"Audience de votre Page":facebook.configure?"Connexion à vérifier":"Page à relier"}</small></a>
      <a href="#resultats" className={base.stat} data-tone={depassement?"rouge":"bleu"}><span className={base.statIcon}><Wallet size={19} aria-hidden="true"/></span><strong>{argent(depenseMois)}</strong><span>Dépenses Meta ce mois</span><small>{!meta.configure?"Compte publicitaire à relier":depenses.erreur?"Lecture indisponible":`Seuil d’alerte : ${reglagesResultat.error?"—":argent(reglages.budget_mensuel_cents)}`}</small></a>
    </div>
    <div className={styles.hero}>
      <section id="veto" className={`${styles.panel} ${styles.feature} scroll-mt-24`}><div className={styles.head}><div><p className={styles.eyebrow}>LES 5 PROCHAINES DIFFUSIONS</p><h2>{programmes.length?"Vos prochains posts":"Votre prochain post"}</h2></div><span className={styles.icon}><CalendarDays size={21} aria-hidden="true"/></span></div>
        {programmesResultat.error?<p role="alert" className={styles.intro}>La programmation est momentanément indisponible.</p>:!programmes.length?<div className={styles.empty}><FilePenLine size={30} aria-hidden="true"/><div><h3>Aucun post programmé pour le moment</h3><p>{prochainsVides}</p><Link className={styles.link} href="/admin/publications/nouvelle">Préparer un article <ArrowUpRight size={15} aria-hidden="true"/></Link></div></div>:<div className={styles.stack}>{programmes.map(p=><VetoPost key={p.id} post={p} validationObligatoire={reglages.validation_obligatoire} diffusionActive={!reglagesResultat.error&&reglages.actif&&reglages.publication_automatique&&facebookOperationnel} quand={date(p.programmee_pour)}/>)}</div>}
      </section>
      <aside className={`${styles.panel} ${styles.gold}`}><p className={styles.eyebrow}>VOTRE LIGNE ÉDITORIALE</p><h2>Rythme et validation</h2><dl className="mt-4"><div className={styles.fact}><dt>Préparation</dt><dd>{preparation}</dd></div><div className={styles.fact}><dt>Jours choisis</dt><dd>{reglagesResultat.error?"—":jours}</dd></div><div className={styles.fact}><dt>Heure de publication</dt><dd>{reglagesResultat.error?"—":`${reglages.heure_paris} h · Paris`}</dd></div><div className={styles.fact}><dt>Diffusion automatique</dt><dd>{reglagesResultat.error?"À vérifier":!reglages.actif||!reglages.publication_automatique?"En pause":!facebookOperationnel?"Connexion à vérifier":reglages.validation_obligatoire?"Après votre validation":"Sauf report ou refus"}</dd></div></dl><Link className={styles.link} href="#reglages">Ajuster les réglages <Settings2 size={14} aria-hidden="true"/></Link><p className={styles.note}>Vous pouvez relire, modifier, reporter ou refuser un post. Le résultat de chaque diffusion reste attaché à l’article.</p></aside>
    </div>
    <section id="publications" className={styles.section}><div className={styles.sectionTitle}><div><h2>Votre atelier de contenus</h2><p>Les 100 derniers articles · ouvrez une fiche pour relire et agir.</p></div><Link className={styles.link} href="/admin/publications">Historique des articles <ArrowUpRight size={15} aria-hidden="true"/></Link></div><div className={styles.columns}>{columns.map(c=><section key={c.title} className={styles.column} data-tone={c.tone}><div className={styles.columnHead}><h3><c.icon size={16} aria-hidden="true"/>{c.title}</h3><span className={base.badge} data-tone={c.tone}>{counts(c.rows.length)}</span></div>{fileIndisponible?<p className={styles.columnEmpty}>Contenus indisponibles.</p>:!c.rows.length?<p className={styles.columnEmpty}>{c.empty}</p>:<>{c.rows.slice(0,4).map(p=><Link key={p.id} href={`/admin/publications/${p.id}`} className={styles.contentRow}>{p.facebook_image_url&&<Image unoptimized width={264} height={176} src={p.facebook_image_url} alt="Illustration de l’article" loading="lazy"/>}<strong>{p.titre}</strong><small>{p.facebook_erreur?sansJargon(p.facebook_erreur):p.facebook_post_id?`Diffusé le ${date(p.facebook_publie_le)}`:p.statut==="publiee"?"Article en ligne · diffusion Facebook à examiner":"Article et texte Facebook à relire"}</small></Link>)}{c.rows.length>4&&<Link className={`${styles.contentRow} ${styles.link}`} href="/admin/publications">Voir les autres articles <ArrowUpRight size={14} aria-hidden="true"/></Link>}</>}</section>)}</div></section>
    <section className={styles.twoColumns}>
      <div id="calendrier" className={`${styles.panel} scroll-mt-24`}><div className={styles.head}><div><p className={styles.eyebrow}>SUJETS À DÉVELOPPER</p><h2>Vos intentions éditoriales</h2></div><span className={base.badge}>{campagnesResultat.error?"—":futures.length}</span></div><p className={styles.intro}>Gardez vos idées, leurs objectifs et une date souhaitée. Une intention reste une note de travail jusqu’à la création d’un article.</p>{campagnesResultat.error?<p className={styles.note}>Intentions indisponibles.</p>:!futures.length?<p className={styles.note}>Aucune intention notée pour le moment.</p>:<div>{futures.map(c=><article className={styles.contentRow} key={c.id}><strong>{c.nom}</strong><small>{date(c.publication_prevue_le)} · {objectif(c.objectif)}{c.nature==="sponsorisee"?` · budget envisagé ${argent(c.budget_cents)} (sans lancement publicitaire)`:""}</small>{c.description&&<p className={styles.note}>{c.description}</p>}</article>)}</div>}<details id="programmer" className={styles.history}><summary>Noter une intention éditoriale</summary><div className="mt-3"><FormulaireCampagne objectifs={OBJECTIFS}/></div></details></div>
      <aside id="canaux" className={`${styles.panel} scroll-mt-24`}><div className={styles.head}><div><p className={styles.eyebrow}>CONNEXIONS</p><h2>Vos canaux de diffusion</h2></div><Megaphone size={21} aria-hidden="true"/></div>{[{name:"Facebook",state:facebookOperationnel?"Relié":facebook.configure?"À vérifier":"À relier",detail:facebookOperationnel?facebook.nom??"Page Gerimmo":facebook.configure?"La lecture de la Page doit être rétablie.":"La connexion de la Page est nécessaire pour diffuser.",ok:facebookOperationnel},{name:"Meta Ads",state:metaOperationnel?"Lecture reliée":meta.configure?"À vérifier":"À relier",detail:"Mesure des campagnes existantes. Aucun achat publicitaire depuis Gerimmo.",ok:metaOperationnel},{name:"Instagram",state:"Non proposé",detail:"Ce canal n’est pas disponible actuellement.",ok:false}].map(c=><div key={c.name} className={styles.contentRow}><div className="flex items-center justify-between gap-3"><strong>{c.name}</strong><span className={base.badge} data-tone={c.ok?"vert":"gris"}>{c.state}</span></div><small>{c.detail}</small></div>)}<Link className={styles.link} href="/admin/sante">Vérifier les connexions <ArrowUpRight size={15} aria-hidden="true"/></Link></aside>
    </section>
    <details id="reglages" className={styles.fold}><summary><span className={styles.icon}><Settings2 size={20} aria-hidden="true"/></span><div><h2>Réglages de préparation et de diffusion</h2><p>Jours, validation, mots-clés et seuil d’alerte sur les dépenses.</p></div><ChevronDown size={18} aria-hidden="true"/></summary><div className={styles.foldBody}><p className={`${styles.intro} mb-4`}>Le seuil compare les dépenses Meta constatées : il alerte sans bloquer ni engager de dépense. Les limites et l’arrêt du service restent applicables.</p>{reglagesResultat.error?<p role="alert" className="err">Les réglages doivent être relus avant toute modification.</p>:<ReglagesAutomatiques reglages={reglages} comptePublicitaire={metaOperationnel} pageReliee={facebookOperationnel}/>}</div></details>
    <section id="resultats" className={`${styles.panel} ${styles.section}`}><div className={styles.head}><div><p className={styles.eyebrow}>MESURER LE RÉSULTAT</p><h2>Résultats publicitaires</h2><p>Portée, clics et dépenses des campagnes Meta existantes.</p></div><Wallet size={21} aria-hidden="true"/></div>{!meta.configure?<p className={styles.intro}>Reliez le compte publicitaire pour consulter ses résultats. Aucune performance n’est estimée à partir des seuls contenus publiés.</p>:meta.erreur?<p role="alert" className="err">{meta.erreur}</p>:!actives.length?<p className={styles.intro}>Compte relié. Aucune publicité active actuellement.</p>:<div className="tableau-defilant" role="group" aria-label="Résultats Meta" tabIndex={0}><table><thead><tr><th>Campagne</th><th>Portée</th><th>Impressions</th><th>Clics</th><th>Dépense</th></tr></thead><tbody>{actives.map(c=><tr key={c.id}><td>{c.nom}</td><td>{nombre(c.portee)}</td><td>{nombre(c.impressions)}</td><td>{nombre(c.clics)}</td><td>{argent(Math.round(c.depense*100))}</td></tr>)}</tbody></table></div>}{anciennesMeta.length>0&&<details className={styles.history}><summary>Historique publicitaire ({anciennesMeta.length})</summary>{anciennesMeta.map(c=><div key={c.id} className={styles.contentRow}><strong>{c.nom} · {ETATS_PUBLICITE[c.statut]??"Terminée"}</strong><small>{nombre(c.portee)} personnes · {nombre(c.clics)} clics · {argent(Math.round(c.depense*100))}</small></div>)}</details>}</section>
    <p className={styles.note}>Les propositions, articles, diffusions et notes de travail gardent leurs validations existantes. Les services d’IA peuvent être facturés lors de la création de textes et de visuels. <Link href="/admin/relais" className="underline">Consulter les limites d’utilisation</Link>.</p>
    <ActualisationAuto actualiseLe={new Date().toISOString()}/>
  </main>;
}
