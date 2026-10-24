import {lireEditeur} from '@/lib/editeur-serveur';
import { SuiviDecisions } from "./suivi-decisions";
import { chargerFaitsDirection } from "@/lib/faits-direction";
import { ListeEquipes } from "./liste-equipes";
import { FaitsDeDirection } from "./faits-direction";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { faitsManquants } from "@/lib/editeur";
import { chargerDecisionsAttendues } from "@/lib/decisions-attendues";
import { EQUIPES, estEquipe, missionsDeLEquipe, type Equipe } from "@/lib/missions";
import { jourDuPoint } from "@/lib/point-du-matin";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { BoutonBriefIA } from "./bouton-ia";
import { FileDecisions } from "./file-decisions";
import { PreparerPoint } from "./preparer-point";
import { dateLongue, lirePoints, type PointLu } from "./lecture";
import { ArrowRight, CalendarDays, ClipboardCheck, FileText, Users, PenLine, Compass, Building2, Wallet, Wrench, ShieldCheck, Megaphone, Map as Carte, HeartPulse, History, ChevronDown, Settings2, ArrowUpRight } from "lucide-react";
import styles from "./accueil.module.css";

// Trois vues partageant les mêmes sources et actions de supervision.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ vue?: string; pageDecisions?:string; etatDecision?:string; categorie?:string }> }) {
  const { vue } = await searchParams;
  return { title: vue === "decisions" ? "Décisions à prendre" : vue === "equipes" ? "Équipes et comptes rendus" : "Bureau de direction" };
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const ICONES_EQUIPES = { exploitation: Building2, finance: Wallet, incidents: Wrench, conformite: ShieldCheck, marketing: Megaphone, territoire: Carte, qualite: HeartPulse };

