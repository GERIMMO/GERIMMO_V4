import { destinationSure } from "@/lib/destination-sure";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CoquilleAuth } from "@/components/coquille-auth";
import { FormulaireNouveauMotDePasse } from "./formulaire-nouveau-mot-de-passe";
import { MOTIF_CONFIRMATION, MOTIF_INSCRIPTION } from "@/lib/temoin-inscription";
import { CLE_PROFIL_A_CONFIRMER, informationsAConfirmer } from "@/lib/revalidation-inscription";
import { autorisationNouveauMotDePasse } from "@/lib/autorisation-nouveau-mot-de-passe";
import { premierMotDePasse } from "@/lib/premier-mot-de-passe";

export const metadata = { title: "Nouveau mot de passe — Gerimmo" };

export default async function PageNouveauMotDePasse({ searchParams }: { searchParams: Promise<{ suite?: string; motif?: string }> }) {
  const parametres = await searchParams;
  const suite = destinationSure(parametres.suite);
  // Toute première confirmation mène au choix du mot de passe et à la vérification du profil.
  // Les deux motifs restent acceptés pour les liens déjà envoyés.
  const apresInscription = parametres.motif === MOTIF_INSCRIPTION;
  const apresConfirmation = apresInscription || parametres.motif === MOTIF_CONFIRMATION;
  // Nécessite la session de récupération établie par le lien email
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?raison=lien-invalide");
  const autorisation = await autorisationNouveauMotDePasse(supabase, user.id);
  if (autorisation === "second_facteur_requis") {
    const retour = new URLSearchParams({ suite });
    if (typeof parametres.motif === "string") retour.set("motif", parametres.motif);
    redirect(`/securite?suite=${encodeURIComponent(`/nouveau-mot-de-passe?${retour}`)}`);
  }
  if (autorisation === "indisponible") throw new Error("La vérification du compte est momentanément indisponible.");
  if (autorisation !== "accordee") redirect("/compte");
  const brutProfil = user.user_metadata?.[CLE_PROFIL_A_CONFIRMER];
  const profilAConfirmer = brutProfil && typeof brutProfil === "object" ? informationsAConfirmer(brutProfil) : undefined;
  // L'invité (responsable, agent, locataire) crée son PREMIER mot de passe (audit final du 27/10, DRT-05) : la marque
  // est posée par le service dans app_metadata (lib/premier-mot-de-passe.ts), jamais par le titulaire.
  const premierChoix = !apresConfirmation && premierMotDePasse(user);

  return (
    <CoquilleAuth
      promesse="Un mot de passe, et rien d'autre à retenir."
      sousPromesse="Douze caractères au moins. Il est vérifié contre les fuites de données connues : un mot de passe déjà exposé ailleurs est refusé ici."
      mention="Un seul compte, tous vos espaces"
      titre={apresConfirmation ? "Choisissez votre mot de passe" : premierChoix ? "Créez votre mot de passe" : "Nouveau mot de passe"}
      chapo={
        apresInscription
          ? `Votre adresse ${user.email} est confirmée. Vérifiez vos informations puis choisissez le mot de passe de votre compte. Douze caractères au moins, vérifiés contre les fuites de données connues.`
          : apresConfirmation
            ? `Votre adresse ${user.email} vient d'être confirmée par ce lien. Vérifiez vos informations puis choisissez le mot de passe de votre compte. Douze caractères au moins, vérifiés contre les fuites de données connues.`
            : premierChoix
              ? `Votre adresse ${user.email} est confirmée. Choisissez le mot de passe de votre compte : il vous sera demandé à chaque connexion. Douze caractères au moins, vérifiés contre les fuites de données connues.`
              : `Compte : ${user.email}. Choisissez un mot de passe d'au moins 12 caractères — il sera vérifié contre les fuites de données connues.`
      }
    >
      <FormulaireNouveauMotDePasse suite={suite} profilAConfirmer={profilAConfirmer} premierChoix={premierChoix} />
    </CoquilleAuth>
  );
}
