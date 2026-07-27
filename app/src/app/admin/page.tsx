import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Console d'administration — Gerimmo" };

const STATUTS: Record<string, string> = {
  essai: "Essai",
  active: "Active",
  suspendue: "Suspendue",
  archivee: "Archivée",
};

export default async function PageAdmin() {
  const supabase = await createClient();

  // Réservé au super admin : sans ce rôle, la RLS ne renvoie que ses agences
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const { data: organisations } = await supabase
    .from("organizations")
    .select("id, name, status")
    .order("name");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Console d&apos;administration</p>
          <h1 className="text-2xl font-semibold">Agences</h1>
        </div>
        <form action={seDeconnecter}>
          <Button variant="outline" size="sm" type="submit">
            Se déconnecter
          </Button>
        </form>
      </div>

      <div className="grid gap-4">
        {(organisations ?? []).map((o) => (
          <Link key={o.id} href={`/admin/organisations/${o.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{o.name}</CardTitle>
                <CardDescription>{STATUTS[o.status] ?? o.status}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
