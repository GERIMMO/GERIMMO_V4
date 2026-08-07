import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { ClocheAlertes } from "@/components/cloche-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";

export const metadata = { title: "Mes espaces — Gerimmo" };

const LIBELLES: Record<string, string> = {
  super_admin: "Console d'administration",
  admin_agence: "Espace agence (administrateur)",
  agent: "Espace agence",
  proprietaire_direct: "Espace propriétaire",
  locataire: "Espace locataire",
  artisan: "Espace artisan",
};

type Adhesion = {
  id: string;
  role: string;
  organization: { id: string; name: string } | null;
};

function cheminEspace(a: Adhesion): string | null {
  if (a.role === "super_admin") return "/admin";
  // Le propriétaire direct partage les écrans de l'espace agence dès le S2
  // (parcours communs du plan) ; ses écrans propres arrivent au S9
  if (["admin_agence", "agent", "proprietaire_direct"].includes(a.role))
    return a.organization ? `/agence/${a.organization.id}` : null;
  if (a.role === "locataire")
    return a.organization ? `/locataire/${a.organization.id}` : null;
  return null; // espaces des sprints suivants

}

export default async function PageEspaces() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data } = await supabase
    .from("memberships")
    .select("id, role, organization:organizations(id, name)")
    .eq("account_id", user.id)
    .eq("status", "active");

  const adhesions = (data ?? []) as unknown as Adhesion[];

  // Une seule adhésion : entrée directe, pas de sélecteur
  if (adhesions.length === 1) {
    const chemin = cheminEspace(adhesions[0]);
    if (chemin) redirect(chemin);
  }

  // Pop-up de synthèse à la connexion : mes alertes, toutes agences confondues
  const alertes = await chargerSyntheseAlertes(supabase);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Bandeau encre de la maquette, version nue : marque et sortie */}
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 sm:px-7">
          <MarqueGerimmo surEncre />
          <div className="flex items-center gap-4">
            <ClocheAlertes alertes={alertes} surEncre />
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

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-7">
        <p className="eyebrow mb-1.5">Un seul compte, tous vos espaces</p>
        <h1 className="mb-6">Mes espaces</h1>

        {adhesions.length === 0 && (
          <p className="text-muted-foreground">
            Aucun accès actif n&apos;est associé à votre compte. Rapprochez-vous
            de votre agence.
          </p>
        )}

        <div className="grid gap-2.5">
          {adhesions.map((a) => {
            const chemin = cheminEspace(a);
            const initiales = (a.organization?.name ?? "Gerimmo")
              .split(/\s+/)
              .map((m: string) => m[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const carte = (
              <span
                className={`flex w-full items-center gap-3.5 border border-border bg-card px-4.5 py-4 text-left transition-all ${
                  chemin
                    ? "hover:translate-x-[3px] hover:border-[var(--encre)]"
                    : "opacity-60"
                }`}
              >
                <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-[var(--encre)] text-[13px] text-[var(--or)]">
                  {initiales}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {LIBELLES[a.role] ?? a.role}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {a.organization?.name ?? "Toute la plateforme"}
                    {!chemin && " — bientôt disponible"}
                  </span>
                </span>
              </span>
            );
            return chemin ? (
              <Link key={a.id} href={chemin}>
                {carte}
              </Link>
            ) : (
              <span key={a.id}>{carte}</span>
            );
          })}
        </div>

        <p className="mt-4.5 text-xs text-muted-foreground">
          Le même compte peut porter plusieurs rôles : ce que vous voyez change
          avec l&apos;espace, pas avec l&apos;identifiant.
        </p>
      </main>
    </div>
  );
}
