import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { seDeconnecter } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

// Espace locataire (module 0b) : le plus restreint. En-tête simple, pas de
// navigation latérale — le locataire ne voit que son accueil et son dossier.
export default async function LayoutLocataire({
  children,
  params,
}: LayoutProps<"/locataire/[orgId]">) {
  const { orgId } = await params;
  const { organisation } = await verifierAccesEspaceLocataire(orgId);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 md:px-6">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Espace locataire</p>
          <Link href={`/locataire/${orgId}`} className="block truncate text-base font-semibold hover:underline">
            {organisation.name}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/espaces">Mes espaces</Link>} />
          <form action={seDeconnecter}>
            <Button variant="outline" size="sm" type="submit">
              Se déconnecter
            </Button>
          </form>
        </div>
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
