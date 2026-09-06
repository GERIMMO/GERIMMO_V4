import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { FormulaireIncidentLocataire } from "./formulaire-incident-locataire";

export const metadata = { title: "Nouveau signalement — Gerimmo" };

// Déclaration d'incident par le locataire (module 7 + module 19) : deux
// colonnes façon maquette pLocDeclarer — le formulaire à gauche, l'encart
// adaptatif « Qui paiera la réparation » à droite (les deux cartes vivent dans
// FormulaireIncidentLocataire, l'encart suivant la catégorie choisie).
export default async function PageSignalerIncident(
  props: PageProps<"/locataire/[orgId]/incident">
) {
  const { orgId } = await props.params;
  const { adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/locataire/${orgId}`} className="hover:underline">
            Mon espace
          </Link>{" "}
          / Signaler un problème
        </p>
        <h1>Nouveau signalement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre gestionnaire est prévenu immédiatement et vous saurez qui prend la
          réparation en charge après son examen.
        </p>
      </div>

      {adhesionActive ? (
        <FormulaireIncidentLocataire orgId={orgId} />
      ) : (
        <div className="loc-carte">
          <p className="text-sm text-muted-foreground">
            Votre bail est terminé : la déclaration d&apos;incident est fermée.
            Vos anciens signalements restent consultables dans{" "}
            <Link href={`/locataire/${orgId}/demandes`} className="lien-discret">
              Mes demandes
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
