import { verifierAccesEspace } from "@/lib/espace";
import { PageAbonnement2026 } from "./abonnement-2026";
import { PageAbonnementHistorique } from "./abonnement-historique";

export const metadata = { title: "Mon abonnement — Gerimmo" };

// Seconde relecture adverse du 23/10 (A02) : les actions serveur de cette page (hausse, périodicité, résiliation)
// héritent de cette durée maximale. Le bail du verrou des gestes de facturation la dépasse
// (DUREE_VERROU_FACTURATION_SECONDES, lib/verrou-facturation.ts) : une action coupée par l'hébergeur ne survit pas à
// son verrou. Valeur littérale : Next la lit sans exécuter le fichier (tests/verrou-facturation.test.ts la relit).
export const maxDuration = 300;

// Deux grilles coexistent le temps de la migration (28/09/2026) : l'écran suit
// celle de l'organisation. Les organisations créées depuis le 28/09 relèvent
// de la nouvelle ; les autres gardent la leur tant que la procédure de
// migration ne les a pas basculées.
export default async function PageAbonnement(props: PageProps<"/agence/[orgId]/abonnement">) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);
  const { data } = await supabase.from("organizations").select("grille_tarifaire").eq("id", orgId).maybeSingle();
  return (data as { grille_tarifaire?: string } | null)?.grille_tarifaire === "historique" ? (
    <PageAbonnementHistorique {...props} />
  ) : (
    <PageAbonnement2026 {...props} />
  );
}
