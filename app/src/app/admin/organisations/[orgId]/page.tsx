import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Agence — Console Gerimmo" };

export default async function PageAdminOrganisation(
  props: PageProps<"/admin/organisations/[orgId]">
) {
  const { orgId } = await props.params;
  const supabase = await createClient();

  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  // RM-A1.11 : la traversée super admin est journalisée (audit_log, 3 ans)
  await supabase.rpc("log_sa_access", {
    org: orgId,
    sa_action: "consultation_organisation",
  });

  const { data: organisation } = await supabase
    .from("organizations")
    .select("id, name, status")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

  const [{ data: personnes }, { data: adhesions }] = await Promise.all([
    supabase
      .from("persons")
      .select("id, nom, prenom")
      .eq("organization_id", orgId)
      .order("nom"),
    supabase
      .from("memberships")
      .select("id, role, status, account:accounts(email)")
      .eq("organization_id", orgId),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-7">
      <div className="mb-8">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />}>
          ← Toutes les agences
        </Button>
        <h1 className="mt-2 text-2xl font-semibold">{organisation.name}</h1>
        <p className="text-sm text-muted-foreground">
          Consultation journalisée au journal d&apos;audit (RM-A1.11).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utilisateurs</CardTitle>
            <CardDescription>Adhésions de l&apos;agence</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {(adhesions ?? []).map((m) => (
                <li key={m.id} className="py-2 text-sm">
                  <span className="font-medium">
                    {(m.account as unknown as { email: string } | null)?.email}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    — {m.role} ({m.status})
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personnes</CardTitle>
            <CardDescription>Fiches de l&apos;agence</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {(personnes ?? []).map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  {p.nom} {p.prenom}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