// 25/09 (audit C1, C2, C3, C7, C31) : UN écran de début de journée. En tête, ce
// qui attend une décision, avec ses boutons ; puis chaque équipe avec son
// dernier passage (heure de Paris), ses résultats et ce qu'elle soumet ; puis
// les jours précédents. La stratégie et les compteurs sans décision n'y sont
// plus.
export default async function PageBrief({ searchParams }: { searchParams: Promise<{ jour?: string; equipe?: string; vue?: string; pageDecisions?:string; etatDecision?:string; categorie?:string }> }) {
  const p = await searchParams;
  const vue = p.vue === "decisions" || p.vue === "equipes" ? p.vue : "bureau";
  const titre = vue === "decisions" ? "Décisions à prendre" : vue === "equipes" ? "Équipes et comptes rendus" : "Bureau de direction";
  const aujourdhui = jourDuPoint();
  const jour = p.jour && /^\d{4}-\d{2}-\d{2}$/.test(p.jour) ? p.jour : aujourdhui;
  const filtreEquipe: Equipe | undefined = p.equipe && estEquipe(p.equipe) ? p.equipe : undefined;
  const supabase = await createClient();
  const depuis = new Date(`${aujourdhui}T12:00:00Z`); depuis.setDate(depuis.getDate() - 14);
  const identite=await lireEditeur();
  const [duJour, historique, decisions, faits] = await Promise.all([
    lirePoints(supabase, { jour, limite: 20 }),
    lirePoints(supabase, { depuis: depuis.toISOString().slice(0, 10), equipe: filtreEquipe, limite: 120 }),
    // Le même calcul que la barre haute et l'accueil (lib/decisions-attendues.ts) :
    // il porte AUSSI la liste affichée sous « À décider » (audit console 27/09).
    chargerDecisionsAttendues(supabase, process.env, faitsManquants(identite.indisponible?{}:identite.editeur).length),
    chargerFaitsDirection(supabase, jour),
  ]);

  const points = duJour.points ?? [];
  const estAujourdhui = jour === aujourdhui;
  // Historique : les jours précédents, un rang par point ; le jour affiché est exclu.
  const jours = new Map<string, PointLu[]>();
  for (const pt of historique.points ?? []) { if (pt.jour === jour) continue; jours.set(pt.jour, [...(jours.get(pt.jour) ?? []), pt]); }

  // « À décider » liste ce que les files attendent MAINTENANT, point préparé ou
  // non ; le point d'aujourd'hui fournit les gestes en un clic quand il porte
  // la décision. Le chiffre de la puce est le nombre de rangs listés.
  const duPoint = new Map((estAujourdhui ? points : []).flatMap((pt) => pt.decisions.filter((d) => d.statut === "en_attente").map((d) => [d.cle, d] as const)));
  const lecturesEnEchec = decisions.indisponibles.length;

  const lienJour = (j: string, e?: Equipe) => `/admin/brief?${new URLSearchParams({ ...(vue !== "bureau" ? { vue } : {}), ...(j !== aujourdhui ? { jour: j } : {}), ...(e ? { equipe: e } : {}) }).toString()}`.replace(/\?$/, "");
  const dernierPassage = (pt: PointLu) => pt.contenu.passages.map((x) => x.debut).sort().at(-1) ?? null;

  return (
    <main className={styles.page} data-vue={vue}>
      <header className={styles.hero}>
        <div className={styles.heroIntro}>
          <p className={styles.eyebrow}>Gerimmo / Direction générale</p>
          <TitreEcran rubrique="suivi">{titre}</TitreEcran>
          <p className={styles.subtitle}>{vue === "decisions" ? "Les problèmes d’abord, puis les accords et les contenus." : vue === "equipes" ? "Les résultats de chaque équipe, les difficultés rencontrées et les décisions attendues." : "L’essentiel pour piloter Gerimmo."}</p>
        </div>
        <div className={styles.heroRight}>
          <span className={styles.date}><CalendarDays size={15} aria-hidden="true" />{dateLongue(jour)}</span>
          <div className={styles.heroActions}>
            {vue === "bureau" && estAujourdhui && <PreparerPoint libelle={points.length > 0 ? "Actualiser" : "Préparer le point"} />}
            {vue !== "bureau" && <Link href="/admin/consignes" className="btn-or"><PenLine size={16} aria-hidden="true" />Donner une consigne</Link>}
          </div>
        </div>
      </header>
      {duJour.erreur && <p role="alert" className="err mb-5">Le point du matin est indisponible. Aucun état ne peut être confirmé.</p>}
      {lecturesEnEchec > 0 && <p role="alert" className="err mb-5">{pluriel(lecturesEnEchec, "lecture")} de cette page {lecturesEnEchec > 1 ? "ont" : "a"} échoué : ce qui manque n’est pas un zéro.</p>}
      {vue === "bureau" && <nav className={styles.overview} aria-label="Repères du jour">
        <Link href="/admin/brief?vue=decisions" className={styles.metric} data-tone="ambre"><span className={styles.icon}><ClipboardCheck size={21} aria-hidden="true" /></span><span><strong>{lecturesEnEchec ? "À vérifier" : decisions.total}</strong><small>Sujets à traiter</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
        <Link href="/admin/brief?vue=equipes" className={styles.metric} data-tone="bleu"><span className={styles.icon}><Users size={21} aria-hidden="true" /></span><span><strong>{Object.keys(EQUIPES).length}</strong><small>Équipes à votre service</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
        <Link href="/admin/brief?vue=equipes" className={styles.metric} data-tone="vert"><span className={styles.icon}><FileText size={21} aria-hidden="true" /></span><span><strong>{duJour.erreur ? "Indisponibles" : points.length ? points.filter(pt => pt.statut === "a_lire").length : "À préparer"}</strong><small>Comptes rendus à lire{points.length > 0 ? ` · ${points.length} disponibles` : ""}</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
      </nav>}

      <div className={styles.workspace} data-vue={vue}>
      {vue !== "equipes" && <aside className={styles.priorities} aria-label="Priorités et consignes">
      {/* ── Ce qui attend une décision, en premier ─────────────────────── */}
      <section className={`${styles.section} ${styles.decisions}`} id="a-decider">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Demandes à examiner</h2>
          <span className={`puce ${decisions.total > 0 || lecturesEnEchec ? "puce-prep" : "puce-grise"}`}>{lecturesEnEchec ? "À vérifier" : decisions.total > 0 ? `${decisions.total} en attente` : "À jour"}</span>
        </div>
        <p className={styles.sectionDescription}>{vue === "bureau" ? "Ouvrez une catégorie pour traiter les demandes à votre rythme." : "Ouvrez une demande pour lire le détail et décider."}</p>
        <FileDecisions key={`${vue}:${p.categorie ?? "tout"}`} decisions={decisions.decisions} signaux={decisions.signaux} reserve={decisions.reserve}
          cartes={[...duPoint.values()]} vue={vue} categorie={p.categorie} indisponible={lecturesEnEchec > 0} />
      </section>
      {vue === "decisions" && <details className={styles.section} open={Boolean(p.pageDecisions || p.etatDecision)}><summary className="cursor-pointer font-semibold">Historique des décisions</summary><div className="mt-4"><SuiviDecisions page={p.pageDecisions} etat={p.etatDecision}/></div></details>}
      {vue === "bureau" && <aside className={styles.directorTools} aria-label="Commandes du dirigeant">
        <div className={styles.commandPanel}>
          <p className={styles.commandEyebrow}>VOTRE POSTE DE COMMANDE</p>
          <h2>Gardez la main.</h2>
          <p>Les bons accès pour orienter Gerimmo.</p>
          <nav aria-label="Actions du dirigeant">
            <Link href="/admin/consignes"><PenLine size={19} aria-hidden="true" /><span><strong>Donner une consigne</strong><small>Fixer le cap et les limites</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link href="/admin/equipes"><Settings2 size={19} aria-hidden="true" /><span><strong>Régler les automatismes</strong><small>Superviser les tâches</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link href="/admin/sante"><HeartPulse size={19} aria-hidden="true" /><span><strong>Vérifier le service</strong><small>Connexions et traitements</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          </nav>
        </div>
        <section className={styles.relay} aria-labelledby="relais-titre">
          <Compass size={25} aria-hidden="true" />
          <p className={styles.relayEyebrow}>CONTINUITÉ DE GERIMMO</p>
          <h2 id="relais-titre">Partez l’esprit<br />plus tranquille.</h2>
          <p>Préparez votre relais, définissez les limites et gardez les décisions importantes.</p>
          <Link href="/admin/relais">Préparer mon absence <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </section>
      </aside>}
      </aside>}

      {/* ── Les équipes : dernier passage, résultats, à valider ─────────── */}
      {vue !== "decisions" && <section className={styles.teams} id="equipes">
        <div className={styles.sectionHeader}>
          <div>
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Vos équipes</h2>
          <p className={styles.sectionDescription}>Les comptes rendus arrivent ici. Ouvrez une équipe pour faire le point.</p>
          </div>
          {vue === "bureau" ? <Link className={styles.textLink} href="/admin/brief?vue=equipes">Tous les comptes rendus <ArrowRight size={15} aria-hidden="true" /></Link> : estAujourdhui && points.length > 0 && <PreparerPoint libelle="Actualiser le point" />}
        </div>
        {!duJour.erreur && points.length === 0 && (
          <div className="vide-guide">
            <p className="titre">{estAujourdhui ? "Le point de ce matin n’est pas encore préparé." : "Aucun point ce jour-là."}</p>
            <p className="explication">Il s’assemble automatiquement à la fin de chaque passage de nuit.{estAujourdhui ? " Vous pouvez le préparer maintenant à partir des données du moment." : ""}</p>
            {estAujourdhui && <div className="geste"><PreparerPoint /></div>}
          </div>
        )}
        {!duJour.erreur && points.length === 0 && <div className={styles.teamDirectory}>
          {(Object.keys(EQUIPES) as Equipe[]).map(e => {
            const Icone = ICONES_EQUIPES[e];
            return <Link key={e} href={EQUIPES[e].page}><span className={styles.teamIcon}><Icone size={18} aria-hidden="true" /></span><span>{EQUIPES[e].nom}</span><ArrowRight size={15} aria-hidden="true" /></Link>;
          })}
        </div>}
        {points.length > 0 && <ListeEquipes rapports={points.map(pt => {
          const attente = estAujourdhui && !lecturesEnEchec ? decisions.decisions.filter(d => d.equipe === pt.equipe).length : pt.decisions.filter(d => d.statut === "en_attente").length;
          const passage = dernierPassage(pt);
          return { id: pt.id, equipe: pt.equipe, nom: pt.nom, href: `/admin/brief/${pt.equipe}${estAujourdhui ? "" : `?jour=${jour}`}`, nonLu: pt.statut === "a_lire", attente, echecs: pt.contenu.echecs.length, resultats: pt.contenu.realisations.length,
            passage: passage ? `Dernier passage : ${formaterDateHeureParis(passage)}` : missionsDeLEquipe(pt.equipe).length === 0 ? "Décisions uniquement · aucun passage planifié" : "Aucun passage dans les dernières 24 h",
            bilanVide: !passage && pt.contenu.realisations.length === 0 && attente === 0 && pt.contenu.echecs.length === 0 };
        })} />}
        <div className={styles.teamsFooter}><span>{NOTE_FUSEAU}</span><Link href="/admin/equipes">Commandes des équipes <ArrowRight size={14} aria-hidden="true" /></Link></div>
      </section>}
      </div>

      {vue === "bureau" && <div className={styles.facts}><FaitsDeDirection snapshot={faits.snapshot} erreur={faits.erreur} /></div>}

      {/* ── Jours précédents ───────────────────────────────────────────── */}
      {vue !== "decisions" && <details className={styles.history} open={historique.erreur || Boolean(filtreEquipe) || !estAujourdhui}>
        <summary><History size={19} aria-hidden="true" /><h2>Jours précédents</h2><span>Les 14 derniers jours</span><ChevronDown size={18} className={styles.chevron} aria-hidden="true" /></summary>
        <div className={styles.historyContent}>
        {jours.size > 0 || filtreEquipe ? (
          <nav aria-label="Filtrer l’historique par équipe" className="mb-4 flex flex-wrap gap-2">
            <Link href={lienJour(jour)} className={`filtre${!filtreEquipe ? " actif" : ""}`}>Toutes les équipes</Link>
            {(Object.keys(EQUIPES) as Equipe[]).map((e) => <Link key={e} href={lienJour(jour, e)} className={`filtre${filtreEquipe === e ? " actif" : ""}`}>{EQUIPES[e].nom}</Link>)}
          </nav>
        ) : null}
        {historique.erreur ? <p role="alert" className="err">L’historique est indisponible.</p> : jours.size === 0 ? <p className="text-sm text-muted-foreground">Aucun autre point sur les quatorze derniers jours{filtreEquipe ? " pour cette équipe" : ""}.</p> : (
          <div className="colonne-liste">
            {[...jours.entries()].map(([j, pts]) => pts.map((pt) => {
              const attente = pt.decisions.filter((d) => d.statut === "en_attente").length;
              return (
                <Link key={pt.id} href={`/admin/brief/${pt.equipe}?jour=${j}`} className="rang w-full">
                  <div className="min-w-0 flex-1"><b>{dateLongue(j)} · {pt.nom}</b><br /><small>{pluriel(pt.contenu.realisations.length, "résultat")} · {pluriel(pt.contenu.echecs.length, "échec")} · {pluriel(pt.decisions.length, "décision")}{attente > 0 ? ` (${attente} en attente)` : ""} · {pt.statut === "lu" ? "lu" : "non lu"}</small></div>
                  <span className="lien-discret text-sm">Détail →</span>
                </Link>
              );
            }))}
          </div>
        )}
        </div>
      </details>}

      {/* L'analyse IA n'apparaît que si le service est relié (audit C31) :
          annoncer une fonction inactive n'aide aucune décision. */}
      {vue === "bureau" && Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim()) && (
        <section className="section-ecran"><BoutonBriefIA disponible /></section>
      )}
    </main>
  );
}
