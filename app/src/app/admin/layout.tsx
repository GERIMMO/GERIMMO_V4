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
      <header className="bandeau-appli">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7">
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
          {/* En étroit, les liens passent sous la marque au lieu de déborder */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <NavAdmin />
            <SyntheseAlertes alertes={alertes} modeAdmin rappel aujourdhui={aujourdhuiParis()} />
            {/* Vers /compte, pas /securite (19/09) : le sas de supervision ne
                sait que faire ENTRER, et se contente d'annoncer « votre session
                est protégée » à qui l'a déjà franchi. Le mot de passe et le
                second facteur s'entretiennent dans le compte. */}
            <Link href="/compte" className="lien-bandeau">Sécurité du compte</Link>
            <form action={seDeconnecter}>
              <button type="submit" className="lien-bandeau">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="portail-ecrans min-w-0 flex-1">{children}</div>
    </div>
  );
}
