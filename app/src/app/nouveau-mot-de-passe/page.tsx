import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { FormulaireNouveauMotDePasse } from "./formulaire-nouveau-mot-de-passe";

export const metadata = { title: "Nouveau mot de passe — Gerimmo" };

export default async function PageNouveauMotDePasse() {
  // Nécessite la session de récupération établie par le lien email
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?raison=lien-invalide");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <MarqueGerimmo />
          </div>
          <h1>Nouveau mot de passe</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compte : {user.email}. Choisissez un mot de passe d&apos;au moins
            12 caractères — il sera vérifié contre les fuites de données
            connues.
          </p>
        </div>
        <FormulaireNouveauMotDePasse />
      </div>
    </main>
  );
}
