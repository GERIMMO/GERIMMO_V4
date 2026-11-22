import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { enrichirRappelsLoyers, lireRappelsLoyers, organiserRappelsLoyers } from "@/lib/rappels-loyers";
import { piloteLimite } from "@/lib/perimetre-pilote";
import { courrierDisponible } from "@/lib/paliers-reception-loyer";
import { preparerMoteurPdfLocal } from "@/lib/documents/rendu";
import { recommandeElectroniqueDisponible } from "@/lib/recommande-disponible";
import { RappelsLoyersInteractifs } from "./rappels-loyers-interactifs";
import { lireEnvoisProposes } from "@/lib/envois-suspendus";

export async function RappelsLoyers({ supabase, orgId, lectureSeule = false, dansFenetre = true, rappelsLus, relanceAutomatiqueOuverte }: {
  supabase: SupabaseClient; orgId: string; lectureSeule?: boolean; dansFenetre?: boolean; rappelsLus?: ReturnType<typeof organiserRappelsLoyers>;
  /** Déjà lu par la page qui affiche ce bloc : évite une seconde lecture. Absent : le bloc le lit lui-même. */
  relanceAutomatiqueOuverte?: boolean;
}) {
  const { lignes, error } = await lireRappelsLoyers(supabase, orgId);
  if (error) return <p className="err" role="alert">Les loyers à confirmer n’ont pas pu être vérifiés. Consultez Finances avant de déclarer un règlement.</p>;
  const aujourdHui = aujourdhuiParis();
  const rappels = rappelsLus ?? organiserRappelsLoyers(lignes, aujourdHui);
  const dus = rappelsLus ? rappelsLus.dus : await enrichirRappelsLoyers(supabase, orgId, rappels.dus, aujourdHui);
  if (!lectureSeule && dus.some(ligne => courrierDisponible(ligne, aujourdHui))) preparerMoteurPdfLocal();
  // Audit palier 1 (P1-18) : le recommandé électronique n'est proposé que s'il est réellement relié pour cet espace.
  const recommandeElectronique = !lectureSeule && await recommandeElectroniqueDisponible(supabase, orgId);
  // Audit palier 1 (P1-08) : la relance automatique n'est annoncée que si le superviseur l'a ouverte.
  const relanceOuverte = relanceAutomatiqueOuverte ?? (await lireEnvoisProposes(supabase)).relance_loyer;
  return <RappelsLoyersInteractifs envoiRelanceDisponible={!piloteLimite()} relanceAutomatiqueOuverte={relanceOuverte} recommandeElectroniqueDisponible={recommandeElectronique} key={orgId} orgId={orgId} aujourdHui={aujourdHui} lectureSeule={lectureSeule} {...rappels} dus={dus} dansFenetre={dansFenetre} />;
}
