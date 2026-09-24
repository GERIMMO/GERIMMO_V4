import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EchecLecture } from "../documents/echec-lecture";
import { FormulaireNouvelArtisan } from "./formulaires-artisan";
import { PaneArtisan } from "./pane-artisan";
import {
  COULEURS_PLATEFORME,
  COULEURS_SIRET,
  ETATS_SIRET,
  METIERS_ARTISAN,
  STATUTS_PLATEFORME,
} from "./referentiel";

// Même nom que l'entrée de menu et le raccourci des incidents (24/09).
export const metadata = { title: "Carnet d'artisans — Gerimmo" };

// LE CARNET D'ARTISANS DE L'AGENCE.
//
// Ce que l'écran montre, c'est la RELATION d'agence (artisan_agences) : les
// artisans rattachés à cette agence, actifs, désactivés ou sur sa liste noire.
// Le profil derrière (SIRET, métiers, zone, pièces, visibilité) est GLOBAL — il
// circule entre agences (RM-A1.8) — d'où deux conséquences visibles ici :
//   · l'agence crée la fiche, mais l'artisan la maîtrise ensuite (RM-8.2.1 :
//     c'est LUI qui dépose ses attestations ; RM-8.4.2 : LUI qui décide de sa
//     visibilité). L'écran ne propose donc ni dépôt de pièce ni bascule de
//     visibilité — ce ne sont pas des gestes d'agence ;
//   · la liste noire posée ici n'engage QUE cette agence (RM-8.5.2) ; blacklisté
//     chez vous, il reste proposé ailleurs.
//
// Les artisans de l'ANNUAIRE (publics, validés plateforme, non rattachés) ne
// sont pas dans ce carnet : ils apparaissent à l'affectation, depuis la fiche
// d'un incident, où la recherche les fait remonter avec leur score.

type RelationRang = {
  id: string;
  artisan_id: string;
  statut: string;
  blacklist_le: string | null;
  blacklist_motif: string | null;
  created_at: string;
};

type ProfilRang = {
  id: string;
  raison_sociale: string;
  siret: string;
  siret_etat: string;
  telephone: string;
  email: string | null;
  visibilite: string;
  statut_plateforme: string;
  blacklist_globale_le: string | null;
};

const VUES: { cle: string; libelle: string }[] = [
  { cle: "actifs", libelle: "Actifs" },
  { cle: "desactives", libelle: "Désactivés" },
  { cle: "liste-noire", libelle: "Liste noire" },
  { cle: "tous", libelle: "Tous" },
];

