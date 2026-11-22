import { ArrowLeft, Info, LockKeyhole, Scale, Star } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import shared from "../../../repertoires.module.css";
import styles from "../../../relation-clients.module.css";
import { TitreEcran } from "@/components/titre-ecran";
import { formaterDateHeureParis, formaterDateParis } from "@/lib/heure-paris";
import { createClient } from "@/lib/supabase/server";
import { RetraitEvaluation } from "./retrait-evaluation";

export const metadata = { title: "Évaluations contestées" };

// Audit palier 1 (P1-07). Le référentiel (module 11, §11.4) : l'artisan conteste auprès du super admin, pas de
// l'organisation qui l'a noté (RM-11.4.4) ; pour trancher, la supervision lit le détail des évaluations —
// commentaires compris — DANS CE SEUL CADRE (RM-11.4.5), et cet accès est tracé (RM-11.4.6). Cette page n'existe
// donc que derrière une contestation : la lecture passe par `evaluations_contestation`, qui écrit la ligne du journal.
type Evaluation = {
  evaluation_id: string; deposee_le: string; source: "gerant" | "locataire";
  note_globale: number; note_qualite: number | null; note_delai: number | null; note_prix: number | null;
  commentaire: string | null; organisation: string; incident_numero: string;
  retiree_le: string | null; retrait_motif: string | null;
};
const SOURCES: Record<Evaluation["source"], string> = { gerant: "Gestionnaire", locataire: "Locataire" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageEvaluationsContestees({ params }: { params: Promise<{ retourId: string }> }) {
  const { retourId } = await params;
  const c = await createClient();
  const { data: sa, error: acces } = await c.rpc("is_super_admin");
  if (acces || sa !== true) redirect("/espaces");
  if (!UUID.test(retourId)) notFound();
  const { data: retour, error: lecture } = await c.from("retours_utilisateurs")
    .select("id, nature, titre, description, cree_le, artisan_id").eq("id", retourId).maybeSingle();
  if (!lecture && (!retour || retour.nature !== "contestation" || !retour.artisan_id)) notFound();
  const retourFile = `/admin/retours?nature=contestation#retour-${retourId}`;
  if (lecture || !retour) return <main className={shared.page}>
    <header className={shared.header}><div><TitreEcran rubrique="messages">Évaluations contestées</TitreEcran></div></header>
    <p role="alert" className="err">La contestation n’a pas pu être lue. <Link href={retourFile} className="font-semibold underline">Revenir aux contestations</Link></p>
  </main>;

  const [artisan, detail] = await Promise.all([
    c.from("artisans").select("raison_sociale").eq("id", retour.artisan_id).maybeSingle(),
    c.rpc("evaluations_contestation", { p_retour: retourId }),
  ]);
  const evaluations = (detail.data ?? []) as Evaluation[];
  const comptees = evaluations.filter(e => !e.retiree_le).length;
  const retirees = evaluations.length - comptees;
  const nom = artisan.data?.raison_sociale ?? "Artisan";

  return <main className={shared.page}>
    <header className={shared.header}>
      <div>
        <TitreEcran rubrique="messages">Évaluations contestées</TitreEcran>
        <p className={shared.subtitle}>{nom} · contestation du {formaterDateParis(retour.cree_le)}</p>
      </div>
      <Link href={retourFile} className="btn-secondaire"><ArrowLeft size={16} aria-hidden="true" />Revenir à la contestation</Link>
    </header>

    <section className={styles.panel} aria-labelledby="contestation-titre">
      <div className={styles.panelHeading}><div><h2 id="contestation-titre">Ce que conteste l’artisan</h2><p>Sa demande, telle qu’il l’a écrite.</p></div><Scale size={20} aria-hidden="true" /></div>
      <div className={styles.requestContent}><p><strong>{retour.titre}</strong></p><p className={styles.description}>{retour.description}</p></div>
    </section>

    <section className={`${styles.panel} mt-5`} aria-labelledby="evaluations-titre">
      <div className={styles.panelHeading}>
        <div><h2 id="evaluations-titre">Ses évaluations</h2><p>{detail.error ? "Lecture indisponible." : `${comptees} comptée${comptees > 1 ? "s" : ""} dans sa moyenne${retirees ? `, ${retirees} retirée${retirees > 1 ? "s" : ""}` : ""}. De la plus récente à la plus ancienne.`}</p></div>
        <Star size={20} aria-hidden="true" />
      </div>
      {detail.error
        ? <p role="alert" className={styles.notice}>Les évaluations n’ont pas pu être lues. Rechargez la page avant de décider.</p>
        : evaluations.length === 0
          ? <p className={styles.pastEmpty}>Cet artisan n’a reçu aucune évaluation.</p>
          : <ul className={styles.pastDecisions}>{evaluations.map(e => <li key={e.evaluation_id} data-evaluation={e.retiree_le ? "retiree" : "comptee"}>
            <div className={styles.pastDecisionHeading}>
              <strong>{e.note_globale}/5 · {SOURCES[e.source]} · {e.organisation}<time dateTime={e.deposee_le}>Déposée le {formaterDateHeureParis(e.deposee_le)} · dossier {e.incident_numero}</time></strong>
              <span className={shared.badge} data-tone={e.retiree_le ? "gris" : "vert"}>{e.retiree_le ? "Retirée" : "Comptée"}</span>
            </div>
            {e.source === "gerant" && <p>Qualité {e.note_qualite}/5 · Délai {e.note_delai}/5 · Prix {e.note_prix}/5</p>}
            <p>{e.commentaire ? `Commentaire : « ${e.commentaire} »` : "Sans commentaire."}</p>
            {e.retiree_le
              ? <p>Retirée le {formaterDateHeureParis(e.retiree_le)}. Motif : « {e.retrait_motif} »</p>
              : <details className={styles.refusal}><summary>Retirer cette évaluation</summary><div><RetraitEvaluation retourId={retourId} evaluationId={e.evaluation_id} /></div></details>}
          </li>)}</ul>}
    </section>

    <p className={styles.context}><LockKeyhole size={15} aria-hidden="true" /><span>Cette consultation est enregistrée au journal : les commentaires sont privés à l’organisation qui les a écrits, et la supervision n’y accède que pour trancher une contestation.</span></p>
    <p className={styles.context}><Info size={15} aria-hidden="true" /><span>Retirer une évaluation recalcule la moyenne de l’artisan ; il le lit dans le suivi de sa contestation, et l’organisation reçoit une alerte. Pour maintenir une note, répondez à la contestation en expliquant pourquoi : aucune évaluation n’est modifiée.</span></p>
  </main>;
}
