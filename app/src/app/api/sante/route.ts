// Le point de santé : la base répond-elle, et les tâches sont-elles passées ?
//
// LE TROISIÈME CAPTEUR (wiki : « Gerimmo en autonomie », 19/09). Deux niveaux
// de réponse, parce que deux lecteurs :
//  · sans secret — un moniteur externe, ou n'importe qui : `ok`, `base`, le
//    commit déployé. Rien de plus : l'état des tâches dit ce que la plateforme
//    envoie et quand, ce n'est pas public.
//  · avec le secret des tâches (`Authorization: Bearer CRON_SECRET`) — la ronde
//    du matin : la dernière passe de chaque tâche avec son bilan, et le nombre
//    d'écrans en erreur sur 24 h.
//
// Cette route porte la clé de service, comme les tâches : elle est donc dans
// la liste des chemins exemptés de session (`src/proxy.ts`) — sans quoi elle
// serait renvoyée vers la connexion, comme l'a été un cron le 18/09.

import { clientDeService } from "@/lib/supabase/service";
import { dernieresTaches, porteurDuSecret, type PasseConsignee } from "@/lib/tache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Une variable présente mais vide n'est pas un commit : `""` dirait « quelque
  // chose », alors qu'on ne sait rien.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const commit = sha ? sha.slice(0, 7) : null;

  const supabase = clientDeService();
  if (!supabase) {
    return Response.json(
      { ok: false, base: false, commit, motif: "SUPABASE_SERVICE_ROLE_KEY absente." },
      { status: 503 }
    );
  }

  // Une lecture minuscule, en tête seulement : si elle échoue, la base ne
  // répond pas — c'est la seule chose qu'on veut savoir ici.
  const { error: erreurBase } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });
  if (erreurBase) {
    return Response.json(
      { ok: false, base: false, commit, motif: "La base ne répond pas." },
      { status: 503 }
    );
  }

  if (!porteurDuSecret(request, process.env.CRON_SECRET)) {
    return Response.json({ ok: true, base: true, commit });
  }

  const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [passes, erreurs] = await Promise.all([
    supabase
      .from("tech_log")
      .select("evenement, details, created_at")
      .like("evenement", "tache_%")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("tech_log")
      .select("id", { count: "exact", head: true })
      .eq("evenement", "erreur_ecran")
      .gte("created_at", depuis),
  ]);

  return Response.json({
    ok: true,
    base: true,
    commit,
    taches: dernieresTaches((passes.data ?? []) as PasseConsignee[]),
    erreurs_ecran_24h: erreurs.error ? null : (erreurs.count ?? 0),
    lectures_en_echec: [passes.error, erreurs.error].filter(Boolean).length,
  });
}