export default async function PageArtisans(props: PageProps<"/agence/[orgId]/artisans">) {
  const { orgId } = await props.params;
  const { vue: vueBrute, sel: selBrut } = (await props.searchParams) as {
    vue?: string;
    sel?: string;
  };
  const vue = VUES.some((v) => v.cle === vueBrute) ? vueBrute! : "actifs";
  const sel = typeof selBrut === "string" && selBrut ? selBrut : null;
  const { supabase, role } = await verifierAccesEspace(orgId);
  // artisan_statut_local et artisan_blacklist_locale sont réservées à
  // l'admin d'agence et au propriétaire direct : « l'agent simple ne
  // désactive pas ». L'écran le dit au lieu de laisser la base refuser.
  const estResponsable = ROLES_RESPONSABLES.includes(role);
  // Le propriétaire direct n'a pas d'agence (24/09) : l'écran lui parle de
  // son parc, comme le reste de son espace.
  const bailleurDirect = role === "proprietaire_direct";
  const chezVous = bailleurDirect ? "votre parc" : "votre agence";

  const { data: relationsBrutes, error: erreurRelations } = await supabase
    .from("artisan_agences")
    .select("id, artisan_id, statut, blacklist_le, blacklist_motif, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  const relations = (relationsBrutes ?? []) as RelationRang[];
  const ids = relations.map((r) => r.artisan_id);

  // Requêtes PLATES puis jointure en mémoire : `artisan_agences` porte deux
  // clés étrangères vers `artisans` du point de vue de PostgREST (la simple et
  // celles des tables voisines), et le produit a déjà payé le prix d'un embed
  // ambigu — une liste vide qui ressemble à « aucun artisan ».
  const [
    { data: profilsBruts, error: erreurProfils },
    { data: metiersBruts, error: erreurMetiers },
  ] = await Promise.all([
    ids.length
      ? supabase
          .from("artisans")
          .select(
            "id, raison_sociale, siret, siret_etat, telephone, email, visibilite, statut_plateforme, blacklist_globale_le"
          )
          .in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("artisan_metiers").select("artisan_id, metier").in("artisan_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profils = new Map(
    ((profilsBruts ?? []) as ProfilRang[]).map((p) => [p.id, p])
  );
  const metiersParArtisan = new Map<string, string[]>();
  for (const m of (metiersBruts ?? []) as { artisan_id: string; metier: string }[]) {
    metiersParArtisan.set(m.artisan_id, [...(metiersParArtisan.get(m.artisan_id) ?? []), m.metier]);
  }

  const filtres = {
    actifs: relations.filter((r) => r.statut === "actif" && !r.blacklist_le),
    desactives: relations.filter((r) => r.statut === "desactive" && !r.blacklist_le),
    "liste-noire": relations.filter((r) => Boolean(r.blacklist_le)),
    tous: relations,
  } as const;
  const visibles = filtres[vue as keyof typeof filtres];

  // Carnet vide (24/09) : ni compteur ni filtres — quatre pastilles à zéro
  // menant toutes à la même vue vide ne disent rien de plus que « Carnet vide ».
  const carnetVide = relations.length === 0 && !erreurRelations;

  const lecturesManquees = [
    erreurRelations && "votre carnet d'artisans",
    erreurProfils && "les fiches des artisans",
    erreurMetiers && "les métiers des artisans",
  ].filter((q): q is string => Boolean(q));

  // Un onglet ne chiffre que ce qu'il a pu lire (même règle que la liste des
  // incidents) : « Actifs · 0 » sur une lecture refusée serait un mensonge.
  const compteVue = (cle: string) =>
    erreurRelations ? "—" : String(filtres[cle as keyof typeof filtres].length);

  const lien = (vueCible: string, selCible: string | null) => {
    const params = new URLSearchParams();
    if (vueCible !== "actifs") params.set("vue", vueCible);
    if (selCible) params.set("sel", selCible);
    const q = params.toString();
    return `/agence/${orgId}/artisans${q ? `?${q}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      {/* L'en-tête standard de l'espace (tour du 24/09) : titre, mention et
          action, sans fil d'Ariane — le menu dit déjà où l'on est. La phrase
          d'aide passe sous le filet, comme sur « Loyers & charges ». */}
      <div className="mb-6">
        <div className="entete-page">
          <h1>Carnet d&apos;artisans</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-discret">
              {erreurRelations
                ? "carnet indisponible"
                : carnetVide
                  ? "carnet vide"
                  : `${filtres.actifs.length} actif${filtres.actifs.length > 1 ? "s" : ""} sur ${relations.length}`}
            </span>
            {/* L'action principale dans l'en-tête, comme « Ouvrir un incident »
                (24/09). Sous 900 px le formulaire vient après toute la liste ;
                une fiche ouverte le masque : le lien referme la fiche. */}
            <Link href={`${lien(vue, null)}#nouvel-artisan`} className="btn-or">
              + Enregistrer un artisan
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Votre carnet : les entreprises rattachées à {chezVous}. On les
          sollicite depuis la fiche d&apos;un incident, jamais d&apos;ici.
        </p>
      </div>

      <EchecLecture quoi={lecturesManquees} />

      <div className={`split${sel ? " detail-actif" : ""}`}>
        <div className="colonne-liste-split volet-liste">
          {(!carnetVide || sel) && (
            <div className="tete-liste">
              {/* Le chiffre est porté par la pastille active et la mention
                  d'en-tête : ici, seulement le nom de la vue (24/09). */}
              <span className="mono-discret">
                {carnetVide ? "" : VUES.find((v) => v.cle === vue)!.libelle}
              </span>
              {sel && (
                <Link href={lien(vue, null)} className="lien-discret inline-flex items-center gap-1.5">
                  Fermer
                  <IndicateurLien />
                </Link>
              )}
            </div>
          )}
          {/* Même grille de filtres que les incidents (tour du 24/09) : en
              flux, la quatrième pastille restait seule sur sa ligne. */}
          {!carnetVide && (
            <div className="grid grid-cols-2 gap-1.5 border-b border-border px-3 py-2 sm:max-[900px]:grid-cols-4">
              {VUES.map((v) => (
                <Link
                  key={v.cle}
                  href={lien(v.cle, sel)}
                  className={`filtre inline-flex items-center justify-center gap-1.5${vue === v.cle ? " actif" : ""}`}
                >
                  {v.libelle} · {compteVue(v.cle)}
                  <IndicateurLien />
                </Link>
              ))}
            </div>
          )}

          {visibles.length === 0 && erreurRelations ? (
            <div className="p-3.5">
              <EchecLecture quoi={["la liste de vos artisans"]} />
            </div>
          ) : visibles.length === 0 ? (
            <div className="vide-guide">
              <p className="titre">
                {relations.length === 0 ? "Carnet vide" : "Rien dans cette vue"}
              </p>
              <p className="explication">
                {relations.length === 0
                  ? "Enregistrez une entreprise avec le formulaire «\u00a0Enregistrer un artisan\u00a0», ou laissez la recherche d'affectation vous proposer un artisan de l'annuaire Gerimmo depuis la fiche d'un incident."
                  : `Vos ${relations.length} artisans sont dans les autres onglets.`}
              </p>
            </div>
          ) : (
            visibles.map((r) => {
              const p = profils.get(r.artisan_id);
              const metiers = metiersParArtisan.get(r.artisan_id) ?? [];
              const actif = r.artisan_id === sel;
              return (
                <Link
                  key={r.id}
                  href={lien(vue, r.artisan_id)}
                  className={`rang${actif ? " actif" : ""}`}
                  aria-current={actif ? "true" : undefined}
                >
                  <span className="min-w-0 flex-1">
                    {/* Un profil illisible ≠ un profil absent : la RLS du profil
                        global passe par artisan_lisible(), pas par l'agence. */}
                    <b className="block truncate">
                      {p?.raison_sociale ?? "Fiche non lisible"}
                    </b>
                    <small className="block truncate">
                      {metiers.length
                        ? metiers.map((m) => METIERS_ARTISAN[m] ?? m).join(" · ")
                        : "aucun métier renseigné"}
                    </small>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-1.5">
                      <IndicateurLien />
                      {r.blacklist_le ? (
                        <span className="puce puce-rouge">Liste noire</span>
                      ) : r.statut === "desactive" ? (
                        <span className="puce puce-grise">Désactivé</span>
                      ) : p ? (
                        <span
                          className={
                            COULEURS_PLATEFORME[p.statut_plateforme] ?? "puce puce-grise"
                          }
                        >
                          {/* Même libellé que la fiche (24/09) : le
                              référentiel est la seule source. */}
                          {STATUTS_PLATEFORME[p.statut_plateforme] ?? p.statut_plateforme}
                        </span>
                      ) : null}
                    </span>
                    {p && (
                      <span className={COULEURS_SIRET[p.siret_etat] ?? "puce puce-grise"}>
                        {ETATS_SIRET[p.siret_etat] ?? p.siret_etat}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })
          )}
        </div>

        {sel ? (
          <div className="min-w-0">
            <Link href={lien(vue, null)} className="retour-liste mb-2">
              ← Tous les artisans
            </Link>
            <PaneArtisan
              orgId={orgId}
              artisanId={sel}
              estResponsable={estResponsable}
              bailleurDirect={bailleurDirect}
              relation={relations.find((r) => r.artisan_id === sel) ?? null}
            />
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <Card id="nouvel-artisan" className="scroll-mt-20">
              <CardHeader>
                <CardTitle className="text-base">Enregistrer un artisan</CardTitle>
                <CardDescription>
                  Vous posez l&apos;identité et le périmètre ; l&apos;artisan
                  déposera lui-même ses attestations et choisira sa visibilité.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormulaireNouvelArtisan orgId={orgId} />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <b className="text-foreground">Validation Gerimmo.</b> Un artisan
                  n&apos;est proposé à l&apos;affectation qu&apos;une fois validé
                  par la plateforme et son SIRET vérifié. Cette décision ne
                  vous appartient pas — elle porte sur le droit d&apos;exister
                  chez Gerimmo, pas sur un chantier.
                </p>
                <p>
                  <b className="text-foreground">Décennale.</b> Vous n&apos;avez pas
                  à surveiller ses attestations : la recherche d&apos;affectation ne
                  vous propose que des artisans à jour pour la nature des travaux
                  demandée, et le contrôle est refait au moment de retenir le devis.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
