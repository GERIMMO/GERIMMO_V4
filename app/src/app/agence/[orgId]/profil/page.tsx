import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireProfilOrganisation } from "./formulaire-profil";

export const metadata = { title: "Profil — Gerimmo" };

// Profil de l'organisation (sprint « Documents-0 ») : l'identité imprimée en
// en-tête et en pied de chaque document généré, et la commune du « Fait à ».
export default async function PageProfil(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire } = await verifierAccesEspace(orgId);
  const responsable = ROLES_RESPONSABLES.includes(role);

  const { data: organisation } = await supabase
    .from("organizations")
    .select("name, address_line1, postal_code, city, telephone, email_contact, siret")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) return null;

  const manquants = [
    !organisation.address_line1 && "adresse",
    !organisation.city && "ville (le « Fait à » des documents)",
    !organisation.email_contact && "email de contact",
    !organisation.telephone && "téléphone",
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <div className="entete-page mb-6">
          <h1>{estProprietaire ? "Mon profil" : "Profil de l'agence"}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Ces informations signent vos documents générés (bail, quittances,
          états des lieux…) : en-tête, pied de page et « Fait à ». Un champ
          vide reste en libellé dans le PDF.
        </p>
        {manquants.length > 0 && (
          <p className="mt-2 text-sm text-warning-soft-foreground">
            À compléter pour des documents sans trous : {manquants.join(" · ")}.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identité</CardTitle>
          <CardDescription>
            {responsable
              ? "Modifiable par le responsable de l'organisation."
              : "Lecture seule — demandez à un responsable de l'organisation pour modifier."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireProfilOrganisation
            orgId={orgId}
            organisation={organisation}
            lectureSeule={!responsable}
            estProprietaire={estProprietaire}
          />
        </CardContent>
      </Card>
    </main>
  );
}
