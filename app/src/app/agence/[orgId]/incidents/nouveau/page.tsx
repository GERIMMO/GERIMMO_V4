import Link from "next/link";
import { TitreEcran } from "@/components/titre-ecran";
import { verifierAccesEspace } from "@/lib/espace";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { nomComplet } from "@/lib/roles-personnes";
import { piecesIncidentDuLot } from "@/lib/incidents";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EchecLecture } from "../../documents/echec-lecture";
import { FormulaireIncident } from "./formulaire-incident";
import { baseEspace } from "@/lib/racine-espace";
import { comparerNaturel } from "@/lib/tri-naturel";

export const metadata = { title: "Déclarer un incident — Gerimmo" };

export default async function PageNouvelIncident(
  props: PageProps<"/agence/[orgId]/incidents/nouveau">
) {
  const { orgId } = await props.params;
  const { lot: lotDemande } = await props.searchParams;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);

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
  // FL-01 (audit PR #264) : ce que l'on sait déjà du lot sert au formulaire.
  // Les baux en cours disent QUI suivra l'incident — en colocation à baux
  // individuels, le gérant choisit la chambre, sinon aucun colocataire ne le
  // voit ; les chambres et pièces du lot complètent la liste générique.
  const [
    { data: bauxBruts, error: erreurBaux },
    { data: chambresBrutes, error: erreurChambres },
    { data: piecesBrutes, error: erreurPieces },
  ] = await Promise.all([
    supabase
      .from("baux")
      .select("id, lot_id, chambre:lot_chambres!baux_chambre_meme_lot_fk(nom), locataire:persons!baux_locataire_meme_org_fk(nom, prenom)")
      .eq("organization_id", orgId)
      .in("etat", ["actif", "preavis"]),
    supabase.from("lot_chambres").select("lot_id, nom").eq("organization_id", orgId).order("nom"),
    supabase.from("lot_pieces").select("lot_id, nom, ordre").eq("organization_id", orgId).order("ordre"),
  ]);
  const baux = (bauxBruts ?? []) as unknown as {
    id: string;
    lot_id: string;
    chambre: UnOuPlusieurs<{ nom: string }>;
    locataire: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
  }[];
  const lots = ((lotsBruts ?? []) as unknown as {
    id: string;
    nom: string;
    etat: string;
    bien: UnOuPlusieurs<{ nom: string }>;
  }[])
    // Par immeuble, puis par lot, dans l'ordre des numéros (DOC-14).
    .sort((a, b) => comparerNaturel(premier(a.bien)?.nom ?? "", premier(b.bien)?.nom ?? "") || comparerNaturel(a.nom, b.nom))
    .map((l) => ({
    id: l.id,
    libelle: `${l.nom} — ${premier(l.bien)?.nom ?? ""}`,
    baux: baux
      .filter((b) => b.lot_id === l.id)
      .map((b) => {
        const locataire = premier(b.locataire);
        return {
          id: b.id,
          libelle: [premier(b.chambre)?.nom ?? "Logement entier", locataire ? nomComplet(locataire) : null]
            .filter(Boolean)
            .join(" — "),
        };
      })
      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
    pieces: piecesIncidentDuLot(
      ((chambresBrutes ?? []) as { lot_id: string; nom: string }[]).filter((c) => c.lot_id === l.id).map((c) => c.nom),
      ((piecesBrutes ?? []) as { lot_id: string; nom: string }[]).filter((p) => p.lot_id === l.id).map((p) => p.nom),
    ),
  }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      {/* L'en-tête de l'espace (25/09, D09) : cette page avait un fil
          d'Ariane et un titre nu, seule de son genre — `.entete-page` comme
          ses sœurs, le retour au-dessus, la phrase dessous. Un seul verbe par
          persona (D25) : « déclarer », celui du menu. */}
      <div className="mb-6">
        {/* Le retour « ← Parent » dans le style de la fiche du bien (nuit du
            25 au 26/09) : un seul style de retour dans l'espace. */}
        <Link
          href={`${base}/incidents`}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
        >
          ← Incidents
        </Link>
        <div className="entete-page">
          <TitreEcran rubrique="incidents">Déclarer un incident</TitreEcran>
        </div>
        <p className="text-sm text-muted-foreground">
          {/* Les mots du propriétaire, pas ceux du gestionnaire d'agence
              (25/09, D06) : il saisit lui-même, après l'appel de son locataire. */}
          {estProprietaire
            ? "Décrivez le problème. Le locataire du bail concerné pourra le suivre depuis son espace."
            : "Ouvert par le gestionnaire, par exemple après un appel du locataire. Le locataire du bail concerné suivra l'incident depuis son espace."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent>
            {/* Un échec de lecture ne doit pas se déguiser en sélecteur vide
                (audit 09/09). `.vide` disait « rien à afficher » là où il
                fallait dire « je n'ai pas pu lire » : c'est l'encart d'échec
                de la zone, le même que partout ailleurs. */}
            {/* Sans les baux du lot, le formulaire ne saurait plus demander la
                chambre en colocation : il ne s'ouvre pas sur une lecture partielle. */}
            {erreurLots || erreurBaux || erreurChambres || erreurPieces ? (
              <EchecLecture quoi={[erreurLots ? "les lots du parc" : "les baux, chambres et pièces des lots"]} />
            ) : (
              <FormulaireIncident orgId={orgId} lots={lots} lotInitial={lots.find(l => l.id === lotDemande)?.id} estProprietaire={estProprietaire} />
            )}
          </CardContent>
        </Card>

        <Card className="carte-rubrique h-fit" data-ton={estProprietaire ? undefined : "or"}>
          <CardHeader>
            <CardTitle className="text-base">{estProprietaire ? "Après la déclaration" : "Ce qui va se passer"}</CardTitle>
            <CardDescription>
              {estProprietaire
                ? "Décidez ensuite qui paie la réparation et expliquez pourquoi. Le locataire reçoit votre décision avant toute sollicitation d’un artisan."
                : "L'incident arrive « à qualifier » : vous tranchez l'imputation (qui paie) avec une justification opposable, le locataire en est informé immédiatement. Rien n'est confié à un artisan sans imputation."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              {estProprietaire
                ? "Le repère juridique est indicatif : la catégorie ne suffit pas à déterminer qui paie."
                : "Le repère juridique affiché sous la catégorie est une information — la cause ne se déduit pas de la catégorie, c'est vous qui tranchez."}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
