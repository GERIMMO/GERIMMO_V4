import Link from "next/link";
import { aujourdhuiParis } from "@/lib/ged";
import { NavAdmin } from "./nav-admin";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";

// Console super admin : même bandeau BLANC que le reste du produit (charte v3),
// avec l'eyebrow « Console d'administration » en guise de contexte.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const alertes = await chargerSyntheseAlertes(supabase);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bandeau-appli admin-bandeau">
        <div className="admin-bandeau-interieur mx-auto w-full max-w-4xl px-4 sm:px-7">
          <div className="admin-bandeau-haut">
            <div className="flex min-w-0 items-center gap-3">
              <MarqueGerimmo />
              <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--filet)]" />
              <Link
                href="/admin"
                className="eyebrow truncate text-[var(--libelle)] hover:text-[var(--marque-sombre)]"
              >
                Console d&apos;administration
              </Link>
            </div>
            <div className="admin-bandeau-actions">
              <SyntheseAlertes alertes={alertes} modeAdmin rappel aujourdhui={aujourdhuiParis()} />
              {/* Le mot de passe et le second facteur se règlent dans le compte. */}
              <Link href="/compte" className="lien-bandeau">Sécurité du compte</Link>
              <form action={seDeconnecter}>
                <button type="submit" className="lien-bandeau">Se déconnecter</button>
              </form>
            </div>
          </div>
          <nav className="admin-nav" aria-label="Navigation de la supervision">
            <NavAdmin />
          </nav>
        </div>
      </header>
      <div className="portail-ecrans min-w-0 flex-1">{children}</div>
    </div>
  );
}
