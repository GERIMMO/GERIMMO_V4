import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { FormulaireIncidentLocataire } from "./formulaire-incident-locataire";

export const metadata = { title: "Signaler un problème — Gerimmo" };

// Déclaration d'incident par le locataire (module 7 + module 19) : deux
// colonnes façon maquette pLocDeclarer — le formulaire à gauche, l'encart
// adaptatif « Qui paiera la réparation » à droite (les deux cartes vivent dans
// FormulaireIncidentLocataire, l'encart suivant la catégorie choisie).
export default async function PageSignalerIncident(
  props: PageProps<"/locataire/[orgId]/incident">
) {
  const { orgId } = await props.params;
  await verifierAccesEspaceLocataire(orgId);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/locataire/${orgId}`} className="hover:underline">
            Mon espace
          </Link>{" "}
          / Signaler un problème
        </p>
        <h1>Signaler un problème</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre gérant est prévenu immédiatement et vous saurez qui prend la
          réparation en charge après son examen.
        </p>
      </div>

      <FormulaireIncidentLocataire orgId={orgId} />
    </div>
  );
}
