import { ConsoleSection } from "@/components/console-section";
import Link from "next/link";
import { Suspense } from "react";
import { InventaireStripe } from "./inventaire-stripe";
import { formaterDateHeureParis } from "@/lib/heure-paris";
export type ControleStripe = { en_attente: number; a_reprendre: number; a_controler: number; ecarts: number;
  dossiers: { organization_id: string; name: string; stripe_controle_le: string; stripe_controle_ecarts: string[] }[] };
const LIBELLES: Record<string, string> = {
  souscription_absente: "Souscription introuvable chez Stripe", plusieurs_souscriptions: "Plusieurs souscriptions actives",
  souscription_non_suivie: "Souscription non rattachée au suivi", client_incoherent: "Rattachement client à vérifier",
  statut: "Statut différent", quantite: "Quantité différente", montant: "Montant différent", periodicite: "Périodicité différente",
  periode: "Échéance différente", annulation: "Résiliation à rapprocher", facture_non_reportee: "Facture payée non reportée",
  lecture_incomplete: "Lecture partielle à poursuivre", prestataire_indisponible: "Stripe indisponible lors du contrôle",
};
/**
 * Défaut d'écran E199 : la section était verte en toutes circonstances (ton écrit en dur), y compris Stripe non relié,
 * où « 0 écarts » ne vient d'aucun contrôle. Elle n'est verte que si Stripe est relié (ses deux clés, lues par
 * « Connexions des services ») et que rien n'attend d'examen.
 */
export function SuiviStripe({ controle, stripeRelie }: { controle: ControleStripe | null; stripeRelie: boolean }) {
  const aVerifier = !controle || !stripeRelie || controle.ecarts + controle.a_reprendre > 0;
  return <ConsoleSection id="controle-stripe" titre="Paiements Stripe" description="Réceptions, abonnements et écarts de facturation." icone="sante" ton={aVerifier ? "ambre" : "vert"} statut={!controle ? "Lecture indisponible" : !stripeRelie ? "Stripe non relié" : `${controle.ecarts} écarts · ${controle.a_reprendre} réceptions à examiner`}>
    <div className="entete-carte mb-3">
      <Link href="/admin" className="lien-texte">Abonnements et finances</Link></div>
    {!controle ? <p role="status">Le contrôle Stripe est indisponible. Aucun état à jour ne peut être confirmé.</p> : <>
      {!stripeRelie && <p role="status" className="mb-3 text-sm">Stripe n’est pas relié (voir « Connexions des services ») : ces compteurs ne viennent d’aucun contrôle.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        [controle.en_attente, "réceptions en attente"], [controle.a_reprendre, "réceptions à examiner"],
        [controle.a_controler, "dossiers à contrôler aujourd’hui"], [controle.ecarts, "dossiers avec écarts"],
      ].map(([n, libelle]) => <div key={libelle} className="rounded-[var(--rayon-bouton)] border border-[var(--filet)] p-3"><strong className="block text-2xl text-[var(--encre)]">{n}</strong><span className="text-sm text-muted-foreground">{libelle}</span></div>)}</div>
      <p className="my-3 text-sm text-muted-foreground">La tâche Abonnements reprend les réceptions interrompues et contrôle jusqu’à 20 dossiers par passage, en priorité les plus anciens. Les écarts sont signalés pour examen : aucun remboursement ni nouveau prélèvement n’est déclenché par ce contrôle.</p>
      {controle.dossiers.length > 0 && <ul className="colonne-liste">{controle.dossiers.map(d => <li key={d.organization_id} className="rang block">
        <strong className="block break-words">{d.name}</strong><p className="text-sm">{d.stripe_controle_ecarts.map(c => LIBELLES[c] ?? "Contrôle nécessaire").join(" · ")}</p>
        <time className="text-xs text-muted-foreground" dateTime={d.stripe_controle_le}>Vérifié le {formaterDateHeureParis(d.stripe_controle_le)}</time>
      </li>)}</ul>}
      {controle.ecarts > controle.dossiers.length && <p className="text-sm">Les 50 premiers dossiers sont affichés ; {controle.ecarts} présentent un écart au total.</p>}
    </>}
    <Suspense fallback={<p className="mt-5 text-sm" role="status">Chargement de l’inventaire Stripe…</p>}><InventaireStripe /></Suspense>
  </ConsoleSection>;
}
