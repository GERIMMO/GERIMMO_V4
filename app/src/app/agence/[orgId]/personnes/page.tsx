import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { Card, CardContent } from "@/components/ui/card";
import { FormulairePersonne } from "./formulaire-personne";

export const metadata = { title: "Personnes — Gerimmo" };

// Les personnes de l'agence : propriétaires, locataires, garants — des fiches
// sans rôle (module 0b). Le dossier et le mandat se gèrent sur la fiche.
export default async function PagePersonnes(props: PageProps<"/agence/[orgId]/personnes">) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: personnes } = await supabase
    .from("persons")
    .select("id, nom, prenom, email, telephone")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("nom");

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Personnes</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          {(personnes ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Aucune personne. Créez la première fiche à droite — propriétaire,
                locataire ou garant, la fiche est la même.
              </CardContent>
            </Card>
          ) : (
            (personnes ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/agence/${orgId}/personnes/${p.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {p.nom}
                        {p.prenom ? ` ${p.prenom}` : ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[p.email, p.telephone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        <aside>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-medium">Nouvelle personne</p>
              <FormulairePersonne orgId={orgId} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
