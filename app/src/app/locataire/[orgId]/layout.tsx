import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { seDeconnecter } from "@/app/actions/auth";
import { MarqueGerimmo } from "@/components/marque-gerimmo";

// Espace locataire (module 0b) : le plus restreint. Bandeau encre de la charte
// (chromeLoc de la maquette), pas de navigation latérale — le locataire ne voit
// que son accueil et son dossier.
export default async function LayoutLocataire({
  children,
  params,
}: LayoutProps<"/locataire/[orgId]">) {
  const { orgId } = await params;
  const { organisation } = await verifierAccesEspaceLocataire(orgId);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <MarqueGerimmo surEncre />
            <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--sur-encre)]/25" />
            <div className="min-w-0">
              <p className="eyebrow text-[var(--sur-encre)]/55">Espace locataire</p>
              <Link
                href={`/locataire/${orgId}`}
                className="block truncate text-[0.8125rem] text-[var(--sur-encre)]/90 hover:text-[var(--sur-encre)]"
              >
                {organisation.name}
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
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
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
