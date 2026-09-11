import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CoquilleAuth } from "@/components/coquille-auth";
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
    <CoquilleAuth
      promesse="Un mot de passe, et rien d'autre à retenir."
      sousPromesse="Douze caractères au moins. Il est vérifié contre les fuites de données connues : un mot de passe déjà exposé ailleurs est refusé ici."
      mention="Un seul compte, tous vos espaces"
      titre="Nouveau mot de passe"
      chapo={`Compte : ${user.email}. Choisissez un mot de passe d'au moins 12 caractères — il sera vérifié contre les fuites de données connues.`}
    >
      <FormulaireNouveauMotDePasse />
    </CoquilleAuth>
  );
}
