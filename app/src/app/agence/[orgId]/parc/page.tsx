import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { TYPES_BIEN, ETATS_LOT, COULEURS_ETAT_LOT, formaterSurface } from "@/lib/parc";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireEquipementCatalogue } from "./formulaire-equipement-catalogue";

export const metadata = { title: "Parc — Gerimmo" };

type LotResume = {
  id: string;
  nom: string;
  etat: string;
  surface_m2: number | null;
};

// Le parc de l'agence : chaque bien et ses lots (RM-0.1.2 : tout bien a au
// moins un lot ; le multi-lots reste discret tant qu'on ne découpe pas).
export default async function PageParc(props: PageProps<"/agence/[orgId]/parc">) {
  const { orgId } = await props.params;
  const { supabase, role } = await verifierAccesEspace(orgId);

  const [{ data: biens }, { data: equipements }] = await Promise.all([
    supabase
      .from("biens")
      // !lots_bien_id_fkey : depuis les FK composites (revue 2), deux relations
      // lient lots à biens — sans ce choix explicite, PostgREST refuse la jointure
      .select(
        "id, nom, type, address_line1, postal_code, city, lots!lots_bien_id_fkey(id, nom, etat, surface_m2)"
      )
      .eq("organization_id", orgId)
      .order("nom"),
    supabase
      .from("equipements_catalogue")
      .select("id, nom, actif")
      .eq("organization_id", orgId)
      .order("nom"),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Parc</h1>
        <Link
          href={`/agence/${orgId}/parc/nouveau`}
          className={buttonVariants({ size: "sm" })}
        >
          Nouveau bien
        </Link>
      </div>

      {(biens ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aucun bien dans le parc. Créez le premier : son lot unique naît avec
            lui.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(biens ?? []).map((bien) => (
            <Link key={bien.id} href={`/agence/${orgId}/parc/${bien.id}`} className="block">
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{bien.nom}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {TYPES_BIEN[bien.type] ?? bien.type} · {bien.address_line1},{" "}
                      {bien.postal_code} {bien.city}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(bien.lots as LotResume[])
                      .filter((l) => l.etat !== "archive")
                      .map((lot) => (
                        <span
                          key={lot.id}
                          className={`rounded-full px-2 py-0.5 text-xs ${COULEURS_ETAT_LOT[lot.etat] ?? ""}`}
                        >
                          {lot.nom} · {ETATS_LOT[lot.etat] ?? lot.etat}
                          {lot.surface_m2 !== null && ` · ${formaterSurface(lot.surface_m2)}`}
                        </span>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Équipements (liste fermée)</CardTitle>
          <CardDescription>
            Le catalogue de l&apos;agence, coché ensuite sur chaque lot — il
            prépare la grille d&apos;état des lieux (RM-0.5.5).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(equipements ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun équipement au catalogue.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(equipements ?? []).map((e) => (
                <span
                  key={e.id}
                  className={`rounded-full border border-border px-2 py-0.5 text-xs ${e.actif ? "" : "opacity-50 line-through"}`}
                >
                  {e.nom}
                </span>
              ))}
            </div>
          )}
          {["admin_agence", "proprietaire_direct"].includes(role) && (
            <FormulaireEquipementCatalogue orgId={orgId} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
