import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { ClocheAlertes } from "@/components/cloche-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";

// Console super admin : même bandeau encre que les autres espaces (charte v2),
// avec l'eyebrow « Console d'administration » en guise de contexte.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const alertes = await chargerSyntheseAlertes(supabase);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <MarqueGerimmo surEncre />
            <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--sur-encre)]/25" />
            <Link
              href="/admin"
              className="eyebrow truncate text-[var(--sur-encre)]/55 hover:text-[var(--sur-encre)]/80"
            >
              Console d&apos;administration
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link
              href="/admin/journaux"
              className="text-[0.8125rem] text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
            >
              Journaux et conservation
            </Link>
            <ClocheAlertes alertes={alertes} modeAdmin surEncre />
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
