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

type Signal = { titre: string; detail: string; href?: string; action: string };

function nombre(resultat: { count: number | null; error: unknown }) {
  return resultat.error ? null : resultat.count ?? 0;
}
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
  const [duJour, historique, decisions, bugsN1, devis, contestations, alertesCritiques] = await Promise.all([
    lirePoints(supabase, { jour, limite: 20 }),
    lirePoints(supabase, { depuis: depuis.toISOString().slice(0, 10), equipe: filtreEquipe, limite: 120 }),
    // Le même calcul que la barre haute et l'accueil (lib/decisions-attendues.ts).
    chargerDecisionsAttendues(supabase, process.env, faitsManquants().length),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").eq("gravite", "N1").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "contestation").neq("etat", "resolu"),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("statut", "ouverte").eq("criticite", "critique"),
  ]);

  const points = duJour.points ?? [];
  const decisionsEnAttente = points.flatMap((pt) => pt.decisions.filter((d) => d.statut === "en_attente"));
  const estAujourdhui = jour === aujourdhui;
  // Historique : les jours précédents, un rang par point ; le jour affiché est exclu.
  const jours = new Map<string, PointLu[]>();
  for (const pt of historique.points ?? []) { if (pt.jour === jour) continue; jours.set(pt.jour, [...(jours.get(pt.jour) ?? []), pt]); }

  // Les signaux qui ne passent par aucune équipe, chacun avec sa commande.
  const valeurs = { bugsN1: nombre(bugsN1), devis: nombre(devis), contestations: nombre(contestations), alertesCritiques: nombre(alertesCritiques) };
  const signaux: Signal[] = [];
  if (decisions.santeBloquants > 0 || decisions.tachesIllisibles) signaux.push({ titre: "Rétablir la santé du service", detail: decisions.tachesIllisibles ? "L’historique des tâches est indisponible : l’état du travail automatique est inconnu." : `${pluriel(decisions.santeBloquants, "point")} bloque${decisions.santeBloquants > 1 ? "nt" : ""} : chaque ligne porte la commande qui le règle.`, href: "/admin/sante", action: "Ouvrir la santé" });
  if (!decisions.pointPrepare && (decisions.artisans === null || decisions.artisans > 0)) signaux.push({ titre: "Valider les inscriptions d’artisans", detail: decisions.artisans === null ? "Le nombre d’inscriptions en attente est indisponible." : `${pluriel(decisions.artisans, "inscription")} à examiner ; le point du matin les portera une fois préparé.`, href: "/admin/artisans", action: "Examiner" });
  if (valeurs.alertesCritiques === null || valeurs.alertesCritiques > 0) signaux.push({ titre: "Examiner les alertes critiques", detail: valeurs.alertesCritiques === null ? "Le nombre d’alertes critiques est indisponible." : `${pluriel(valeurs.alertesCritiques, "alerte")} critique${valeurs.alertesCritiques > 1 ? "s" : ""} ouverte${valeurs.alertesCritiques > 1 ? "s" : ""}, toutes organisations confondues.`, action: "Ouvrir les alertes" });
  if (valeurs.bugsN1 === null || valeurs.bugsN1 > 0) signaux.push({ titre: "Vérifier les problèmes bloquants", detail: valeurs.bugsN1 === null ? "Le nombre de problèmes bloquants est indisponible." : `${pluriel(valeurs.bugsN1, "problème")} bloquant${valeurs.bugsN1 > 1 ? "s" : ""} signalé${valeurs.bugsN1 > 1 ? "s" : ""} par des utilisateurs.`, href: "/admin/retours?nature=bug", action: "Examiner" });
  if (valeurs.contestations === null || valeurs.contestations > 0) signaux.push({ titre: "Répondre aux contestations d’artisans", detail: valeurs.contestations === null ? "Le nombre de contestations est indisponible." : `${pluriel(valeurs.contestations, "contestation")} de note en cours.`, href: "/admin/retours?nature=contestation", action: "Examiner" });
  if (valeurs.devis === null || valeurs.devis > 0) signaux.push({ titre: "Répondre aux demandes commerciales", detail: valeurs.devis === null ? "La file des demandes est indisponible." : `${pluriel(valeurs.devis, "demande")} d’agence en attente d’une réponse.`, href: "/admin/devis", action: "Répondre" });
  const lecturesEnEchec = [bugsN1, devis, contestations, alertesCritiques].filter((r) => r.error).length + decisions.indisponibles.length;
  const rienADecider = decisionsEnAttente.length === 0 && signaux.length === 0;

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
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 text-sm text-[var(--encre)]"><b>Rien n’attend votre décision.</b> Les équipes continuent le travail autorisé.</div>
        ) : (
          <div className="grid gap-4">
            {points.filter((pt) => pt.decisions.some((d) => d.statut === "en_attente")).map((pt) => (
              <div key={pt.id}>
                <p className="eyebrow mb-2 text-[var(--marque-sombre)]">Équipe {pt.nom}</p>
                <ul className="grid gap-3">{pt.decisions.filter((d) => d.statut === "en_attente").map((d) => <DecisionMatin key={d.id} decision={d} />)}</ul>
              </div>
            ))}
            {signaux.length > 0 && (
              <div className="grid gap-2">
                {decisionsEnAttente.length > 0 && <p className="eyebrow text-[var(--marque-sombre)]">Hors équipes</p>}
                {signaux.map((signal) => {
                  const classe = "group flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-4 hover:bg-[var(--survol)]";
                  const contenu = <><div className="min-w-0"><h3 className="font-semibold text-[var(--encre)]">{signal.titre}</h3><p className="mt-1 text-sm text-[var(--texte-secondaire)]">{signal.detail}</p></div><span className="btn-secondaire shrink-0">{signal.action} →</span></>;
                  return signal.href ? <Link key={signal.titre} href={signal.href} className={classe}>{contenu}</Link> : <OuvrirAlertes key={signal.titre} className={classe}>{contenu}</OuvrirAlertes>;
                })}
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
          <div className="grid gap-3 md:grid-cols-2">
            {points.map((pt) => {
              const attente = pt.decisions.filter((d) => d.statut === "en_attente").length;
              const passage = dernierPassage(pt);
              const sansMission = missionsDeLEquipe(pt.equipe).length === 0;
              return (
                <Link key={pt.id} href={`/admin/brief/${pt.equipe}${estAujourdhui ? "" : `?jour=${jour}`}`} className="group rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 transition-colors hover:bg-[var(--survol)]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading text-[16px] text-[var(--encre)]">{pt.nom}</h3>
                    <span className={`puce ${attente > 0 ? "puce-prep" : pt.contenu.echecs.length > 0 ? "puce-rouge" : pt.statut === "a_lire" ? "puce-encre" : "puce-grise"}`}>{attente > 0 ? `${attente} à valider` : pt.contenu.echecs.length > 0 ? `${pluriel(pt.contenu.echecs.length, "échec")}` : pt.statut === "a_lire" ? "À lire" : "Lu"}</span>
                  </div>
                  <dl className="mt-3 space-y-1 text-[12.5px] leading-relaxed">
                    <div><dt className="inline font-semibold text-[var(--encre)]">Dernier passage : </dt><dd className="inline text-[var(--texte-secondaire)]">{passage ? formaterDateHeureParis(passage) : sansMission ? "aucun passage planifié (décisions seulement)" : "aucun dans les dernières 24 heures"}</dd></div>
                    <div><dt className="inline font-semibold text-[var(--encre)]">Résultats : </dt><dd className="inline text-[var(--texte-secondaire)]">{pluriel(pt.contenu.realisations.length, "résultat")} · {pluriel(pt.contenu.echecs.length, "échec")}</dd></div>
                    <div><dt className="inline font-semibold text-[var(--encre)]">À valider : </dt><dd className="inline text-[var(--texte-secondaire)]">{attente > 0 ? pluriel(attente, "décision") : "rien"}</dd></div>
                  </dl>
                  <span className="lien-discret mt-3 inline-block text-[12.5px] group-hover:underline">Voir le point de l’équipe →</span>
                </Link>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{NOTE_FUSEAU} <Link href="/admin/equipes" className="lien-discret">Commandes des équipes →</Link></p>
      </section>

      {/* ── Jours précédents ───────────────────────────────────────────── */}
      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Jours précédents</h2>
        {jours.size > 0 || filtreEquipe ? (
          <nav aria-label="Filtrer l’historique par équipe" className="mb-3 flex flex-wrap gap-2">
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
