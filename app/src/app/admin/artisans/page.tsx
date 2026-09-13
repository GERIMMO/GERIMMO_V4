import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { METIERS, PIECES_ARTISAN } from "@/app/artisan/libelles";
import { DecisionArtisan } from "./decision-artisan";
import { RetourDecisionsArtisan } from "./retour-decisions";

export const metadata = { title: "Inscriptions artisan — Gerimmo" };

type Inscription = { artisan_id: string; raison_sociale: string; siret: string; siret_etat: string; telephone: string | null; email: string | null; metiers: string[] | null; nb_pieces: number; decennale_valide: boolean; rc_pro_deposee: boolean; inscrit_le: string; purge_prevue_le: string | null };
type Piece = { id: string; artisan_id: string; type: string; expire_le: string | null };
const date = (valeur: string) => new Date(valeur).toLocaleDateString("fr-FR", { timeZone: "UTC" });
const ETATS_SIRET: Record<string, string> = { verifie: "Vérifié", non_verifie: "Non vérifié", invalide: "Invalide" };

export default async function InscriptionsArtisan() {
  const supabase = await createClient();
  const { data: autorise, error: erreurAcces } = await supabase.rpc("is_super_admin");
  if (erreurAcces || autorise !== true) return <main className="mx-auto max-w-4xl p-7"><h1>Accès réservé à la supervision</h1></main>;
  const [file, decisions] = await Promise.all([
    supabase.rpc("artisans_a_valider"),
    supabase.from("artisans").select("id, raison_sociale, statut_plateforme, statut_motif, statut_decide_le")
      .in("statut_plateforme", ["valide", "refuse"]).order("statut_decide_le", { ascending: false, nullsFirst: false }).limit(20),
  ]);
  const inscriptions = (file.data ?? []) as Inscription[];
  const pieces = inscriptions.length > 0
    ? await supabase.from("artisan_pieces").select("id, artisan_id, type, expire_le").in("artisan_id", inscriptions.map((a) => a.artisan_id)).is("retiree_le", null)
    : { data: [], error: null };

  return <RetourDecisionsArtisan><main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
    <div className="entete-page mb-6"><div><h1>Inscriptions artisan</h1><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Vérifiez l’entreprise, relisez les justificatifs, puis prenez une décision motivée.</p></div><span className="mono-discret">{file.error ? "File indisponible" : `${inscriptions.length} en attente`}</span></div>
    <p className="mb-5 border-l-2 border-[var(--or)] pl-3 text-sm text-[var(--texte-secondaire)]">La validation appartient à Gerimmo. Elle ne modifie ni la visibilité choisie par l’artisan, ni les contrôles d’assurance appliqués à chaque intervention.</p>
    {file.error ? <p role="alert" className="vide">Impossible de charger les inscriptions. Rechargez pour réessayer.</p> : inscriptions.length === 0 ? <div className="vide-guide"><p className="titre">Aucune inscription en attente</p><p className="explication">Les nouvelles inscriptions apparaîtront ici pour examen.</p></div> : <div className="space-y-5">{inscriptions.map((artisan) => <section key={artisan.artisan_id} className="border border-[var(--filet)] bg-[var(--ivoire)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-heading text-xl text-[var(--encre)]">{artisan.raison_sociale}</h2><p className="mt-1 text-sm">{(artisan.metiers ?? []).map((m) => METIERS[m] ?? m).join(" · ") || "Métier non renseigné"}</p></div><span className="puce puce-prep">Depuis le {date(artisan.inscrit_le)}</span></div>
      <dl className="my-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="libelle-champ">SIRET</dt><dd>{artisan.siret} · {ETATS_SIRET[artisan.siret_etat] ?? artisan.siret_etat}</dd></div><div><dt className="libelle-champ">Contact</dt><dd>{artisan.email || "Email non renseigné"}{artisan.telephone && ` · ${artisan.telephone}`}</dd></div></dl>
      {artisan.siret_etat !== "verifie" && <div className="mb-4 border border-[var(--filet)] p-3"><DecisionArtisan artisanId={artisan.artisan_id} operation="verifier_siret" /></div>}
      <details className="mb-4 border border-[var(--filet)] p-3" open><summary className="cursor-pointer font-medium">Justificatifs · {artisan.nb_pieces} pièce{artisan.nb_pieces > 1 ? "s" : ""}</summary><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Décennale {artisan.decennale_valide ? "en cours de validité" : "absente ou échue"} · RC pro {artisan.rc_pro_deposee ? "déposée, non échue" : "absente ou échue"}. Les dates ne remplacent pas la relecture du document.</p>
        {pieces.error ? <p role="alert" className="mt-2 text-sm text-[var(--destructive)]">Les justificatifs sont indisponibles. Réessayez avant de décider.</p> : <ul className="mt-3 space-y-2">{((pieces.data ?? []) as Piece[]).filter((p) => p.artisan_id === artisan.artisan_id).map((p) => <li key={p.id} className="text-sm"><Link href={`/admin/artisans/pieces/${p.id}/fichier`} target="_blank" rel="noopener noreferrer" className="lien-discret">Ouvrir {PIECES_ARTISAN[p.type] ?? p.type}</Link><span className="ml-2 text-[var(--texte-secondaire)]">{p.expire_le ? `Échéance : ${date(p.expire_le)}` : "Sans échéance"}</span></li>)}</ul>}
      </details>
      {pieces.error ? null : <DecisionArtisan artisanId={artisan.artisan_id} operation="validation" siretVerifie={artisan.siret_etat === "verifie"} />}
      <details className="mt-4 border-t border-[var(--filet)] pt-3"><summary className="cursor-pointer text-sm">Refuser cette inscription</summary><div className="mt-3"><DecisionArtisan artisanId={artisan.artisan_id} operation="refus" /></div></details>
      {artisan.purge_prevue_le && <p className="mt-3 text-xs text-[var(--texte-secondaire)]">Sans suite, échéance de conservation prévue le {date(artisan.purge_prevue_le)}.</p>}
    </section>)}</div>}
    <details className="mt-7 border border-[var(--filet)] bg-[var(--ivoire)] p-4"><summary className="cursor-pointer font-heading text-lg">Décisions récentes</summary><p className="mt-2 text-xs text-[var(--texte-secondaire)]">Les 20 inscriptions validées ou refusées les plus récemment traitées. Un refus peut être réexaminé.</p>{decisions.error ? <p role="alert">Historique indisponible.</p> : <ul className="mt-3 space-y-4">{(decisions.data ?? []).map((a) => <li key={a.id} className="border-t border-[var(--filet)] pt-3 text-sm"><p><b>{a.raison_sociale}</b> · {a.statut_plateforme === "valide" ? "Validée" : "Refusée"}{a.statut_decide_le && ` le ${date(a.statut_decide_le)}`}</p>{a.statut_motif && <p className="mt-1 whitespace-pre-wrap text-[var(--texte-secondaire)]">{a.statut_motif}</p>}{a.statut_plateforme === "refuse" && <div className="mt-2"><DecisionArtisan artisanId={a.id} operation="remise_en_attente" /></div>}</li>)}</ul>}</details>
  </main></RetourDecisionsArtisan>;
}
