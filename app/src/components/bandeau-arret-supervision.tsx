import Link from "next/link";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import { nomArret } from "@/lib/nom-arret-supervision";

export type ArretEnCours = { cle: string; motif: string | null; modifie_le: string | null };
export type RelaisEnCours = { fin: string };

/**
 * Le bandeau de la console quand un arrêt d'urgence ou un mode relais est en cours.
 *
 * Audit du 13/10/2026 (SA-04) : l'arrêt d'urgence et le mode relais n'étaient visibles que sur /admin/relais ; un arrêt
 * oublié ne laissait aucune trace ailleurs, et les écrans Équipes ou Brief continuaient d'annoncer un « prochain passage ».
 * Rien ne s'affiche quand tout est normal.
 */
export function BandeauArretSupervision({ arrets, relais }: { arrets: ArretEnCours[]; relais: RelaisEnCours[] }) {
  if (arrets.length === 0 && relais.length === 0) return null;
  return (
    <div role="status" className="mb-4 space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      {arrets.map((a) => (
        <p key={a.cle}>
          <strong>Arrêt d’urgence en cours : {nomArret(a.cle)}</strong>
          {a.modifie_le ? ` depuis le ${formaterDateHeureParis(a.modifie_le)}` : ""}
          {a.motif ? ` — « ${a.motif} »` : ""}. Les traitements concernés sont suspendus tant que l’arrêt n’est pas levé.
        </p>
      ))}
      {relais.map((r) => (
        <p key={r.fin}>
          <strong>Mode relais actif</strong> jusqu’au {formaterDateHeureParis(r.fin)} : seules les lectures autorisées dans une consigne s’exécutent.
        </p>
      ))}
      <p>
        <Link href="/admin/relais" className="lien-discret">Ouvrir « Relais et arrêts »</Link>
      </p>
    </div>
  );
}
