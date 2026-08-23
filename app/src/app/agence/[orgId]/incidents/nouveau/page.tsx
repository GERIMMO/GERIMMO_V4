import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireIncident } from "./formulaire-incident";

export const metadata = { title: "Nouvel incident — Gerimmo" };

export default async function PageNouvelIncident(
  props: PageProps<"/agence/[orgId]/incidents/nouveau">
) {
  const { orgId } = await props.params;
  const { supabase, organisation } = await verifierAccesEspace(orgId);

  // Les lots où un incident peut s'ouvrir : tout le parc non archivé.
  // FK explicite (recette 23/08) : lots→biens porte DEUX clés (simple +
  // même-org) — l'embed nu était ambigu (PGRST201) et la liste sortait vide,
  // en silence.
  const { data: lotsBruts, error: erreurLots } = await supabase
    .from("lots")
    .select("id, nom, etat, bien:biens!lots_bien_id_fkey(nom)")
    .eq("organization_id", orgId)
    .neq("etat", "archive")
    .order("nom");
  if (erreurLots) console.error("incidents/nouveau — lots illisibles :", erreurLots.message);
  const lots = ((lotsBruts ?? []) as unknown as {
    id: string;
    nom: string;
    etat: string;
    bien: UnOuPlusieurs<{ nom: string }>;
  }[]).map((l) => ({
    id: l.id,
    libelle: `${l.nom} — ${premier(l.bien)?.nom ?? ""}`,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href={`/agence/${orgId}`} className="hover:underline">
            {organisation.name}
          </Link>{" "}
          /{" "}
          <Link href={`/agence/${orgId}/incidents`} className="hover:underline">
            Incidents
          </Link>{" "}
          / Nouvel incident
        </p>
        <h1>Nouvel incident</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ouvert par l&apos;agence, par exemple après un appel du locataire. S&apos;il y a
          un bail actif sur le lot, le locataire suivra l&apos;incident depuis son espace.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent>
            <FormulaireIncident orgId={orgId} lots={lots} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Ce qui va se passer</CardTitle>
            <CardDescription>
              L&apos;incident arrive « à qualifier » : vous tranchez l&apos;imputation
              (qui paie) avec une justification opposable, le locataire en est informé
              immédiatement. Rien n&apos;est confié à un artisan sans imputation.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Le repère juridique affiché sous la catégorie est une information —
              la cause ne se déduit pas de la catégorie, c&apos;est vous qui tranchez.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
