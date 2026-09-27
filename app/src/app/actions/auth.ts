"use server";

import { CONDITIONS_VERSION } from "@/lib/editeur";
import { sansJargon } from "@/lib/erreurs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normaliserCode } from "@/lib/parrainage";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { classerErreurInscription, MESSAGE_BOITE_MAIL } from "@/lib/inscription";
import { adresseDeRetour } from "@/lib/site";

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
  "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé. Pensez à vérifier vos courriers indésirables.";

export async function demanderReinitialisation(
  _etat: EtatReinitialisation,
  formData: FormData
): Promise<EtatReinitialisation> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { erreur: "Saisissez votre adresse e-mail." };

  const origine = adresseDeRetour();
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
        "Session expirée ou lien invalide. Redemandez un e-mail de réinitialisation.",
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

// ============================================================
// Auto-inscription du propriétaire direct (Sprint 9a, décision 2026-08-19)
// ============================================================

export type EtatInscription = {
  erreur?: string;
  message?: string;
  valeurs?: Record<string, string>;
};

// Le compte est créé par Supabase Auth (politique de mot de passe, fuites
// connues, confirmation d'email selon la configuration du projet). Nom et
// prénom voyagent dans les métadonnées du compte : c'est la fonction
// `initialiser_espace_proprietaire` — appelée depuis /espaces dès qu'une
// session existe — qui ouvre l'organisation, l'adhésion et la fiche.
export async function inscrireProprietaire(
  _etat: EtatInscription,
  formData: FormData
): Promise<EtatInscription> {
  const valeurs = valeursDuFormulaire(formData);
  delete valeurs.mot_de_passe;
  delete valeurs.confirmation;
  const prenom = String(formData.get("prenom") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const motDePasse = String(formData.get("mot_de_passe") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire.", valeurs };
  if (!email) return { erreur: "L'adresse e-mail est obligatoire.", valeurs };
  if (motDePasse.length < 12) {
    return { erreur: "Le mot de passe doit compter au moins 12 caractères.", valeurs };
  }
  if (motDePasse !== confirmation) {
    return { erreur: "Les deux saisies ne correspondent pas.", valeurs };
  }
  if (!formData.get("cgu")) {
    return { erreur: "Acceptez les conditions d'utilisation pour continuer.", valeurs };
  }
  // Le code de parrainage (19/09) : facultatif, mais s'il est tapé il doit
  // avoir la bonne forme — un code qu'on laisserait passer de travers ne
  // rattacherait personne, et la personne ne le saurait pas.
  const codeSaisi = String(formData.get("code_parrainage") ?? "").trim();
  const codeParrainage = codeSaisi ? normaliserCode(codeSaisi) : null;
  if (codeSaisi && !codeParrainage) {
    return {
      erreur: "Le code de parrainage n'a pas la bonne forme : huit lettres ou chiffres, comme 3FA2B9C0.",
      valeurs,
    };
  }

  const origine = adresseDeRetour();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: motDePasse,
    options: {
      data: {
        nom,
        prenom,
        espace: "proprietaire_direct",
        telephone: String(formData.get("telephone") ?? "").trim(),
        adresse: String(formData.get("adresse") ?? "").trim(),
        code_postal: String(formData.get("code_postal") ?? "").trim(),
        ville: String(formData.get("ville") ?? "").trim(),
        qualite: String(formData.get("qualite") ?? "").trim(),
        // Ce qui a été accepté. Les métadonnées restent modifiables par le
        // titulaire du compte (audit du 27/09) : la PREUVE est la ligne que
        // la base inscrit, à la création du compte et à l'heure du serveur,
        // dans `acceptations_cgu` (ajout seul, ni mise à jour ni suppression).
        cgu_version: CONDITIONS_VERSION,
        cgu_acceptee_le: new Date().toISOString(),
        // Consommé à la naissance de l'organisation, sur /espaces.
        ...(codeParrainage ? { code_parrainage: codeParrainage } : {}),
      },
      emailRedirectTo: `${origine}/auth/confirm?next=/espaces`,
    },
  });
  if (error) {
    const issue = classerErreurInscription(error);
    // Audit du 27/09 : jamais « un compte existe déjà » (énumération de
    // comptes). Le titulaire reçoit de quoi se reconnecter ; l'écran dit la
    // même chose qu'à une adresse neuve (lib/inscription.ts).
    if (issue.type === "adresse_deja_inscrite") {
      await prevenirTitulaire(supabase, email, origine);
      return { message: MESSAGE_BOITE_MAIL };
    }
    if (issue.type === "mot_de_passe_faible") return { erreur: issue.erreur, valeurs };
    return { erreur: `Inscription impossible : ${sansJargon(issue.message)}`, valeurs };
  }

  // Confirmation d'email exigée par le projet : pas de session tant que le
  // lien n'est pas cliqué — il mène à /espaces, qui finit l'ouverture.
  if (!data.session) {
    return { message: MESSAGE_BOITE_MAIL };
  }
  redirect("/espaces");
}

/**
 * L'adresse a déjà un compte : on écrit à son titulaire un lien pour se
 * reconnecter (le même que « mot de passe oublié »), et on ne dit rien à
 * l'écran. L'échec de l'envoi est ignoré : la réponse reste neutre.
 */
