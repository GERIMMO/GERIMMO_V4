import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { seDeconnecter } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { NavAgence } from "@/components/nav-agence";
import { ClocheAlertes } from "@/components/cloche-alertes";

// Layout définitif de l'espace agence (design system S2) : en-tête avec cloche
// d'alertes, navigation latérale (barre horizontale sur mobile), contenu.
// Partagé avec le propriétaire direct (parcours communs dès S2).
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
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 md:px-6">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Espace agence</p>
          <Link
            href={`/agence/${orgId}`}
            className="block truncate text-base font-semibold hover:underline"
          >
            {organisation.name}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ClocheAlertes alertes={alertes} />
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false} render={<Link href="/espaces">Mes espaces</Link>}
          />
          <form action={seDeconnecter}>
            <Button variant="outline" size="sm" type="submit">
              Se déconnecter
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-border bg-sidebar px-3 py-2 md:w-52 md:shrink-0 md:border-r md:border-b-0 md:py-4">
          <NavAgence orgId={orgId} alertesOuvertes={alertesOrg} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
