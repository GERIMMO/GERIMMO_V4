import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { seDeconnecter } from "@/app/actions/auth";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { NavLocataire } from "@/components/nav-locataire";
import { nomComplet } from "@/lib/roles-personnes";

// Espace locataire — chromeLoc de la maquette : bandeau encre assombri
// (#0F2438) à deux étages, eyebrow « ESPACE LOCATAIRE » + nom du locataire
// (pas celui de l'agence : le locataire est chez lui ici), onglets sous un
// filet avec liseré laiton actif.
export default async function LayoutLocataire({
  children,
  params,
}: LayoutProps<"/locataire/[orgId]">) {
  const { orgId } = await params;
  const { organisation, personne } = await verifierAccesEspaceLocataire(orgId);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-[#0F2438] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <Link href={`/locataire/${orgId}`} aria-label="Accueil de mon espace">
              <MarqueGerimmo surEncre />
            </Link>
            <span aria-hidden className="hidden h-7 w-px bg-[var(--sur-encre)]/20 sm:block" />
            <div className="min-w-0">
              <p className="eyebrow text-[var(--sur-encre)]/55">Espace locataire</p>
              <p className="truncate text-[13px] text-[var(--sur-encre)]">
                {personne ? nomComplet(personne) : organisation.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-5">
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
            <NavLocataire orgId={orgId} />
          </div>
        </div>
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
