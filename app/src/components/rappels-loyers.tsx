import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { enrichirRappelsLoyers, lireRappelsLoyers, organiserRappelsLoyers } from "@/lib/rappels-loyers";
import { piloteLimite } from "@/lib/perimetre-pilote";
import { courrierDisponible } from "@/lib/paliers-reception-loyer";
import { preparerMoteurPdfLocal } from "@/lib/documents/rendu";
import { RappelsLoyersInteractifs } from "./rappels-loyers-interactifs";

export async function RappelsLoyers({ supabase, orgId, lectureSeule = false, dansFenetre = true, rappelsLus }: {
  supabase: SupabaseClient; orgId: string; lectureSeule?: boolean; dansFenetre?: boolean; rappelsLus?: ReturnType<typeof organiserRappelsLoyers>;
}) {
  const { lignes, error } = await lireRappelsLoyers(supabase, orgId);
  if (error) return <p className="err" role="alert">Les loyers à confirmer n’ont pas pu être vérifiés. Consultez Finances avant de déclarer un règlement.</p>;
  const aujourdHui = aujourdhuiParis();
  const rappels = rappelsLus ?? organiserRappelsLoyers(lignes, aujourdHui);
  const dus = rappelsLus ? rappelsLus.dus : await enrichirRappelsLoyers(supabase, orgId, rappels.dus, aujourdHui);
  if (!lectureSeule && dus.some(ligne => courrierDisponible(ligne, aujourdHui))) preparerMoteurPdfLocal();
  return <RappelsLoyersInteractifs envoiRelanceDisponible={!piloteLimite()} key={orgId} orgId={orgId} aujourdHui={aujourdHui} lectureSeule={lectureSeule} {...rappels} dus={dus} dansFenetre={dansFenetre} />;
}
