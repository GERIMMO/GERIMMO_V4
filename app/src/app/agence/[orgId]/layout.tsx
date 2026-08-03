import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { seDeconnecter } from "@/app/actions/auth";
import { NavAgence } from "@/components/nav-agence";
import { ClocheAlertes } from "@/components/cloche-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";

// Layout de l'espace agence — charte : marque à gauche, contexte d'agence
// séparé d'un filet, actions à droite ; navigation en onglets sous l'en-tête,
// liseré or sur l'onglet actif. Partagé avec le propriétaire direct.
export default async function LayoutAgence({
  children,
  params,
}: LayoutProps<"/agence/[orgId]">) {
  const { orgId } = await params;
  const { supabase, organisation } = await verifierAccesEspace(orgId);

  // Synthèse des alertes de TOUTES les agences de l'utilisateur (la RLS ne
  // renvoie que les siennes) — la pop-up donne la vision macro multi-agences
  const alertes = await chargerSyntheseAlertes(supabase);
  const alertesOrg = alertes.filter((a) => a.organization_id === orgId).length;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        {/* Sur un téléphone, les deux groupes ne tiennent pas sur une ligne : sans
            `flex-wrap` ils se chevauchaient, marque par-dessus « Mes espaces ». */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <Link href={`/agence/${orgId}`} aria-label="Accueil de l'agence">
              <MarqueGerimmo />
            </Link>
            <span aria-hidden className="hidden h-8 w-px bg-border sm:block" />
            <div className="min-w-0">
              <p className="libelle-champ">Espace agence</p>
              <p className="truncate text-sm font-medium">{organisation.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-5">
            <ClocheAlertes alertes={alertes} />
            <Link
              href="/espaces"
              className="text-[0.8125rem] text-muted-foreground hover:text-foreground"
            >
              Mes espaces
            </Link>
            <form action={seDeconnecter}>
              <button
                type="submit"
                className="text-[0.8125rem] text-muted-foreground hover:text-foreground"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-7">
          <NavAgence orgId={orgId} alertesOuvertes={alertesOrg} />
        </div>
      </header>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
