import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { lireRegles, parametresRegles, ReglesAConnaitre } from "@/components/regles-a-connaitre";

export const metadata = { title: "Les règles à connaître" };

/**
 * « Les règles à connaître » dans l'espace du locataire (20/11/2026).
 *
 * Le menu ouvrait `/veille`, hors de l'espace : on perdait le menu en lisant une rubrique du menu. Même contenu, même
 * lecture ; la page s'ouvre sur les règles qui concernent les locataires, comme le faisait le lien du menu.
 */
export default async function PageReglesLocataire({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);
  const base = `/locataire/${orgId}`;
  const { publicChoisi, page } = parametresRegles(await searchParams, "locataire");
  const regles = await lireRegles(supabase, publicChoisi, page);
  return (
    <ReglesAConnaitre
      adresse={`${base}/regles`}
      accueil={base}
      libelleAccueil="Revenir à l’accueil"
      publicChoisi={publicChoisi}
      page={page}
      {...regles}
    />
  );
}
