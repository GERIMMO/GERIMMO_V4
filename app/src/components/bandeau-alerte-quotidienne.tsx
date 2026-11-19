import Link from "next/link";
import { messageAlerteQuotidienne, type SuiviAlerteQuotidienne } from "@/lib/relais-alerte-suivi";

/**
 * Le signal de secours de l'alerte e-mail quotidienne (incident du 12 au 19/11/2026 : huit jours d'échec que seul
 * l'e-mail aurait pu dire). Affiché sur l'accueil de la supervision et sur « Santé et connexions » quand l'alerte
 * attendue n'est pas confirmée partie. Rien ne s'affiche quand elle est partie ou pas encore attendue.
 * Même présentation que le bandeau d'arrêt d'urgence (`bandeau-arret-supervision.tsx`).
 */
export function BandeauAlerteQuotidienne({ suivi }: { suivi: SuiviAlerteQuotidienne }) {
  const message = messageAlerteQuotidienne(suivi);
  if (!message) return null;
  return (
    <div role="alert" id="alerte-quotidienne" data-etat={suivi.etat} className="mb-4 space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p><strong>{message.titre}</strong></p>
      {message.details.map((d) => <p key={d}>{d}</p>)}
      <p>
        <Link href="/admin/relais#alerte-email" className="lien-discret">Voir le détail dans « Vacances et relais », alerte e-mail du relais →</Link>
      </p>
    </div>
  );
}
