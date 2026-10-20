import Link from "next/link";
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
export function SuiviStripe({ controle }: { controle: ControleStripe | null }) {
  return <section className="section-ecran" aria-labelledby="controle-stripe">
    <div className="entete-carte mb-3"><h2 id="controle-stripe" className="font-heading text-[length:var(--pas-section)]">Suivi des paiements Stripe</h2>
      <Link href="/admin/clients" className="lien-texte">Abonnements et finances</Link></div>
    {!controle ? <p role="status">Le contrôle Stripe est indisponible. Aucun état à jour ne peut être confirmé.</p> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        [controle.en_attente, "réceptions en attente"], [controle.a_reprendre, "réceptions à examiner"],
        [controle.a_controler, "dossiers à contrôler aujourd’hui"], [controle.ecarts, "dossiers avec écarts"],
      ].map(([n, libelle]) => <div key={libelle} className="rounded-xl border p-3"><strong className="block text-2xl text-[var(--encre)]">{n}</strong><span className="text-sm text-muted-foreground">{libelle}</span></div>)}</div>
      <p className="my-3 text-sm text-muted-foreground">La tâche Abonnements reprend les réceptions interrompues et contrôle jusqu’à 20 dossiers par passage, en priorité les plus anciens. Les écarts sont signalés pour examen : aucun remboursement ni nouveau prélèvement n’est déclenché par ce contrôle.</p>
      {controle.dossiers.length > 0 && <ul className="colonne-liste">{controle.dossiers.map(d => <li key={d.organization_id} className="rang block">
        <strong className="block break-words">{d.name}</strong><p className="text-sm">{d.stripe_controle_ecarts.map(c => LIBELLES[c] ?? "Contrôle nécessaire").join(" · ")}</p>
        <time className="text-xs text-muted-foreground" dateTime={d.stripe_controle_le}>Vérifié le {formaterDateHeureParis(d.stripe_controle_le)}</time>
      </li>)}</ul>}
      {controle.ecarts > controle.dossiers.length && <p className="text-sm">Les 50 premiers dossiers sont affichés ; {controle.ecarts} présentent un écart au total.</p>}
    </>}
  </section>;
}
