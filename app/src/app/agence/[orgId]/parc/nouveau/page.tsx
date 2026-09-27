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
  const { supabase, role, estProprietaire } = await verifierAccesEspace(orgId);

  // Le bailleur doit être identifiable AVANT de saisir un bien (recette de
  // production du 27/09) : l'action refuse la création tant que l'adresse et
  // l'e-mail du propriétaire manquent, parce qu'ils le désignent dans les
  // documents. On le dit ici, avant le formulaire, et non après l'envoi.
  let manquants: string[] = [];
  if (role === "proprietaire_direct") {
    const { data: profil } = await supabase.from("organizations")
      .select("address_line1,postal_code,city,email_contact")
      .eq("id", orgId).maybeSingle();
    manquants = [
      !profil?.address_line1 || !profil.postal_code || !profil.city ? "votre adresse" : null,
      !profil?.email_contact ? "votre e-mail de contact" : null,
    ].filter((m): m is string => m !== null);
  }

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
      {manquants.length > 0 ? (
        <div className="vide-guide">
          <p className="titre">Complétez d&apos;abord votre profil</p>
          <p className="explication">
            Il manque {manquants.join(" et ")}. Ils vous désignent comme
            bailleur dans le bail, les quittances et les avis d&apos;échéance :
            sans eux, le bien ne peut pas être créé.
          </p>
          <div className="geste">
            <Link href={`/agence/${orgId}/profil`} className="btn-or">
              Compléter mon profil
            </Link>
          </div>
        </div>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adresse et caractéristiques</CardTitle>
          <CardDescription>
            Le bien porte l&apos;adresse et les diagnostics communs. Son lot
            unique est créé automatiquement : c&apos;est lui qui se loue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireBien orgId={orgId} />
        </CardContent>
      </Card>
      )}
    </main>
  );
}
