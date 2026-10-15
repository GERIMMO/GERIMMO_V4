// Tâche planifiée : l'alerte e-mail quotidienne du relais (D46-B, décisions du dirigeant du 15/10/2026).
//
// SA PROPRE ENTRÉE, COMME LE SUIVI DES DOSSIERS. Ce n'est pas une mission : elle ne passe pas par
// /api/cron/equipes, dont l'enveloppe consulte l'arrêt d'urgence avant tout effet. Or l'arrêt est l'un des sujets de
// cette alerte : elle ne doit pas être coupée par lui (justification dans src/lib/relais-alerte-envoi.ts).
//
// L'HEURE. Vercel ne connaît que l'UTC : vercel.json l'appelle à 03 h et 04 h UTC, et seul l'appel qui tombe à 5 h à
// Paris agit (03 h UTC en été, 04 h UTC en hiver) ; l'autre répond « hors créneau ». Le paramètre `creneau` des deux
// entrées (« ete », « hiver ») n'est qu'une étiquette : la décision vient de l'horloge, à l'heure de Paris. Au plus un
// e-mail par jour de Paris : la base réserve le jour (`reserver_alerte_relais`), un second appel ne renvoie rien.
import { clientDeService } from "@/lib/supabase/service";
import { porteurDuSecret } from "@/lib/tache";
import { passerAlerteRelais } from "@/lib/relais-alerte-envoi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!porteurDuSecret(request, process.env.CRON_SECRET)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const db = clientDeService();
  if (!db) return Response.json({ erreur: "Connexion du traitement indisponible." }, { status: 503 });
  const resultat = await passerAlerteRelais({ db });
  // Rien d'autre que des nombres et des états : ni adresse, ni contenu de l'e-mail.
  return Response.json(resultat, { status: "erreur" in resultat ? resultat.status : 200 });
}
