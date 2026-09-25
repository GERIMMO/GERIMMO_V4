import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EQUIPES, MISSIONS, estEquipe, missionsDeLEquipe } from "@/lib/missions";
import { jourDuPoint } from "@/lib/point-du-matin";
import { DecisionMatin } from "../decision-matin";
import { MarquerLu } from "../marquer-lu";
import { PreparerPoint } from "../preparer-point";
import { dateLongue, heureParis, lirePoints } from "../lecture";

export const metadata = { title: "Le point du matin — détail — Gerimmo" };

const ETATS: Record<string, string> = { reussi: "Terminé", a_reprendre: "À vérifier", interrompu: "Interrompu", en_cours: "En cours" };

// 25/09 : le détail du point d'une équipe. L'ouvrir le marque « lu ».
export default async function PageDetailPoint({ params, searchParams }: { params: Promise<{ equipe: string }>; searchParams: Promise<{ jour?: string }> }) {
  const { equipe } = await params;
  if (!estEquipe(equipe)) notFound();
  const { jour: demande } = await searchParams;
  const jour = demande && /^\d{4}-\d{2}-\d{2}$/.test(demande) ? demande : jourDuPoint();
  const db = await createClient();
  const { points, erreur } = await lirePoints(db, { jour, equipe, limite: 1 });
  const point = points?.[0];
  const enAttente = point?.decisions.filter((d) => d.statut === "en_attente").length ?? 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <p className="mb-3 text-sm"><Link href={`/admin/brief${jour === jourDuPoint() ? "" : `?jour=${jour}`}`} className="lien-discret text-sm">← Aujourd’hui</Link></p>
      <div className="entete-page mb-6">
        <h1>Équipe {EQUIPES[equipe].nom}</h1>
        <span className="mono-discret">{dateLongue(jour)}</span>
      </div>
      {erreur && <p role="alert" className="err mb-5">Le point est indisponible. Aucun état ne peut être confirmé.</p>}
      {!erreur && !point && (
        <div className="vide-guide">
          <p className="titre">Aucun point pour cette équipe ce jour-là.</p>
          <p className="explication">Le point s’assemble à la fin de chaque passage de nuit. Vous pouvez le préparer maintenant à partir des données du moment.</p>
          {jour === jourDuPoint() && <div className="geste"><PreparerPoint /></div>}
        </div>
      )}
      {point && (
        <>
          <MarquerLu id={point.id} />
          <p className="mesure-lecture mb-6 text-sm text-muted-foreground">Point préparé à {heureParis(point.genere_le)}{point.lu_le ? `, lu à ${heureParis(point.lu_le)}` : ""}. {enAttente > 0 ? `${enAttente} décision${enAttente > 1 ? "s" : ""} en attente.` : "Aucune décision en attente."}</p>

          <section className="section-ecran">
            <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Décisions soumises</h2>
            {point.decisions.length === 0
              ? <p className="text-sm text-muted-foreground">Cette équipe ne soumet aucune décision aujourd’hui.</p>
              : <ul className="grid gap-3">{point.decisions.map((d) => <DecisionMatin key={d.id} decision={d} />)}</ul>}
          </section>

          <section className="section-ecran">
            <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Ce que l’équipe a fait</h2>
            {point.contenu.realisations.length === 0
              ? <p className="text-sm text-muted-foreground">{missionsDeLEquipe(equipe).length === 0 ? "Cette équipe n’a pas de passage planifié : elle prépare des décisions à partir des files existantes." : "Aucun passage terminé dans les dernières 24 heures."}</p>
              : <ul className="grid gap-2 text-sm">{point.contenu.realisations.map((r) => <li key={r} className="rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-4 py-3">{r}</li>)}</ul>}
            {point.contenu.sans_passage.length > 0 && <p className="mt-3 text-sm text-[var(--texte-secondaire)]">Sans passage dans la fenêtre : {point.contenu.sans_passage.join(", ")}.</p>}
          </section>

          <section className="section-ecran">
            <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Ce qui a échoué</h2>
            {point.contenu.echecs.length === 0
              ? <p className="text-sm text-muted-foreground">Aucun échec relevé.</p>
              : <ul className="grid gap-2 text-sm">{point.contenu.echecs.map((e) => <li key={e} className="rounded-lg border border-[var(--destructive)] bg-[var(--destructive-soft)] px-4 py-3 text-[var(--destructive-soft-foreground)]">{e}</li>)}</ul>}
          </section>

          {point.contenu.passages.length > 0 && (
            <section className="section-ecran">
              <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Passages</h2>
              <div className="colonne-liste">
                {point.contenu.passages.map((p) => (
                  <Link key={`${p.mission}-${p.debut}`} href={MISSIONS[p.mission].lien} className="rang w-full">
                    <div className="min-w-0 flex-1"><b>{p.nom}</b><br /><small>{heureParis(p.debut)}{p.fin ? ` → ${heureParis(p.fin)}` : ""} · {ETATS[p.etat] ?? p.etat} · {p.bilan}</small></div>
                    <span className="lien-discret text-sm">Dossiers →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <div className="mt-6 flex flex-wrap gap-3"><Link href={EQUIPES[equipe].page} className="btn-secondaire">Ouvrir l’écran de l’équipe</Link><Link href="/admin/equipes" className="btn-secondaire">Commandes des équipes</Link></div>
        </>
      )}
    </main>
  );
}
