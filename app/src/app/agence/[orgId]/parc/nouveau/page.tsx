import Link from "next/link";
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
  const { estProprietaire } = await verifierAccesEspace(orgId);

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-7">
      {/* Le retour « ← Parent » au-dessus de l'en-tête, nommé comme l'entrée
          du menu (25/09 : aucun retour, ni fil ni flèche). */}
      <Link
        href={`/agence/${orgId}/parc`}
        className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
      >
        ← {estProprietaire ? "Mes lots" : "Parc de l'agence"}
      </Link>
      <div className="entete-page">
        <h1>Nouveau bien</h1>
      </div>
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
