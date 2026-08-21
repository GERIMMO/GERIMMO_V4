import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireIncidentLocataire } from "./formulaire-incident-locataire";

export const metadata = { title: "Signaler un problème — Gerimmo" };

// Déclaration d'incident par le locataire (module 7 + module 19) : la photo
// est proposée avant la description — « il photographie sur le vif ».
export default async function PageSignalerIncident(
  props: PageProps<"/locataire/[orgId]/incident">
) {
  const { orgId } = await props.params;
  await verifierAccesEspaceLocataire(orgId);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-[1.125rem] p-4 sm:p-7">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Votre signalement</CardTitle>
          <CardDescription>
            Une ou deux photos prises sur le vif évitent souvent un déplacement
            pour rien.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireIncidentLocataire orgId={orgId} />
        </CardContent>
      </Card>
    </main>
  );
}
