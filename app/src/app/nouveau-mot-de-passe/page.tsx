import { destinationSure } from "@/lib/destination-sure";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CoquilleAuth } from "@/components/coquille-auth";
import { FormulaireNouveauMotDePasse } from "./formulaire-nouveau-mot-de-passe";

export const metadata = { title: "Nouveau mot de passe — Gerimmo" };

export default async function PageNouveauMotDePasse({ searchParams }: { searchParams: Promise<{ suite?: string; motif?: string }> }) {
  const parametres = await searchParams;
  const suite = destinationSure(parametres.suite);
  // Troisième relecture du 15/10/2026 : une confirmation d'inscription ouverte ailleurs que dans le navigateur de
  // l'inscription mène ici (route /auth/confirm) ; le mot de passe choisi avant la confirmation ne vaut plus.
  const apresConfirmation = parametres.motif === "inscription";
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
      titre={apresConfirmation ? "Choisissez votre mot de passe" : "Nouveau mot de passe"}
      chapo={
        apresConfirmation
          ? `Votre adresse ${user.email} est confirmée. Ce lien a été ouvert dans un autre navigateur que celui de l'inscription : par sécurité, choisissez maintenant le mot de passe de votre compte. Douze caractères au moins, vérifiés contre les fuites de données connues.`
          : `Compte : ${user.email}. Choisissez un mot de passe d'au moins 12 caractères — il sera vérifié contre les fuites de données connues.`
      }
    >
      <FormulaireNouveauMotDePasse suite={suite} />
    </CoquilleAuth>
  );
}
