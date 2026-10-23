import { createClient } from "@/lib/supabase/server";
import { formaterDateHeureParis } from "@/lib/heure-paris";

type Inventaire = {
  lus: number; ecarts: number; incomplet: boolean; erreur: boolean;
  debut_le: string | null; complet_le: string | null; passage_le: string | null;
  dossiers: { souscription: string; client: string; motif: string; verifie_le: string }[];
};
export async function InventaireStripe() {
  const db = await createClient();
  // RPC réservée au superadmin. Aucun secret, montant ou contact n'est renvoyé.
  const { data, error } = await db.rpc("supervision_stripe_inventaire");
  return <ResultatInventaireStripe inventaire={error ? null : data as Inventaire | null} />;
}
export function ResultatInventaireStripe({ inventaire: i }: { inventaire: Inventaire | null }) {
  return <div className="mt-5 border-t pt-4" aria-labelledby="inventaire-stripe">
    <h3 id="inventaire-stripe" className="font-semibold">Souscriptions sans dossier Gerimmo</h3>
    {!i ? <p role="status">L’inventaire global est indisponible.</p> : !i.passage_le ?
      <p>Premier contrôle prévu au prochain passage de la tâche Abonnements.</p> : <>
      <p className="mt-2 text-sm">{i.lus} souscriptions parcourues dans le cycle courant · {i.ecarts} rattachements à vérifier.</p>
      {i.erreur && <p role="status" className="mt-2 text-sm text-amber-800 dark:text-amber-300">Le contrôle a été interrompu. Les écarts déjà trouvés sont conservés ; la suite sera reprise.</p>}
      {i.incomplet && <p className="mt-2 text-sm">Inventaire en cours : le prochain passage reprendra après la dernière page vérifiée.</p>}
      <p className="mt-1 text-xs text-muted-foreground">Dernier inventaire complet : {i.complet_le ? formaterDateHeureParis(i.complet_le) : "pas encore terminé"}.</p>
      <ul className="colonne-liste mt-2">{i.dossiers.map(d => <li key={d.souscription} className="rang block">
        <strong className="block break-all">{d.souscription}</strong>
        <span className="block text-sm">{d.motif === "client_absent" ? "Client Stripe absent de Gerimmo" : "Souscription non rattachée à l’abonnement du compte"}</span>
        <span className="block break-all text-xs text-muted-foreground">Client : {d.client}</span>
      </li>)}</ul>
      {i.ecarts > i.dossiers.length && <p className="text-sm">Les {i.dossiers.length} premiers écarts sont affichés sur {i.ecarts}.</p>}
    </>}
    <p className="mt-2 text-xs text-muted-foreground">Vérification en lecture seule chez Stripe. Aucun paiement, remboursement ou rattachement automatique.</p>
  </div>;
}
