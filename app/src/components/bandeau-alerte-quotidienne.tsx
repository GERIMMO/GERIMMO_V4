import Link from "next/link";
import { messageAlerteQuotidienne, type SuiviAlerteQuotidienne } from "@/lib/relais-alerte-suivi";

/**
 * Le signal de secours de l'alerte e-mail quotidienne (incident du 12 au 19/11/2026 : huit jours d'échec que seul
 * l'e-mail aurait pu dire). Affiché sur l'accueil de la supervision et sur « Santé et connexions » quand l'alerte
 * attendue n'est pas confirmée partie. Rien ne s'affiche quand elle est partie ou pas encore attendue.
 * Même présentation que le bandeau d'arrêt d'urgence (`bandeau-arret-supervision.tsx`). Région nommée par son titre,
 * pas `role="alert"` : le bandeau est là dès le chargement (rien à annoncer en direct), et les rôles `alert` et
 * `status` de ces pages portent le résultat des gestes (préparer les faits, filtrer, enregistrer).
 */
export function BandeauAlerteQuotidienne({ suivi }: { suivi: SuiviAlerteQuotidienne }) {
  const message = messageAlerteQuotidienne(suivi);
  if (!message) return null;
  return (
    <section id="alerte-quotidienne" aria-labelledby="alerte-quotidienne-titre" data-etat={suivi.etat} className="mb-4 space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p><strong id="alerte-quotidienne-titre">{message.titre}</strong></p>
      {message.details.map((d) => <p key={d}>{d}</p>)}
      <p>
        <Link href="/admin/relais#alerte-email" className="lien-discret">Voir le détail dans « Vacances et relais », alerte e-mail du relais →</Link>
      </p>
    </section>
  );
}
