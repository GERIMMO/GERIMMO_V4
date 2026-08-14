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

  const biensVisibles = (biens ?? []).map((bien) => ({
    ...bien,
    lotsVisibles: (bien.lots as LotResume[]).filter((l) => l.etat !== "archive"),
  }));
  const nbLots = biensVisibles.reduce((n, b) => n + b.lotsVisibles.length, 0);
  const nbLoues = biensVisibles.reduce(
    (n, b) => n + b.lotsVisibles.filter((l) => l.etat === "loue").length,
    0
  );

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Parc</h1>
        <div className="flex items-center gap-4">
          <span className="mono-discret">
            {biensVisibles.length} bien{biensVisibles.length > 1 ? "s" : ""} · {nbLots} lot
            {nbLots > 1 ? "s" : ""}
          </span>
          {/* Charte 04 : un seul bouton principal par écran. Sur un parc vide,
              c'est celui de l'état vide qui porte l'appel à l'action. */}
          {biensVisibles.length > 0 && (
            <Link href={`/agence/${orgId}/parc/nouveau`} className="btn-or">
              + Ajouter un bien
            </Link>
          )}
        </div>
      </div>

      {biensVisibles.length === 0 ? (
        <div className="colonne-liste">
          <div className="vide">
            <p className="font-medium text-foreground">Votre parc est vide</p>
            <p className="mx-auto mt-1 max-w-sm">
              Commencez par un bien : son lot naît avec lui, et c&apos;est le lot
              qui portera le bail.
            </p>
            <Link
              href={`/agence/${orgId}/parc/nouveau`}
              className={`${buttonVariants({ size: "sm" })} mt-3`}
            >
              Créer mon premier bien
            </Link>
          </div>
        </div>
      ) : (
        // Maquette (charte v2) : une seule colonne — l'adresse du bien en
        // en-tête de groupe, ses lots en rangs indentés dessous.
        <div className="colonne-liste">
          {biensVisibles.map((bien) => (
            <div key={bien.id}>
              <Link href={`/agence/${orgId}/parc/${bien.id}`} className="tete-groupe block">
                <span className="min-w-0">
                  <b className="block truncate text-[13.5px] font-medium">{bien.nom}</b>
                  <span className="mono-discret block truncate normal-case">
                    {TYPES_BIEN[bien.type] ?? bien.type} · {bien.address_line1},{" "}
                    {bien.postal_code} {bien.city}
                  </span>
                </span>
                <span className="puce puce-encre shrink-0">
                  {bien.lotsVisibles.filter((l) => l.etat === "loue").length}/
                  {bien.lotsVisibles.length} loué
                  {bien.lotsVisibles.filter((l) => l.etat === "loue").length > 1 ? "s" : ""}
                </span>
              </Link>
              {bien.lotsVisibles.map((lot) => (
                <Link
                  key={lot.id}
                  href={`/agence/${orgId}/parc/${bien.id}/lots/${lot.id}`}
                  className="rang-lot"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {lot.nom}
                    {lot.surface_m2 !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {formaterSurface(lot.surface_m2)}
                      </span>
                    )}
                  </span>
                  <span className={`${COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"} shrink-0`}>
                    {ETATS_LOT[lot.etat] ?? lot.etat}
                  </span>
                </Link>
              ))}
            </div>
          ))}
          <p className="mono-discret border-t border-border px-3.5 py-2 normal-case">
            {nbLoues}/{nbLots} lot{nbLots > 1 ? "s" : ""} loué{nbLoues > 1 ? "s" : ""} — cliquer
            un bien pour sa fiche, un lot pour le détail.
          </p>
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Catalogue d&apos;équipements</CardTitle>
          <CardDescription>
            La liste de l&apos;agence, cochée ensuite sur chaque lot — elle
            prépare la grille d&apos;état des lieux.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(equipements ?? []).length === 0 ? (
            // Un état vide doit dire quoi faire, ou à qui s'adresser quand on ne
            // peut pas le faire soi-même.
            <p className="text-sm text-muted-foreground">
              {["admin_agence", "proprietaire_direct"].includes(role)
                ? "Le catalogue est vide. Ajoutez un premier équipement ci-dessous : il sera proposé sur tous les lots."
                : "Le catalogue est vide. Un administrateur de l'agence peut le remplir."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(equipements ?? []).map((e) => (
                <span
                  key={e.id}
                  className={`puce ${e.actif ? "puce-encre" : "puce-grise line-through"}`}
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
