// Tâche planifiée : l'alerte e-mail quotidienne du relais (D46-B, décisions du dirigeant du 15/10/2026), et le passage
// fréquent des urgences (relecture du 15/10, `?mode=urgences`).
//
// SA PROPRE ENTRÉE, COMME LE SUIVI DES DOSSIERS. Ce n'est pas une mission : elle ne passe pas par
// /api/cron/equipes, dont l'enveloppe consulte l'arrêt d'urgence avant tout effet. Or l'arrêt est l'un des sujets de
// cette alerte : elle ne doit pas être coupée par lui (justification dans src/lib/relais-alerte-envoi.ts).
//
// L'HEURE. Vercel ne connaît que l'UTC : vercel.json l'appelle à 03 h et 04 h UTC, et seul l'appel qui tombe à 5 h à
// Paris agit (03 h UTC en été, 04 h UTC en hiver) ; l'autre répond « hors créneau ». Le paramètre `creneau` des deux
// entrées (« ete », « hiver ») n'est qu'une étiquette : la décision vient de l'horloge, à l'heure de Paris. Au plus un
// e-mail par jour de Paris : la base réserve le jour (`reserver_alerte_relais`), un second appel ne renvoie rien.
// Le passage de 5 h vide aussi la file de l'e-mail immédiat des urgences (décision du 15/10) : celles qu'il vient de
// poser partent tout de suite, puis l'e-mail de 5 h les rappelle (lib/relais-urgences-envoi.ts).
//
// LE PASSAGE FRÉQUENT (`?mode=urgences`, migration 20261014812000). pg_cron l'appelle par pg_net toutes les 10 minutes,
// jour et nuit (tâche `relais-urgences`), avec SON PROPRE jeton, généré en base et lu ici par le client de service : ni
// le secret des tâches Vercel ne l'ouvre, ni ce jeton n'ouvre le passage de 5 h. Refus sans jeton (avant toute lecture),
// comparaison à temps constant, jeton jamais écrit dans un journal ni renvoyé. Il ne fait que constater les urgences
// (`traiter_vacances`) puis vider la file de l'e-mail immédiat : file vide, aucun appel au service d'e-mail. Jeton
// absent en base (migration non appliquée) : « non configuré », rien ne se passe, l'e-mail de 5 h reste le filet.
import { clientDeService } from "@/lib/supabase/service";
import { porteurDuSecret } from "@/lib/tache";
import { passerAlerteRelais } from "@/lib/relais-alerte-envoi";
import { accesPassageUrgences, passerUrgencesRelais } from "@/lib/relais-urgences-envoi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("mode") === "urgences") return passageDesUrgences(request);
  if (!porteurDuSecret(request, process.env.CRON_SECRET)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const db = clientDeService();
  if (!db) return Response.json({ erreur: "Connexion du traitement indisponible." }, { status: 503 });
  const resultat = await passerAlerteRelais({ db });
  // Rien d'autre que des nombres et des états : ni adresse, ni contenu de l'e-mail.
  return Response.json(resultat, { status: "erreur" in resultat ? resultat.status : 200 });
}

/** Le passage fréquent des urgences : jeton propre, constat, envoi. Rien d'autre. */
async function passageDesUrgences(request: Request): Promise<Response> {
  // Sans jeton, refus immédiat : la base n'est même pas lue.
  if (!(request.headers.get("authorization") ?? "").startsWith("Bearer ")) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const db = clientDeService();
  if (!db) return Response.json({ erreur: "Connexion du traitement indisponible." }, { status: 503 });
  const acces = await accesPassageUrgences(request, db);
  if (acces === "non_configure") {
    return Response.json({ erreur: "Le passage des urgences n’est pas configuré.", non_configure: true }, { status: 503 });
  }
  if (acces !== "autorise") return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  const resultat = await passerUrgencesRelais({ db });
  // Des états et des nombres seulement : ni adresse, ni jeton. Constat impossible : 503 (la sentinelle le verra aussi).
  return Response.json(resultat, { status: resultat.constat === "fait" ? 200 : 503 });
}
