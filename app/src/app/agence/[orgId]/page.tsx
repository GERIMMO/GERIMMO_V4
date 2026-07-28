import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Espace agence — Gerimmo" };

export default async function PageAgence(props: PageProps<"/agence/[orgId]">) {
  const { orgId } = await props.params;
  const supabase = await createClient();

  // Cet espace est réservé aux rôles d'agence (la RLS protège les données,
  // cette garde protège la navigation)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !["admin_agence", "agent"].includes(adhesion.role)) {
    redirect("/espaces");
  }

  // La RLS garantit qu'une agence dont on n'est pas membre est invisible
  const { data: organisation } = await supabase
    .from("organizations")
    .select("id, name, status")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  const { data: personnes } = await supabase
    .from("persons")
    .select("id, nom, prenom, email")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("nom");

  const { count: alertesOuvertes } = await supabase
    .from("alerts")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("statut", "ouverte");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Espace agence</p>
          <h1 className="text-2xl font-semibold">{organisation.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/espaces">Mes espaces</Link>}
          />
          <form action={seDeconnecter}>
            <Button variant="outline" size="sm" type="submit">
              Se déconnecter
            </Button>
          </form>
        </div>
      </div>

      <nav className="mb-6 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/agence/${orgId}/documents`}>Documents</Link>}
        />
        <Button
          variant="outline"
          size="sm"
          render={
            <Link href={`/agence/${orgId}/alertes`}>
              Alertes{(alertesOuvertes ?? 0) > 0 ? ` (${alertesOuvertes})` : ""}
            </Link>
          }
        />
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personnes</CardTitle>
          <CardDescription>
            Les fiches personnes de l&apos;agence — cloisonnées par la RLS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(personnes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune personne enregistrée.
            </p>
          ) : (
            <ul className="divide-y">
              {(personnes ?? []).map((p) => (
                <li key={p.id} className="flex items-baseline gap-2 py-2 text-sm">
                  <span className="font-medium">
                    {p.nom} {p.prenom}
                  </span>
                  {p.email && (
                    <span className="text-muted-foreground">{p.email}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
