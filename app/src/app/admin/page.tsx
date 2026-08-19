import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Console d'administration — Gerimmo" };

export default async function PageAdmin() {
  const supabase = await createClient();

  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond
  const { data: organisations } = await supabase
    .from("organizations")
    .select("id, name, status")
    .order("name");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="mb-6 entete-page">
        <h1>Agences</h1>
        <span className="mono-discret">
          {(organisations ?? []).length} agence{(organisations ?? []).length > 1 ? "s" : ""}
        </span>
      </div>

      {(organisations ?? []).length === 0 && (
        <div className="vide">
          Aucune agence sur la plateforme pour l&apos;instant. La création
          d&apos;agence arrive avec la console complète (sprint 9b).
        </div>
      )}

      <div className="grid gap-4">
        {(organisations ?? []).map((o) => (
          <Link key={o.id} href={`/admin/organisations/${o.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{o.name}</CardTitle>
                <CardDescription>
                  {LIBELLES_STATUT_ORGANISATION[o.status] ?? o.status}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
