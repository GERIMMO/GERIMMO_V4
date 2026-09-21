import Link from "next/link";
import { aujourdhuiParis } from "@/lib/ged";
import { NavAdmin } from "./nav-admin";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { RechercheSupervision } from "@/components/recherche-supervision";

// La supervision reprend le repère latéral des espaces métier. Les actions de
// sécurité restent dans l'en-tête, visibles sur chaque écran.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const alertes = await chargerSyntheseAlertes(supabase, { toutes: true });

  return (
    <div className="admin-coquille">
      <aside className="admin-late">
        <Link href="/admin" className="admin-marque" aria-label="Accueil de la supervision">
          <MarqueGerimmo />
        </Link>
        <nav className="admin-nav" aria-label="Navigation de la supervision">
          <NavAdmin />
        </nav>
      </aside>
      <div className="admin-corps">
        <header className="bandeau-appli admin-bandeau">
          <div className="admin-bandeau-interieur">
            <Link href="/admin" className="admin-contexte">
              Console d&apos;administration
            </Link>
            <div className="admin-bandeau-actions">
              <RechercheSupervision />
              <SyntheseAlertes alertes={alertes} modeAdmin rappel aujourdhui={aujourdhuiParis()} />
              <Link href="/compte" className="lien-bandeau">Sécurité du compte</Link>
              <form action={seDeconnecter}>
                <button type="submit" className="lien-bandeau">Se déconnecter</button>
              </form>
            </div>
          </div>
        </header>
        <div className="repere-visuel repere-visuel-admin" aria-hidden="true" />
        <div className="portail-ecrans min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
