import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { resumerBlocage } from "@/lib/echeances";
import { TYPES_BIEN, ETATS_LOT, COULEURS_ETAT_LOT, formaterSurface } from "@/lib/parc";
import { Donut, LegendeDonut } from "@/components/graphes";
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
import { PaneParc, lireSelection } from "./pane-parc";

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
  // Maquette : la sélection (?sel=bien:… | lot:…) s'ouvre dans le panneau de
  // droite ; sans sélection, la vue d'ensemble. Un changement de searchParams
  // ne re-déclenche pas loading.tsx : les rangs portent un IndicateurLien.
  const { sel } = (await props.searchParams) as { sel?: string | string[] };
  const selection = lireSelection(sel);
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
    // Aperçu (maquette) : le quittancement mensuel des baux en cours
    supabase
      .from("baux")
      .select("loyer_hc, charges")
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
  const tousLots = biensVisibles.flatMap((b) =>
    b.lotsVisibles.map((l) => ({ ...l, bien_id: b.id }))
  );
  const enPreparation = tousLots.filter((l) => l.etat === "brouillon");
  const tauxOccupation = nbLots ? Math.round((nbLoues / nbLots) * 100) : 0;
  const quittancement = (bauxActifs ?? []).reduce(
    (s, b) => s + Number(b.loyer_hc) + Number(b.charges),
    0
  );
  const segmentsParc = [
    { libelle: "Loués", valeur: nbLoues, couleur: "var(--success)" },
    {
      libelle: "Disponibles",
      valeur: tousLots.filter((l) => l.etat === "disponible").length,
      couleur: "var(--or)",
    },
    { libelle: "En préparation", valeur: enPreparation.length, couleur: "var(--warning)" },
  ];

  // « Éléments à compléter » (maquette) : les motifs de blocage de mise en
  // location, agrégés sur les lots en préparation, triés du plus fréquent.
  const listesBlocages = ((blocagesParc ?? []) as { lot_id: string; blocages: string[] | null }[]).map(
    (b) => b.blocages ?? []
  );
  const parMotif = new Map<string, number>();
  for (const motifs of listesBlocages) {
    for (const motif of motifs) {
      const cle = resumerBlocage(motif);
      parMotif.set(cle, (parMotif.get(cle) ?? 0) + 1);
    }
  }
  const motifsTries = [...parMotif.entries()].sort((a, b) => b[1] - a[1]);
  const totalBlocages = motifsTries.reduce((s, [, n]) => s + n, 0);
  const maxMotif = Math.max(1, ...motifsTries.map(([, n]) => n));

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>{estProprietaire ? "Mes lots" : "Parc"}</h1>
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
        // Maquette (charte v2) : maître-détail — la liste des lots regroupés
        // par bien à gauche (adresse en en-tête de groupe, lots indentés) ; à
        // droite la sélection (recette 30/08 : comme la maquette, on ne quitte
        // plus le Parc pour lire un bien ou un lot), sinon la vue d'ensemble.
        <div className="split">
          <div className="colonne-liste-split">
            <div className="tete-liste">
              <span className="mono-discret">Lots</span>
              {selection ? (
                <Link href={`/agence/${orgId}/parc`} className="lien-discret text-xs">
                  Vue d&apos;ensemble
                  <IndicateurLien />
                </Link>
              ) : (
                <span className="mono-discret">
                  {nbLoues}/{nbLots} loué{nbLoues > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {biensVisibles.map((bien) => (
              <div key={bien.id}>
                <Link
                  href={`/agence/${orgId}/parc?sel=bien:${bien.id}`}
                  className={`tete-groupe${selection?.type === "bien" && selection.id === bien.id ? " actif" : ""}`}
                >
                  <span className="min-w-0">
                    <b className="block truncate text-[13.5px] font-medium">{bien.nom}</b>
                    <span className="mono-discret block truncate normal-case">
                      {TYPES_BIEN[bien.type] ?? bien.type} · {bien.address_line1},{" "}
                      {bien.postal_code} {bien.city}
                    </span>
                  </span>
                  <span className="puce puce-encre shrink-0">
                    {bien.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis").length}
                    /{bien.lotsVisibles.length} loué
                    {bien.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis")
                      .length > 1
                      ? "s"
                      : ""}
                  </span>
                  <IndicateurLien />
                </Link>
                {bien.lotsVisibles.map((lot) => (
                  <Link
                    key={lot.id}
                    href={`/agence/${orgId}/parc?sel=lot:${lot.id}`}
                    className={`rang-lot${selection?.type === "lot" && selection.id === lot.id ? " actif" : ""}`}
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
                    <span
                      className={`${COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"} shrink-0`}
                    >
                      {ETATS_LOT[lot.etat] ?? lot.etat}
                    </span>
                    <IndicateurLien />
                  </Link>
                ))}
              </div>
            ))}
          </div>

          {selection ? (
            <PaneParc supabase={supabase} orgId={orgId} selection={selection} />
          ) : (
          /* Aperçu du parc (maquette apercuParc) : KPI, répartition, blocages */
          <div className="min-w-0 space-y-3.5">
            <p className="text-sm text-muted-foreground">
              Sélectionnez un bien ou un lot dans la liste pour le lire ici, ou
              traitez ce qui bloque ci-dessous.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="kpi or">
                <span className="eyebrow">Occupation</span>
                <span className="chiffre block">{tauxOccupation} %</span>
                <span className="block text-xs text-muted-foreground">
                  {nbLoues} loué{nbLoues > 1 ? "s" : ""} sur {nbLots}
                </span>
              </div>
              <div className="kpi">
                <span className="eyebrow">À finaliser</span>
                <span className="chiffre block">{enPreparation.length}</span>
                <span className="block text-xs text-muted-foreground">
                  {totalBlocages} élément{totalBlocages > 1 ? "s" : ""} manquant
                  {totalBlocages > 1 ? "s" : ""}
                </span>
              </div>
              <div className="kpi bleu">
                <span className="eyebrow">Quittancement</span>
                <span className="chiffre block">
                  {quittancement.toLocaleString("fr-FR")} €
                </span>
                <span className="block text-xs text-muted-foreground">
                  par mois, baux en cours
                </span>
              </div>
            </div>
            <div className="grid gap-3.5 lg:grid-cols-2">
              <Card>
                <CardContent>
                  <div className="entete-carte">
                    <h3 className="text-[1.05rem]">Répartition du parc</h3>
                  </div>
                  <div className="bloc-graph">
                    <Donut
                      segments={segmentsParc}
                      centre={`${tauxOccupation} %`}
                      sous="LOUÉS"
                    />
                    <LegendeDonut segments={segmentsParc} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="entete-carte">
                    <h3 className="text-[1.05rem]">Éléments à compléter</h3>
                    <span className="mono-discret">{totalBlocages} au total</span>
                  </div>
                  {motifsTries.length === 0 ? (
                    <p className="text-sm text-success-soft-foreground">
                      Tous vos lots sont prêts à la location. Rien à compléter.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {motifsTries.map(([motif, n]) => (
                        <div key={motif}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate">{motif}</span>
                            <span className="mono-discret">{n}</span>
                          </div>
                          <span className="barre block" style={{ height: 7 }}>
                            <i
                              style={{
                                width: `${Math.round((n / maxMotif) * 100)}%`,
                                background: "var(--warning)",
                              }}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          )}
        </div>
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
