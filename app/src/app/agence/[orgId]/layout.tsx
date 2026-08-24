import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { seDeconnecter } from "@/app/actions/auth";
import { NavAgence } from "@/components/nav-agence";
import { ClocheAlertes } from "@/components/cloche-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { Toasteur } from "@/components/ui/toast";

// Layout de l'espace agence — charte : marque à gauche, contexte d'agence
// séparé d'un filet, actions à droite ; navigation en onglets sous l'en-tête,
// liseré or sur l'onglet actif. Partagé avec le propriétaire direct.
export default async function LayoutAgence({
  children,
  params,
}: LayoutProps<"/agence/[orgId]">) {
  const { orgId } = await params;
  const { supabase, organisation, role } = await verifierAccesEspace(orgId);

  // Revue recette 08/08 : la pop-up et la cloche ne montrent que les alertes
  // qui me sont confiées, dans l'agence où je me trouve — l'acteur
  // multi-agences navigue d'une agence à l'autre pour voir les siennes.
  const [alertes, { count: incidentsOuverts }, { data: donneesMembres }] =
    await Promise.all([
      chargerSyntheseAlertes(supabase, { orgId }),
      // Badge maquette : les incidents encore ouverts (tout sauf clos)
      supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .neq("etat", "clos"),
      // « Traiter » depuis la cloche ouvre la pop-up sur place (recette
      // 24/08) : il lui faut la liste des gérants pour « Confier à »
      supabase.rpc("org_membres_gerants", { org: orgId }),
    ]);
  const alertesOrg = alertes.length;
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];
  const estResponsable = ROLES_RESPONSABLES.includes(role);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Bandeau encre de la maquette : marque, contexte d'agence, actions ;
          navigation en onglets sombres sous un filet, liseré laiton actif. */}
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        {/* Sur un téléphone, les deux groupes ne tiennent pas sur une ligne : sans
            `flex-wrap` ils se chevauchaient, marque par-dessus « Mes espaces ». */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <Link href={`/agence/${orgId}`} aria-label="Accueil de l'agence">
              <MarqueGerimmo surEncre />
            </Link>
            <span
              aria-hidden
              className="hidden h-7 w-px bg-[var(--sur-encre)]/20 sm:block"
            />
            <div className="min-w-0">
              <p className="eyebrow text-[var(--sur-encre)]/55">Espace agence</p>
              <p className="truncate text-[13px] text-[var(--sur-encre)]">
                {organisation.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-5">
            <ClocheAlertes
              alertes={alertes}
              surEncre
              membres={membres}
              estResponsable={estResponsable}
            />
            <Link
              href="/espaces"
              className="text-[0.8125rem] text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
            >
              Mes espaces
            </Link>
            <form action={seDeconnecter}>
              <button
                type="submit"
                className="text-[0.8125rem] text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-[var(--sur-encre)]/10">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-7">
            <NavAgence
              orgId={orgId}
              alertesOuvertes={alertesOrg}
              incidentsOuverts={incidentsOuverts ?? 0}
            />
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1">{children}</div>
      {/* Confirmations façon maquette (recette 24/08) : le geste abouti fait
          disparaître la ligne, le toast dit ce qui vient de se passer. */}
      <Toasteur />
    </div>
  );
}
