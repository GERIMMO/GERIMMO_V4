import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { ClocheAlertes } from "@/components/cloche-alertes";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  // Pop-up de synthèse à la connexion : toutes agences confondues (RLS)
  const alertes = await chargerSyntheseAlertes(supabase);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mes espaces</h1>
        <div className="flex items-center gap-2">
          <ClocheAlertes alertes={alertes} />
          <form action={seDeconnecter}>
            <Button variant="outline" size="sm" type="submit">
              Se déconnecter
            </Button>
          </form>
        </div>
      </div>

      {adhesions.length === 0 && (
        <p className="text-muted-foreground">
          Aucun accès actif n&apos;est associé à votre compte. Rapprochez-vous
          de votre agence.
        </p>
      )}

      <div className="grid gap-4">
        {adhesions.map((a) => {
          const chemin = cheminEspace(a);
          const carte = (
            <Card
              key={a.id}
              className={chemin ? "transition-colors hover:bg-accent" : "opacity-60"}
            >
              <CardHeader>
                <CardTitle className="text-base">
                  {LIBELLES[a.role] ?? a.role}
                </CardTitle>
                <CardDescription>
                  {a.organization?.name ?? "Toute la plateforme"}
                  {!chemin && " — bientôt disponible"}
                </CardDescription>
              </CardHeader>
            </Card>
          );
          return chemin ? (
            <Link key={a.id} href={chemin}>
              {carte}
            </Link>
          ) : (
            carte
          );
        })}
      </div>
    </main>
  );
}
