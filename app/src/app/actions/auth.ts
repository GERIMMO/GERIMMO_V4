"use server";

import { sansJargon } from "@/lib/erreurs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";

export async function seDeconnecter() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVITY_COOKIE);
  redirect("/connexion");
}

// ============================================================
// Mot de passe oublié (ajout Sprint 1, acté le 2026-07-28)
// ============================================================

export type EtatReinitialisation = { message?: string; erreur?: string };

// La réponse est TOUJOURS la même, que le compte existe ou non : on ne révèle
// jamais quelles adresses ont un compte Gerimmo (énumération de comptes).
const MESSAGE_NEUTRE =
  "Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé. Pensez à vérifier vos courriers indésirables.";

export async function demanderReinitialisation(
  _etat: EtatReinitialisation,
  formData: FormData
): Promise<EtatReinitialisation> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { erreur: "Saisissez votre adresse email." };

  const origine = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  // Le lien du mail passe par /auth/confirm qui établit la session de
  // récupération puis mène à /nouveau-mot-de-passe
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origine}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
  // Erreur éventuelle volontairement ignorée : réponse neutre dans tous les cas
  return { message: MESSAGE_NEUTRE };
}

export type EtatNouveauMotDePasse = { erreur?: string };

export async function definirNouveauMotDePasse(
  _etat: EtatNouveauMotDePasse,
  formData: FormData
): Promise<EtatNouveauMotDePasse> {
  const motDePasse = String(formData.get("mot_de_passe") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  // Politique RM-A4.3 : 12 caractères minimum (la vérification contre les
  // fuites connues est appliquée côté Supabase Auth)
  if (motDePasse.length < 12) {
    return { erreur: "Le mot de passe doit compter au moins 12 caractères." };
  }
  if (motDePasse !== confirmation) {
    return { erreur: "Les deux saisies ne correspondent pas." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      erreur:
        "Session expirée ou lien invalide. Redemandez un email de réinitialisation.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) {
    if (error.code === "same_password") {
      return { erreur: "Le nouveau mot de passe doit être différent de l'ancien." };
    }
    if (error.code === "weak_password") {
      return {
        erreur:
          "Mot de passe refusé : trop faible ou présent dans des fuites de données connues. Choisissez-en un autre.",
      };
    }
    return { erreur: `Changement impossible : ${sansJargon(error.message)}` };
  }

  // Sécurité : toute autre session active est invalidée — si quelqu'un était
  // connecté avec l'ancien mot de passe, il est éjecté
  await supabase.auth.signOut({ scope: "others" });

  // Trace technique (matrice A2 : « changement de mot de passe », 6 mois)
  await supabase.rpc("log_tech", {
    evenement: "changement_mot_de_passe",
    details: {},
  });

  // On repart d'une connexion propre avec le nouveau mot de passe
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVITY_COOKIE);
  redirect("/connexion?raison=mot-de-passe-modifie");
}
