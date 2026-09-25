// Tâche planifiée : remettre chaque dossier sur sa prochaine étape et préparer
// les comptes rendus automatiques.
//
// SA PROPRE ENTRÉE DANS vercel.json (25/09). L'orchestration vivait dans la
// mission « Rendez-vous et suivi des dossiers » : mettre les rappels en pause
// arrêtait aussi l'actualisation des dossiers et les comptes rendus, sans que
// rien le dise. Elle tourne désormais seule, avant les rappels, et consigne
// sa passe sous `tache_orchestrateur` — la ligne que Santé lit déjà.
// L'orchestration est idempotente et verrouillée en base : un second passage
// dans la même matinée ne fait rien de plus.
import { clientDeService } from "@/lib/supabase/service";
import { porteurDuSecret } from "@/lib/tache";
import { orchestrerDossiers } from "@/lib/orchestrateur";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!porteurDuSecret(request, process.env.CRON_SECRET)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Service indisponible." }, { status: 503 });
  // `orchestrerDossiers` consigne lui-même `tache_orchestrateur`.
  const resultat = await orchestrerDossiers(supabase);
  return Response.json(resultat, { status: resultat.erreur ? 500 : 200 });
}
