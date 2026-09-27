import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { faitsManquants } from "@/lib/editeur";
import { chargerDecisionsAttendues } from "@/lib/decisions-attendues";
import { EQUIPES, estEquipe, missionsDeLEquipe, type Equipe } from "@/lib/missions";
import { jourDuPoint } from "@/lib/point-du-matin";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { BoutonBriefIA } from "./bouton-ia";
import { OuvrirAlertes } from "./ouvrir-alertes";
import { DecisionMatin } from "./decision-matin";
import { PreparerPoint } from "./preparer-point";
import { dateLongue, lirePoints, type PointLu } from "./lecture";

// Le nom de l'entrée de menu (audit 25/09, C8) : « Aujourd'hui ».
export const metadata = { title: "Aujourd’hui — Gerimmo" };

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// 25/09 (audit C1, C2, C3, C7, C31) : UN écran de début de journée. En tête, ce
// qui attend une décision, avec ses boutons ; puis chaque équipe avec son
// dernier passage (heure de Paris), ses résultats et ce qu'elle soumet ; puis
// les jours précédents. La stratégie et les compteurs sans décision n'y sont
// plus.
export default async function PageBrief({ searchParams }: { searchParams: Promise<{ jour?: string; equipe?: string }> }) {
  const p = await searchParams;
  const aujourdhui = jourDuPoint();
  const jour = p.jour && /^\d{4}-\d{2}-\d{2}$/.test(p.jour) ? p.jour : aujourdhui;
  const filtreEquipe: Equipe | undefined = p.equipe && estEquipe(p.equipe) ? p.equipe : undefined;
  const supabase = await createClient();
  const depuis = new Date(`${aujourdhui}T12:00:00Z`); depuis.setDate(depuis.getDate() - 14);
  const [duJour, historique, decisions] = await Promise.all([
    lirePoints(supabase, { jour, limite: 20 }),
    lirePoints(supabase, { depuis: depuis.toISOString().slice(0, 10), equipe: filtreEquipe, limite: 120 }),
    // Le même calcul que la barre haute et l'accueil (lib/decisions-attendues.ts) :
    // il porte AUSSI la liste affichée sous « À décider » (audit console 27/09).
    chargerDecisionsAttendues(supabase, process.env, faitsManquants().length),
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
  const parEquipe = new Map<Equipe, typeof decisions.decisions>();
  for (const d of decisions.decisions) parEquipe.set(d.equipe as Equipe, [...(parEquipe.get(d.equipe as Equipe) ?? []), d]);
  const signaux = decisions.signaux;
  const lecturesEnEchec = decisions.indisponibles.length;
  const rienADecider = decisions.total === 0;

  const lienJour = (j: string, e?: Equipe) => `/admin/brief?${new URLSearchParams({ ...(j !== aujourdhui ? { jour: j } : {}), ...(e ? { equipe: e } : {}) }).toString()}`.replace(/\?$/, "");
  const dernierPassage = (pt: PointLu) => pt.contenu.passages.map((x) => x.debut).sort().at(-1) ?? null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Aujourd’hui</h1>
        <span className="mono-discret">Le point du matin · {dateLongue(jour)}</span>
      </div>
      {duJour.erreur && <p role="alert" className="err mb-5">Le point du matin est indisponible. Aucun état ne peut être confirmé.</p>}
      {lecturesEnEchec > 0 && <p role="alert" className="err mb-5">{pluriel(lecturesEnEchec, "lecture")} de cette page {lecturesEnEchec > 1 ? "ont" : "a"} échoué : ce qui manque n’est pas un zéro.</p>}

      {/* ── Ce qui attend une décision, en premier ─────────────────────── */}
      <section className="section-ecran" id="a-decider">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">À décider</h2>
          <span className={`puce ${decisions.total > 0 ? "puce-prep" : "puce-grise"}`}>{decisions.total > 0 ? `${pluriel(decisions.total, "décision")} attendue${decisions.total > 1 ? "s" : ""}` : "Rien à trancher"}</span>
        </div>
        {rienADecider ? (
          <div className="vide-guide"><p className="titre">Rien n’attend votre décision.</p><p className="explication">Les équipes continuent le travail autorisé.</p></div>
        ) : (
          <div className="grid gap-6">
            {[...parEquipe.entries()].map(([equipe, liste]) => (
              <div key={equipe}>
                <p className="eyebrow mb-2 text-[var(--marque-sombre)]">Équipe {EQUIPES[equipe].nom}</p>
                <ul className="grid gap-4">{liste.map((d) => {
                  const carte = duPoint.get(d.cle);
                  return carte ? <DecisionMatin key={d.cle} decision={carte} /> : (
                    <li key={d.cle} className="loc-carte">
                      <h4 className="font-semibold text-[var(--encre)]">{d.titre}</h4>
                      <p className="mt-1 text-sm text-[var(--texte-secondaire)]">{d.pourquoi}</p>
                      <p className="mt-3 text-sm"><Link href={d.lien} className="btn-secondaire">Décider sur son écran →</Link>{estAujourdhui && <span className="ml-3 text-[var(--texte-secondaire)]">{decisions.pointPrepare ? "Arrivée après la préparation du point." : "Le point n’est pas encore préparé."}</span>}</p>
                    </li>
                  );
                })}</ul>
              </div>
            ))}
            {/* Le rang commun de la console (nuit du 25/09) : tout le carré se
                clique, comme la liste des clients de l'ancienne vue d'ensemble. */}
            {signaux.length > 0 && (
              <div>
                {decisions.decisions.length > 0 && <p className="eyebrow mb-2 text-[var(--marque-sombre)]">Hors équipes</p>}
                <div className="colonne-liste">
                  {signaux.map((signal) => {
                    const classe = "rang w-full flex-wrap justify-between";
                    const contenu = <><span className="min-w-0 flex-1"><b>{signal.titre}</b><br /><small>{signal.detail}</small></span><span className="btn-secondaire shrink-0">{signal.action} →</span></>;
                    return signal.href ? <Link key={signal.cle} href={signal.href} className={classe}>{contenu}</Link> : <OuvrirAlertes key={signal.cle} className={classe}>{contenu}</OuvrirAlertes>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Les équipes : dernier passage, résultats, à valider ─────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Les équipes</h2>
          {estAujourdhui && points.length > 0 && <PreparerPoint libelle="Actualiser le point" />}
        </div>
        {!duJour.erreur && points.length === 0 && (
          <div className="vide-guide">
            <p className="titre">{estAujourdhui ? "Le point de ce matin n’est pas encore préparé." : "Aucun point ce jour-là."}</p>
            <p className="explication">Il s’assemble automatiquement à la fin de chaque passage de nuit.{estAujourdhui ? " Vous pouvez le préparer maintenant à partir des données du moment." : ""}</p>
            {estAujourdhui && <div className="geste"><PreparerPoint /></div>}
          </div>
        )}
        {points.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2">
            {points.map((pt) => {
              const attente = pt.decisions.filter((d) => d.statut === "en_attente").length;
              const passage = dernierPassage(pt);
              const sansMission = missionsDeLEquipe(pt.equipe).length === 0;
              return (
                <Link key={pt.id} href={`/admin/brief/${pt.equipe}${estAujourdhui ? "" : `?jour=${jour}`}`} className="loc-carte group block transition-colors hover:bg-[var(--survol)]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading text-[16px] text-[var(--encre)]">{pt.nom}</h3>
                    <span className={`puce ${attente > 0 ? "puce-prep" : pt.contenu.echecs.length > 0 ? "puce-rouge" : pt.statut === "a_lire" ? "puce-encre" : "puce-grise"}`}>{attente > 0 ? `${attente} à valider` : pt.contenu.echecs.length > 0 ? `${pluriel(pt.contenu.echecs.length, "échec")}` : pt.statut === "a_lire" ? "À lire" : "Lu"}</span>
                  </div>
                  <dl className="mt-4 space-y-1.5 text-sm leading-relaxed">
                    <div><dt className="inline font-semibold text-[var(--encre)]">Dernier passage : </dt><dd className="inline text-[var(--texte-secondaire)]">{passage ? formaterDateHeureParis(passage) : sansMission ? "aucun passage planifié (décisions seulement)" : "aucun dans les dernières 24 heures"}</dd></div>
                    <div><dt className="inline font-semibold text-[var(--encre)]">Résultats : </dt><dd className="inline text-[var(--texte-secondaire)]">{pluriel(pt.contenu.realisations.length, "résultat")} · {pluriel(pt.contenu.echecs.length, "échec")}</dd></div>
                    <div><dt className="inline font-semibold text-[var(--encre)]">À valider : </dt><dd className="inline text-[var(--texte-secondaire)]">{attente > 0 ? pluriel(attente, "décision") : "rien"}</dd></div>
                  </dl>
                  <span className="lien-discret mt-4 inline-block text-sm group-hover:underline">Voir le point de l’équipe →</span>
                </Link>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{NOTE_FUSEAU} <Link href="/admin/equipes" className="lien-discret text-sm">Commandes des équipes →</Link></p>
      </section>

      {/* ── Jours précédents ───────────────────────────────────────────── */}
      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Jours précédents</h2>
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
      </section>

      {/* L'analyse IA n'apparaît que si le service est relié (audit C31) :
          annoncer une fonction inactive n'aide aucune décision. */}
      {Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim()) && (
        <section className="section-ecran"><BoutonBriefIA disponible /></section>
      )}
    </main>
  );
}