async function prevenirTitulaire(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  origine: string
) {
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origine}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
}

// ============================================================
// Compte d'un artisan qui s'inscrit sans en avoir (audit du 27/09)
// ============================================================
//
// « Artisan ? Inscrire mon entreprise » menait à /artisan/inscription, qui
// exigeait une session : on revenait sur /connexion. Et /inscription ouvre un
// espace PROPRIÉTAIRE. L'artisan (pivot du 2026-09-04 : il s'auto-inscrit)
// n'avait donc aucune porte. Celle-ci crée le compte seul — sans organisation,
// marqué `espace: artisan` — puis la fiche de l'entreprise se remplit sur la
// même page, une fois connecté (inscrireMonEntreprise).

export async function creerCompteArtisan(
  _etat: EtatInscription,
  formData: FormData
): Promise<EtatInscription> {
  const valeurs = valeursDuFormulaire(formData);
  delete valeurs.mot_de_passe;
  delete valeurs.confirmation;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const motDePasse = String(formData.get("mot_de_passe") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!email) return { erreur: "L'adresse e-mail est obligatoire.", valeurs };
  if (motDePasse.length < 12) {
    return { erreur: "Le mot de passe doit compter au moins 12 caractères.", valeurs };
  }
  if (motDePasse !== confirmation) {
    return { erreur: "Les deux saisies ne correspondent pas.", valeurs };
  }
  if (!formData.get("cgu")) {
    return { erreur: "Acceptez les conditions d'utilisation pour continuer.", valeurs };
  }

  const origine = adresseDeRetour();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: motDePasse,
    options: {
      data: {
        // Lu par /espaces : un compte artisan sans fiche est renvoyé vers
        // l'inscription de l'entreprise, jamais vers un espace propriétaire.
        espace: "artisan",
        cgu_version: CONDITIONS_VERSION,
        cgu_acceptee_le: new Date().toISOString(),
      },
      emailRedirectTo: `${origine}/auth/confirm?next=/artisan/inscription`,
    },
  });
  if (error) {
    const issue = classerErreurInscription(error);
    if (issue.type === "adresse_deja_inscrite") {
      await prevenirTitulaire(supabase, email, origine);
      return { message: MESSAGE_BOITE_MAIL };
    }
    if (issue.type === "mot_de_passe_faible") return { erreur: issue.erreur, valeurs };
    return { erreur: `Inscription impossible : ${sansJargon(issue.message)}`, valeurs };
  }
  if (!data.session) return { message: MESSAGE_BOITE_MAIL };
  redirect("/artisan/inscription");
}

// ============================================================
// Ouvrir un espace propriétaire depuis un compte DÉJÀ connecté (24/09)
// ============================================================
//
// Un compte peut exister sans aucun espace : invitation expirée, inscription
// interrompue avant la confirmation, compte créé pour autre chose. Jusqu'ici
// « Mes espaces » lui disait « rapprochez-vous de votre agence » — une impasse
// pour quelqu'un qui gère ses propres biens. La même fonction que l'inscription
// (`initialiser_espace_proprietaire`, idempotente) s'appelle ici depuis le
// compte connecté ; elle lit le nom dans les métadonnées, qu'on pose d'abord.

export type EtatOuvertureEspace = { erreur?: string; valeurs?: Record<string, string> };

export async function ouvrirEspaceProprietaire(
  _etat: EtatOuvertureEspace,
  formData: FormData
): Promise<EtatOuvertureEspace> {
  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  if (!nom) return { erreur: "Le nom est obligatoire.", valeurs };
  if (!formData.get("cgu")) {
    return { erreur: "Acceptez les conditions d'utilisation pour continuer.", valeurs };
  }

  const supabase = await createClient();
  const { error: erreurProfil } = await supabase.auth.updateUser({
    data: {
      nom,
      prenom,
      espace: "proprietaire_direct",
      qualite: String(formData.get("qualite") ?? "").trim(),
      cgu_version: CONDITIONS_VERSION,
      cgu_acceptee_le: new Date().toISOString(),
    },
  });
  if (erreurProfil) return { erreur: sansJargon(erreurProfil.message), valeurs };
  // La preuve opposable de l'acceptation (audit sécurité du 27/09) : une ligne
  // en ajout seul, à l'heure du serveur. Les métadonnées ci-dessus restent
  // modifiables par le titulaire et ne prouvent rien.
  const { error: erreurCgu } = await supabase.rpc("accepter_cgu", {
    p_version: CONDITIONS_VERSION,
    p_source: "espace_proprietaire",
  });
  if (erreurCgu) return { erreur: "L'acceptation des conditions n'a pas pu être enregistrée. Réessayez dans un instant.", valeurs };

  const { data: orgId, error } = await supabase.rpc("initialiser_espace_proprietaire");
  // Refus métier (adresse d'un mandant — exclusivité PD/PM) : dit tel quel.
  if (error || !orgId) {
    return { erreur: error ? sansJargon(error.message) : "L'espace n'a pas pu être ouvert. Réessayez dans un instant.", valeurs };
  }
  redirect(`/agence/${orgId}`);
}
