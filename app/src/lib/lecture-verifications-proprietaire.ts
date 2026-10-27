import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerActionsDuJour } from "@/lib/actions-du-jour";
import { aujourdhuiParis } from "@/lib/ged";
import { RACINE_PROPRIETAIRE } from "@/lib/racine-espace";
import { lireRappelsLoyers } from "@/lib/rappels-loyers";
import { preparerVerificationsProprietaire } from "@/lib/verifications-proprietaire";

/** Accueil, navigation et À faire partagent les mêmes lectures mémorisées et le même dédoublonnage. */
export async function chargerVerificationsProprietaire(
  supabase: SupabaseClient,
  orgId: string,
  options: { userId: string; portefeuille: Set<string> | null },
) {
  const aujourdHui = aujourdhuiParis();
  const [lecturePlan, lectureLoyers] = await Promise.all([
    chargerActionsDuJour(supabase, orgId, { ...options, racine: RACINE_PROPRIETAIRE }),
    lireRappelsLoyers(supabase, orgId),
  ]);
  const { plan } = lecturePlan;
  const verifications = preparerVerificationsProprietaire({
    actions: [...plan.surLesBaux, ...plan.enRetard, ...plan.aVenir],
    lignesLoyers: lectureLoyers.lignes,
    aujourdHui,
    loyersIndisponibles: Boolean(lectureLoyers.error),
  });
  return { ...lecturePlan, lectureLoyers, verifications, aujourdHui };
}
