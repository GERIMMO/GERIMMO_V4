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
import { EchecLecture } from "../../documents/echec-lecture";
import { FormulaireIncident } from "./formulaire-incident";

export const metadata = { title: "Déclarer un incident — Gerimmo" };

export default async function PageNouvelIncident(
  props: PageProps<"/agence/[orgId]/incidents/nouveau">
) {
  const { orgId } = await props.params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);

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
      {/* L'en-tête de l'espace (25/09, D09) : cette page avait un fil
          d'Ariane et un titre nu, seule de son genre — `.entete-page` comme
          ses sœurs, le retour au-dessus, la phrase dessous. Un seul verbe par
          persona (D25) : « déclarer », celui du menu. */}
      <div className="mb-6">
        <Link href={`/agence/${orgId}/incidents`} className="lien-discret text-[13px]">
          ← Incidents
        </Link>
        <div className="entete-page mt-2">
          <h1>Déclarer un incident</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {/* Les mots du propriétaire, pas ceux du gestionnaire d'agence
              (25/09, D06) : il saisit lui-même, après l'appel de son locataire. */}
          {estProprietaire
            ? "Vous le saisissez vous-même, par exemple après un appel de votre locataire. S'il a un bail actif, il suivra l'incident depuis son espace."
            : "Ouvert par le gestionnaire, par exemple après un appel du locataire. S'il y a un bail actif sur le lot, le locataire suivra l'incident depuis son espace."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent>
            {/* Un échec de lecture ne doit pas se déguiser en sélecteur vide
                (audit 09/09). `.vide` disait « rien à afficher » là où il
                fallait dire « je n'ai pas pu lire » : c'est l'encart d'échec
                de la zone, le même que partout ailleurs. */}
            {erreurLots ? (
              <EchecLecture quoi={["les lots du parc"]} />
            ) : (
              <FormulaireIncident orgId={orgId} lots={lots} estProprietaire={estProprietaire} />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Ce qui va se passer</CardTitle>
            <CardDescription>
              {estProprietaire
                ? "Une fois déclaré, vous dites qui paie la réparation — vous ou le locataire — en expliquant pourquoi ; il en est prévenu aussitôt. Rien n'est confié à un artisan avant."
                : "L'incident arrive « à qualifier » : vous tranchez l'imputation (qui paie) avec une justification opposable, le locataire en est informé immédiatement. Rien n'est confié à un artisan sans imputation."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              {estProprietaire
                ? "Le repère juridique affiché sous la catégorie est une information — la cause ne se déduit pas de la catégorie, c'est vous qui décidez."
                : "Le repère juridique affiché sous la catégorie est une information — la cause ne se déduit pas de la catégorie, c'est vous qui tranchez."}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
