import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { lireDerniereRelanceReception, lireRappelsLoyers, organiserRappelsLoyers } from "@/lib/rappels-loyers";
import { RappelsLoyersInteractifs } from "./rappels-loyers-interactifs";

export async function RappelsLoyers({ supabase, orgId, lectureSeule = false, dansFenetre = true }: {
  supabase: SupabaseClient; orgId: string; lectureSeule?: boolean; dansFenetre?: boolean;
}) {
  const { lignes, error } = await lireRappelsLoyers(supabase, orgId);
  if (error) return <p className="err" role="alert">Les loyers à confirmer n’ont pas pu être vérifiés. Consultez Finances avant de déclarer un règlement.</p>;
  const aujourdHui = aujourdhuiParis();
  const rappels = organiserRappelsLoyers(lignes, aujourdHui);
  if (!rappels.dus.length) return null;
  const dus = await Promise.all(rappels.dus.map(async ligne => {
    const { data, error } = await lireDerniereRelanceReception(supabase, orgId, ligne);
    return { ...ligne, derniere_relance: data, historique_relances_disponible: !error };
  }));
  return <RappelsLoyersInteractifs orgId={orgId} aujourdHui={aujourdHui} lectureSeule={lectureSeule} {...rappels} dus={dus} dansFenetre={dansFenetre} />;
}
