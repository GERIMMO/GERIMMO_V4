import { verifierAccesEspace } from "@/lib/espace";
import { baseEspace } from "@/lib/racine-espace";
import { lireRegles, parametresRegles, ReglesAConnaitre } from "@/components/regles-a-connaitre";

export const metadata = { title: "Les règles à connaître — Gerimmo" };

/**
 * « Les règles à connaître » dans l'espace de l'agence et du propriétaire (20/11/2026).
 *
 * Le menu ouvrait `/veille`, hors de l'espace : on perdait le menu en lisant une rubrique du menu. Même contenu, même
 * lecture ; la page s'ouvre sur le public du profil (« agence » pour une agence, « bailleur » pour un propriétaire),
 * comme le faisait le lien du menu.
 */
export default async function PageRegles({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  const { publicChoisi, page } = parametresRegles(await searchParams, estProprietaire ? "bailleur" : "agence");
  const regles = await lireRegles(supabase, publicChoisi, page);
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <ReglesAConnaitre
        adresse={`${base}/regles`}
        accueil={base}
        libelleAccueil="Revenir au tableau de bord"
        publicChoisi={publicChoisi}
        page={page}
        {...regles}
      />
    </main>
  );
}
