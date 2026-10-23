import type { SupabaseClient } from "@supabase/supabase-js";
import { EcranNouvelleVersionConditions } from "@/components/ecran-nouvelle-version-conditions";
import { valeurReport } from "@/lib/conditions-acceptation";
import { abonnementCourant, derniereVersionAcceptee } from "@/lib/conditions-acceptation-serveur";
import { nouvelleVersionAAccepter } from "@/lib/nouvelle-version-conditions";

/**
 * L'écran de ré-acceptation des conditions clients (plan de conformité du 23/10/2026, R19), posé par la coquille de
 * l'espace pour son seul responsable, hors traversée de supervision. Une lecture : la dernière acceptation des
 * conditions clients du compte ; l'abonnement n'est lu que si l'écran s'affiche. Toute lecture en échec n'affiche rien
 * (l'écran ne bloque rien, il ne doit pas non plus apparaître sur une donnée incertaine).
 */
export async function NouvelleVersionConditions({
  supabase,
  orgId,
  compteId,
  derniereConnexion,
}: {
  supabase: SupabaseClient;
  orgId: string;
  compteId: string;
  derniereConnexion: string | null;
}) {
  const derniere = await derniereVersionAcceptee(supabase, compteId, "conditions_clients");
  if (!nouvelleVersionAAccepter({ derniereVersionAcceptee: derniere })) return null;
  const abonnement = await abonnementCourant(supabase, orgId);
  const ecran = nouvelleVersionAAccepter({ derniereVersionAcceptee: derniere, abonnement });
  if (!ecran) return null;
  return (
    <EcranNouvelleVersionConditions
      orgId={orgId}
      version={ecran.version}
      dateVersion={ecran.dateVersion}
      paragraphes={ecran.paragraphes}
      report={valeurReport(ecran.version, derniereConnexion)}
    />
  );
}
