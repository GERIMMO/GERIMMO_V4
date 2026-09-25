import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { faitsManquants } from "@/lib/editeur";
import { etatConfiguration, etatTaches, pointsBloquants } from "@/lib/sante-service";
import { dernieresTaches, type PasseConsignee } from "@/lib/tache";
import { EQUIPES, estEquipe, type Equipe } from "@/lib/missions";
import { jourDuPoint } from "@/lib/point-du-matin";
import { BoutonBriefIA } from "./bouton-ia";
import { OuvrirAlertes } from "./ouvrir-alertes";
import { DecisionMatin } from "./decision-matin";
import { PreparerPoint } from "./preparer-point";
import { dateLongue, lirePoints, type PointLu } from "./lecture";

export const metadata = { title: "Le point du matin — Gerimmo" };

type Signal = { titre: string; detail: string; href?: string; action: string; niveau: "urgent" | "attention" | "suivi" };

function nombre(resultat: { count: number | null; error: unknown }) {
  return resultat.error ? null : resultat.count ?? 0;
}
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// 25/09 : le point daté par équipe devient l'objet principal (E1, E4). Les
// compteurs instantanés restent en section « En ce moment ».
export default async function PageBrief({ searchParams }: { searchParams: Promise<{ jour?: string; equipe?: string }> }) {
  const p = await searchParams;
  const aujourdhui = jourDuPoint();
  const jour = p.jour && /^\d{4}-\d{2}-\d{2}$/.test(p.jour) ? p.jour : aujourdhui;
  const filtreEquipe: Equipe | undefined = p.equipe && estEquipe(p.equipe) ? p.equipe : undefined;
  const supabase = await createClient();
  const depuis = new Date(`${aujourdhui}T12:00:00Z`); depuis.setDate(depuis.getDate() - 14);
  const [duJour, historique, bugsN1, devis, comptes, taches, alertesCritiques] = await Promise.all([
    lirePoints(supabase, { jour, limite: 20 }),
    lirePoints(supabase, { depuis: depuis.toISOString().slice(0, 10), equipe: filtreEquipe, limite: 120 }),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").eq("gravite", "N1").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("organizations").select("id", { count: "exact", head: true }).in("status", ["active", "essai"]),
    supabase.from("tech_log").select("evenement, details, created_at").like("evenement", "tache_%").order("created_at", { ascending: false }).limit(200),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("statut", "ouverte").eq("criticite", "critique"),
  ]);

  const points = duJour.points ?? [];
  const decisionsEnAttente = points.flatMap((pt) => pt.decisions.filter((d) => d.statut === "en_attente"));
  const decideesCeJour = points.flatMap((pt) => pt.decisions.filter((d) => d.statut === "validee" || d.statut === "refusee")).length;
  const aLire = points.filter((pt) => pt.statut === "a_lire").length;
  const echecs = points.reduce((n, pt) => n + pt.contenu.echecs.length, 0);
  // Historique : les jours précédents, un rang par point ; le jour affiché est exclu.
  const jours = new Map<string, PointLu[]>();
  for (const pt of historique.points ?? []) { if (pt.jour === jour) continue; jours.set(pt.jour, [...(jours.get(pt.jour) ?? []), pt]); }

  // « En ce moment » : calcul instantané, comme avant le 25/09, réduit aux signaux
  // qui ne passent par aucune équipe (santé, alertes, bugs bloquants, devis).
  const configuration = etatConfiguration(process.env);
  const sante = pointsBloquants(configuration, taches.error ? [] : etatTaches(dernieresTaches((taches.data ?? []) as PasseConsignee[]), new Date()), faitsManquants().length);
  const valeurs = { bugsN1: nombre(bugsN1), devis: nombre(devis), comptes: nombre(comptes), alertesCritiques: nombre(alertesCritiques) };
  const signaux: Signal[] = [];
  if (valeurs.bugsN1 === null || valeurs.bugsN1 > 0) signaux.push({ titre: "Vérifier les incidents bloquants", detail: valeurs.bugsN1 === null ? "Le nombre de problèmes bloquants est indisponible." : `${pluriel(valeurs.bugsN1, "problème")} bloquant${valeurs.bugsN1 > 1 ? "s" : ""} à corriger.`, href: "/admin/retours?nature=bug", action: "Examiner les bugs", niveau: "urgent" });
  if (valeurs.alertesCritiques === null || valeurs.alertesCritiques > 0) signaux.push({ titre: "Examiner les alertes critiques", detail: valeurs.alertesCritiques === null ? "Le nombre d'alertes critiques est indisponible. Ouvrez la file pour vérifier." : `${pluriel(valeurs.alertesCritiques, "alerte")} critique${valeurs.alertesCritiques > 1 ? "s" : ""} ouverte${valeurs.alertesCritiques > 1 ? "s" : ""}, toutes organisations confondues.`, action: "Ouvrir les alertes", niveau: "urgent" });
  if (sante > 0 || taches.error) signaux.push({ titre: "Rétablir la santé du service", detail: taches.error ? "L'historique des tâches est indisponible." : `${pluriel(sante, "point")} de configuration ou de contrôle à traiter.`, href: "/admin/sante", action: "Voir les contrôles", niveau: "urgent" });
  if (valeurs.devis === null || valeurs.devis > 0) signaux.push({ titre: "Répondre aux demandes commerciales", detail: valeurs.devis === null ? "La file des devis est indisponible." : `${pluriel(valeurs.devis, "demande")} en attente.`, href: "/admin/devis", action: "Voir les demandes commerciales", niveau: "attention" });
  const lecturesEnEchec = [bugsN1, devis, comptes, taches, alertesCritiques].filter((r) => r.error).length;

  const maintenant = new Date();
  const situation = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(maintenant)}, ${new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Europe/Paris" }).format(maintenant)}`;
  const lienJour = (j: string, e?: Equipe) => `/admin/brief?${new URLSearchParams({ ...(j !== aujourdhui ? { jour: j } : {}), ...(e ? { equipe: e } : {}) }).toString()}`.replace(/\?$/, "");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Le point du matin</h1>
        <span className="mono-discret">{dateLongue(jour)}</span>
      </div>

      {/* Compteur des décisions en attente EN HAUT : c'est la seule raison d'être là le matin. */}
      <div className="tuiles mb-6">
        <div className={`tuile ${decisionsEnAttente.length > 0 ? "attention" : "ok"}`}><span className="lib">Décisions en attente</span><span className="val">{duJour.erreur ? "—" : decisionsEnAttente.length}</span><span className="sous">{decisionsEnAttente.length > 0 ? "Valider ou refuser ci-dessous" : "Rien à trancher"}</span></div>
        <div className={`tuile ${aLire > 0 ? "accent" : "neutre"}`}><span className="lib">Points à lire</span><span className="val">{duJour.erreur ? "—" : aLire}</span><span className="sous">sur {duJour.erreur ? "—" : points.length} équipe{points.length > 1 ? "s" : ""}</span></div>
        <div className={`tuile ${echecs > 0 ? "probleme" : "ok"}`}><span className="lib">Échecs de la nuit</span><span className="val">{duJour.erreur ? "—" : echecs}</span><span className="sous">{echecs > 0 ? "Détail dans les équipes" : "Aucun échec relevé"}</span></div>
        <div className="tuile neutre"><span className="lib">Décidées ce jour</span><span className="val">{duJour.erreur ? "—" : decideesCeJour}</span><span className="sous">validées ou refusées</span></div>
      </div>
      {duJour.erreur && <p role="alert" className="err mb-5">Le point du matin est indisponible. Aucun état ne peut être confirmé.</p>}
      {!duJour.erreur && points.length === 0 && (
        <div className="vide-guide mb-6">
          <p className="titre">{jour === aujourdhui ? "Le point de ce matin n’est pas encore préparé." : "Aucun point ce jour-là."}</p>
          <p className="explication">Il s’assemble automatiquement à la fin de chaque passage de nuit.{jour === aujourdhui ? " Vous pouvez le préparer maintenant à partir des données du moment." : ""}</p>
          {jour === aujourdhui && <div className="geste"><PreparerPoint /></div>}
        </div>
      )}

      {points.length > 0 && (
        <section className="section-ecran">
          <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Les équipes</h2>
          {/* Rang entier cliquable vers le détail (règle du 24/09). */}
          <div className="colonne-liste">
            {points.map((pt) => {
              const attente = pt.decisions.filter((d) => d.statut === "en_attente").length;
              return (
                <Link key={pt.id} href={`/admin/brief/${pt.equipe}${jour !== aujourdhui ? `?jour=${jour}` : ""}`} className="rang w-full">
                  <div className="min-w-0 flex-1">
                    <b>{pt.nom}</b>{pt.statut === "a_lire" && <span className="puce puce-prep ml-2">À lire</span>}<br />
                    <small>{pt.contenu.realisations.length > 0 ? pluriel(pt.contenu.realisations.length, "réalisation") : "aucun passage terminé"} · {pt.contenu.echecs.length > 0 ? pluriel(pt.contenu.echecs.length, "échec") : "aucun échec"} · {attente > 0 ? `${pluriel(attente, "décision")} en attente` : "rien à décider"}</small>
                  </div>
                  <span className="lien-discret text-sm">Détail →</span>
                </Link>
              );
            })}
          </div>
          {jour === aujourdhui && <div className="mt-3"><PreparerPoint libelle="Actualiser le point" /></div>}
        </section>
      )}

      {decisionsEnAttente.length > 0 && (
        <section className="section-ecran">
          <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">À décider</h2>
          {points.filter((pt) => pt.decisions.some((d) => d.statut === "en_attente")).map((pt) => (
            <div key={pt.id} className="mb-4">
              <p className="eyebrow mb-2 text-[var(--marque-sombre)]">Équipe {pt.nom}</p>
              <ul className="grid gap-3">{pt.decisions.filter((d) => d.statut === "en_attente").map((d) => <DecisionMatin key={d.id} decision={d} />)}</ul>
            </div>
          ))}
        </section>
      )}

      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Jours précédents</h2>
        <nav aria-label="Filtrer l’historique par équipe" className="mb-3 flex flex-wrap gap-2">
          <Link href={lienJour(jour)} className={`filtre${!filtreEquipe ? " actif" : ""}`}>Toutes les équipes</Link>
          {(Object.keys(EQUIPES) as Equipe[]).map((e) => <Link key={e} href={lienJour(jour, e)} className={`filtre${filtreEquipe === e ? " actif" : ""}`}>{EQUIPES[e].nom}</Link>)}
        </nav>
        {historique.erreur ? <p role="alert" className="err">L’historique est indisponible.</p> : jours.size === 0 ? <p className="text-sm text-muted-foreground">Aucun autre point sur les quatorze derniers jours{filtreEquipe ? " pour cette équipe" : ""}.</p> : (
          <div className="colonne-liste">
            {[...jours.entries()].map(([j, pts]) => pts.map((pt) => {
              const attente = pt.decisions.filter((d) => d.statut === "en_attente").length;
              return (
                <Link key={pt.id} href={`/admin/brief/${pt.equipe}?jour=${j}`} className="rang w-full">
                  <div className="min-w-0 flex-1"><b>{dateLongue(j)} · {pt.nom}</b><br /><small>{pluriel(pt.contenu.realisations.length, "réalisation")} · {pluriel(pt.contenu.echecs.length, "échec")} · {pluriel(pt.decisions.length, "décision")}{attente > 0 ? ` (${attente} en attente)` : ""} · {pt.statut === "lu" ? "lu" : "non lu"}</small></div>
                  <span className="lien-discret text-sm">Détail →</span>
                </Link>
              );
            }))}
          </div>
        )}
      </section>

      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">En ce moment</h2>
        <p className="mb-3 text-sm text-muted-foreground">Situation au {situation} — calcul instantané, hors du point daté.{lecturesEnEchec > 0 ? ` ${pluriel(lecturesEnEchec, "source")} indisponible${lecturesEnEchec > 1 ? "s" : ""}.` : ""}{valeurs.comptes !== null ? ` ${pluriel(valeurs.comptes, "organisation")} active${valeurs.comptes > 1 ? "s" : ""} ou en essai.` : ""}</p>
        {signaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun signal ouvert. Consultez <Link className="text-[var(--bleu)]" href="/admin/sante">la santé du service</Link> si besoin.</p> : (
          <div className="grid gap-3">
            {signaux.map((signal) => {
              const classe = "group flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-4 hover:bg-[var(--survol)]";
              const contenu = <><div className="min-w-0"><span className="mono-discret">{signal.niveau === "urgent" ? "service" : "opérations"}</span><h3 className="mt-1 font-semibold text-[var(--encre)]">{signal.titre}</h3><p className="mt-1 text-sm text-[var(--texte-secondaire)]">{signal.detail}</p></div><span className="lien-discret text-sm group-hover:underline">{signal.action} →</span></>;
              return signal.href ? <Link key={signal.titre} href={signal.href} className={classe}>{contenu}</Link> : <OuvrirAlertes key={signal.titre} className={classe}>{contenu}</OuvrirAlertes>;
            })}
          </div>
        )}
        <div className="mt-4"><BoutonBriefIA disponible={Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim())} /></div>
      </section>
    </main>
  );
}
