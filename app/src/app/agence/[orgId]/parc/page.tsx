import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { TYPES_BIEN, ETATS_LOT, COULEURS_ETAT_LOT, formaterSurface } from "@/lib/parc";
import { nomComplet } from "@/lib/roles-personnes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { FormulaireEquipementCatalogue } from "./formulaire-equipement-catalogue";
import { DetailLotParc } from "./detail-lot";

export const metadata = { title: "Parc — Gerimmo" };

type LotResume = {
  id: string;
  nom: string;
  etat: string;
  surface_m2: number | null;
};

// Dégradés des vignettes de bien (maquette v3) : déterministes par position.
const DEGRADES = [
  "linear-gradient(135deg, #14304f, #2f6fb0)",
  "linear-gradient(135deg, #1d3f63, #b08d3e)",
  "linear-gradient(135deg, #2f6fb0, #14304f)",
  "linear-gradient(135deg, #35506f, #c0392b)",
  "linear-gradient(135deg, #14304f, #35506f)",
  "linear-gradient(135deg, #233c58, #2f6fb0)",
];

function lireParam(brut: string | string[] | undefined): string | null {
  return typeof brut === "string" && brut ? brut : null;
}

// Le parc de l'agence en accordéon (maquette v3) : chaque bien se déplie sur
// ses lots, chaque lot sur son détail complet, sans quitter la page.
// L'état ouvert vit dans l'URL (?bien=…&lot=…) : rendu serveur, liens directs
// partageables, et les rangs portent un IndicateurLien pendant la navigation.
export default async function PageParc(props: PageProps<"/agence/[orgId]/parc">) {
  const { orgId } = await props.params;
  const sp = (await props.searchParams) as { bien?: string | string[]; lot?: string | string[] };
  const lotOuvert = lireParam(sp.lot);
  const { supabase, role, estProprietaire } = await verifierAccesEspace(orgId);

  const [{ data: biens }, { data: equipements }, { data: bauxActifs }, { data: blocagesParc }] =
    await Promise.all([
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
    // L'occupant de chaque lot loué, pour la ligne du lot dans l'accordéon
    supabase
      .from("baux")
      .select("lot_id, locataire:persons!baux_locataire_meme_org_fk(nom, prenom)")
      .eq("organization_id", orgId)
      .in("etat", ["actif", "preavis"]),
    // Motifs de blocage de tous les lots en préparation, en un aller-retour (perf 30/08)
    supabase.rpc("lots_blocages_location", { p_org: orgId }),
  ]);

  const biensVisibles = (biens ?? []).map((bien) => ({
    ...bien,
    lotsVisibles: (bien.lots as LotResume[]).filter((l) => l.etat !== "archive"),
  }));
  const nbLots = biensVisibles.reduce((n, b) => n + b.lotsVisibles.length, 0);
  const nbLoues = biensVisibles.reduce(
    (n, b) => n + b.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis").length,
    0
  );
  const occupantParLot = new Map(
    (bauxActifs ?? []).map((b) => [
      b.lot_id as string,
      premier(b.locataire as UnOuPlusieurs<{ nom: string; prenom: string | null }>),
    ])
  );
  const blocagesParLot = new Map(
    ((blocagesParc ?? []) as { lot_id: string; blocages: string[] | null }[]).map((b) => [
      b.lot_id,
      (b.blocages ?? []).length,
    ])
  );

  // Un lot ouvert déplie toujours son bien ; sinon, ?bien= fait foi.
  const bienDuLot = lotOuvert
    ? biensVisibles.find((b) => b.lotsVisibles.some((l) => l.id === lotOuvert))?.id ?? null
    : null;
  const bienOuvert = bienDuLot ?? lireParam(sp.bien);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="entete-page mb-4">
        <h1>{estProprietaire ? "Mes lots" : "Parc"}</h1>
        <div className="flex items-center gap-4">
          <span className="mono-discret">
            {biensVisibles.length} bien{biensVisibles.length > 1 ? "s" : ""} · {nbLots} lot
            {nbLots > 1 ? "s" : ""} · {nbLoues} loué{nbLoues > 1 ? "s" : ""}
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
        <>
          <p className="mb-4 max-w-xl text-sm text-muted-foreground">
            Cliquez sur un bien pour voir ses lots, puis sur un lot pour le
            détail complet.
          </p>
          <div className="liste-parc">
            {biensVisibles.map((bien, ix) => {
              const ouvert = bienOuvert === bien.id;
              const loues = bien.lotsVisibles.filter(
                (l) => l.etat === "loue" || l.etat === "preavis"
              ).length;
              const initiale = (bien.nom.replace(/^\d+\s*/, "").charAt(0) || "G").toUpperCase();
              return (
                <div key={bien.id} className={`bloc-bien${ouvert ? " ouvert" : ""}`}>
                  <Link
                    href={ouvert ? `/agence/${orgId}/parc` : `/agence/${orgId}/parc?bien=${bien.id}`}
                    className="tete-bien"
                    aria-expanded={ouvert}
                  >
                    <span className="chevron" aria-hidden>
                      {ouvert ? "▾" : "▸"}
                    </span>
                    <span className="vignette" style={{ background: DEGRADES[ix % DEGRADES.length] }}>
                      {initiale}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-medium">{bien.nom}</b>
                      <span className="mono-discret block truncate normal-case">
                        {bien.city} · {TYPES_BIEN[bien.type] ?? bien.type} ·{" "}
                        {bien.lotsVisibles.length} lot{bien.lotsVisibles.length > 1 ? "s" : ""}
                      </span>
                    </span>
                    <span
                      className={`puce shrink-0 ${loues === bien.lotsVisibles.length && loues > 0 ? "puce-loue" : loues ? "puce-encre" : "puce-prep"}`}
                    >
                      {loues}/{bien.lotsVisibles.length} loué{bien.lotsVisibles.length > 1 ? "s" : ""}
                    </span>
                    <IndicateurLien />
                  </Link>
                  {ouvert && (
                    <div className="lots-bien">
                      {bien.lotsVisibles.map((lot) => {
                        const lotEstOuvert = lotOuvert === lot.id;
                        const occupant = occupantParLot.get(lot.id);
                        const nbManquants = blocagesParLot.get(lot.id) ?? 0;
                        return (
                          <div key={lot.id} className={`bloc-lot${lotEstOuvert ? " ouvert" : ""}`}>
                            <Link
                              href={
                                lotEstOuvert
                                  ? `/agence/${orgId}/parc?bien=${bien.id}`
                                  : `/agence/${orgId}/parc?bien=${bien.id}&lot=${lot.id}`
                              }
                              className="tete-lot"
                              aria-expanded={lotEstOuvert}
                            >
                              <span className="chevron" aria-hidden>
                                {lotEstOuvert ? "▾" : "▸"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <b className="block truncate text-[13px] font-medium">{lot.nom}</b>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {[
                                    lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : null,
                                    occupant ? nomComplet(occupant) : "libre",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </span>
                              {nbManquants > 0 && (
                                <span className="puce puce-prep shrink-0">
                                  {nbManquants} manquant{nbManquants > 1 ? "s" : ""}
                                </span>
                              )}
                              <span
                                className={`${COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"} shrink-0`}
                              >
                                {ETATS_LOT[lot.etat] ?? lot.etat}
                              </span>
                              <IndicateurLien />
                            </Link>
                            {lotEstOuvert && (
                              <div className="detail-lot">
                                <DetailLotParc supabase={supabase} orgId={orgId} lotId={lot.id} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <Link
                        href={`/agence/${orgId}/parc/${bien.id}`}
                        className="lien-discret px-1.5 py-1 text-[12.5px]"
                      >
                        Ouvrir la fiche du bien (adresse, copropriété, diagnostics…) ›
                        <IndicateurLien />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Catalogue d&apos;équipements</CardTitle>
          <CardDescription>
            {estProprietaire ? "Votre liste" : "La liste de l'agence"}, cochée
            ensuite sur chaque lot — elle prépare la grille d&apos;état des lieux.
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
