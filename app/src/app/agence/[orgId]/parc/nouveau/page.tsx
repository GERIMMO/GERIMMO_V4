import { verifierAccesEspace } from "@/lib/espace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireBien } from "../formulaire-bien";

export const metadata = { title: "Nouveau bien — Gerimmo" };

export default async function PageNouveauBien(
  props: PageProps<"/agence/[orgId]/parc/nouveau">
) {
  const { orgId } = await props.params;
  await verifierAccesEspace(orgId);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-7">
      <h1 className="mb-6 text-2xl font-semibold">Nouveau bien</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adresse et caractéristiques</CardTitle>
          <CardDescription>
            Le bien porte l&apos;adresse et les diagnostics communs. Son lot
            unique est créé automatiquement : c&apos;est lui qui se loue
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireBien orgId={orgId} />
        </CardContent>
      </Card>
    </main>
  );
}
