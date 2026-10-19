"use server";

import { destinationSure } from "@/lib/destination-sure";
import { RAISON_DECONNEXION } from "@/lib/copies-locales";

import { CONDITIONS_VERSION } from "@/lib/editeur";
import { sansJargon } from "@/lib/erreurs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normaliserCode } from "@/lib/parrainage";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { classerErreurInscription, MESSAGE_BOITE_MAIL } from "@/lib/inscription";
import { champTropLong, valeursBornees } from "@/lib/limites-saisie";
import { envoyerLienMotDePasse, inscrireEtEnvoyerConfirmation } from "@/lib/lien-mot-de-passe";
import { estQualiteBailleur, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { estUuid } from "@/lib/identifiants";
import { cheminInvitationArtisan } from "@/lib/invitations-artisan";
import { baseEspace } from "@/lib/racine-espace";
import { CHAMPS_PROFIL_INSCRIPTION, CLE_PROFIL_A_CONFIRMER } from "@/lib/revalidation-inscription";
import { sessionIssueDUnLien } from "@/lib/session-lien-email";

// La qualité voyage dans les métadonnées jusqu'à la fiche personne, dont la
// liste est fermée (audit 29/09) : une valeur hors liste est laissée vide
// plutôt que de faire échouer l'ouverture de l'espace.
function qualiteDeLaListe(brut: FormDataEntryValue | null): string {
  const q = normaliserQualiteBailleur(String(brut ?? ""));
  return estQualiteBailleur(q) ? q : "";
}

export async function seDeconnecter() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVITY_COOKIE);
  // Audit du 13/10 (VER-PR178-05) : les copies de saisie gardées sur l'appareil s'effacent à l'ARRIVÉE sur cette adresse
  // (PurgerCopiesALaDeconnexion), donc seulement une fois la session fermée. Si la déconnexion échoue (hors ligne), la
  // personne reste connectée et garde sa copie ; un utilisateur encore connecté est renvoyé de /connexion par le proxy.
  redirect(`/connexion?raison=${RAISON_DECONNEXION}`);
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

  // Le lien du mail passe par /auth/confirm, puis par un bouton qui établit
  // la session de récupération et mène à /nouveau-mot-de-passe
  // (lib/lien-mot-de-passe.ts : lien valable dans n'importe quel navigateur,
  // limite de fréquence par adresse et par IP).
  const envoi = await envoyerLienMotDePasse({
    email,
    motif: "mot_de_passe_oublie",
    next: "/nouveau-mot-de-passe",
  });
  // Seule la limite de fréquence se dit : elle vaut pour toute adresse, avec
  // ou sans compte, et ne révèle donc rien. Le reste : réponse neutre.
  if (envoi.limite) return { erreur: envoi.erreur };
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
  // Audit du 19/10 (g) : ce formulaire pose le mot de passe SANS demander l'ancien. L'action le réserve elle-même aux
  // sessions nées d'un lien reçu par e-mail (revendication `amr` du jeton, lib/session-lien-email.ts) : la page redirige
  // déjà, mais l'action reste appelable directement par un compte connecté par mot de passe, qui doit passer par
  // « Mon compte », où le mot de passe actuel est demandé. Rien n'est modifié ni déconnecté.
  const { data: revendications } = await supabase.auth.getClaims();
  if (!sessionIssueDUnLien(revendications?.claims?.amr)) {
    return {
      erreur:
        "Ce formulaire est réservé au lien reçu par e-mail. Depuis votre compte, changez votre mot de passe dans « Mon compte », avec le mot de passe actuel.",
    };
  }

  let profil: Record<string, unknown> | undefined;
  if (Object.hasOwn(user.user_metadata ?? {}, CLE_PROFIL_A_CONFIRMER)) {
    const champs = Object.fromEntries(CHAMPS_PROFIL_INSCRIPTION.map((champ) => [champ, String(formData.get(champ) ?? "").trim()]));
    const tropLong = champTropLong(champs);
    if (tropLong) return { erreur: tropLong };
    if (!["proprietaire_direct", "artisan", "invite"].includes(champs.espace)) return { erreur: "Choisissez l’usage de votre compte." };
    if (champs.espace === "proprietaire_direct" && !champs.nom) return { erreur: "Le nom est obligatoire." };
    if (!formData.get("cgu")) return { erreur: "Acceptez les conditions d’utilisation pour continuer." };
    const code = champs.code_parrainage ? normaliserCode(champs.code_parrainage) : null;
    if (champs.code_parrainage && !code) return { erreur: "Le code de parrainage doit compter huit lettres ou chiffres." };
    const { error: erreurCgu } = await supabase.rpc("accepter_cgu", { p_version: CONDITIONS_VERSION, p_source: "compte" });
    if (erreurCgu) return { erreur: "L’acceptation des conditions n’a pas pu être enregistrée. Réessayez." };
    profil = { ...champs, espace: champs.espace === "invite" ? null : champs.espace, qualite: qualiteDeLaListe(formData.get("qualite")), code_parrainage: code, cgu_version: CONDITIONS_VERSION, cgu_acceptee_le: new Date().toISOString(), [CLE_PROFIL_A_CONFIRMER]: null };
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse, ...(profil ? { data: profil } : {}) });
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
  let suite = destinationSure(String(formData.get("suite") ?? ""));
  if (profil?.espace === "proprietaire_direct") suite = "/espaces";
  else if (profil?.espace === "artisan" && suite === "/espaces") suite = "/artisan/inscription";
  redirect(`/connexion?raison=mot-de-passe-modifie${suite !== "/espaces" ? `&suite=${encodeURIComponent(suite)}` : ""}`);
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
// connues), par l'API d'administration : Gerimmo envoie lui-même le lien de
// confirmation (lib/lien-mot-de-passe.ts, 30/09). Nom et prénom voyagent dans
// les métadonnées du compte : c'est la fonction
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
  const telephone = String(formData.get("telephone") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();
  const codePostal = String(formData.get("code_postal") ?? "").trim();
  const ville = String(formData.get("ville") ?? "").trim();

  if (!nom) return { erreur: "Le nom est obligatoire.", valeurs };
  if (!email) return { erreur: "L'adresse e-mail est obligatoire.", valeurs };
  // Ces champs voyagent dans le jeton de session : une borne, dite en clair (audit du 13/10, AUD-B-02).
  const tropLong = champTropLong({ nom, prenom, email, telephone, adresse, code_postal: codePostal, ville });
  if (tropLong) return { erreur: tropLong, valeurs: valeursBornees(valeurs) };
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

  // Le compte est créé par la fabrique de liens (lib/lien-mot-de-passe.ts,
  // 30/09) : `auth.admin.generateLink` type `signup`, qui pose ces
  // métadonnées et rend NOTRE lien de confirmation — valable dans n'importe
  // quel navigateur, consommé au clic sur un bouton, jamais à l'ouverture.
  return finirInscription({
    email,
    valeurs,
    next: "/espaces",
    metadonnees: {
      nom,
      prenom,
      espace: "proprietaire_direct",
      telephone,
      adresse,
      code_postal: codePostal,
      ville,
      qualite: qualiteDeLaListe(formData.get("qualite")),
      // Consommé à la naissance de l'organisation, sur /espaces.
      ...(codeParrainage ? { code_parrainage: codeParrainage } : {}),
    },
  });
}

/**
 * La fin commune des deux inscriptions (propriétaire, artisan) : création du
 * compte et envoi du lien de confirmation, puis la réponse à l'écran.
 *
 * Audit du 27/09 : jamais « un compte existe déjà » (énumération de comptes).
 * Une adresse déjà confirmée vaut à son titulaire un lien de reconnexion, et
 * l'écran dit la même chose qu'à une adresse neuve (lib/inscription.ts). Une
 * adresse inscrite mais jamais confirmée reçoit un nouveau lien de
 * confirmation : même écran. Seule la limite de fréquence se dit — elle vaut
 * pour toute adresse et ne révèle rien.
 */
async function finirInscription(params: {
  email: string;
  metadonnees: Record<string, unknown>;
  next: string;
  valeurs: Record<string, string>;
}): Promise<EtatInscription> {
  const { email, metadonnees, next, valeurs } = params;
  const resultat = await inscrireEtEnvoyerConfirmation({ email, metadonnees, next });
  if ("erreur" in resultat) {
    if (resultat.limite) return { erreur: resultat.erreur, valeurs };
    const issue = classerErreurInscription({ code: resultat.code, message: resultat.erreur });
    if (issue.type === "mot_de_passe_faible") return { message: MESSAGE_BOITE_MAIL };
    // « adresse déjà inscrite » est traité par la fabrique elle-même (état
    // `compte_existant`) : ici il ne reste que les autres erreurs.
    const message = issue.type === "autre" ? issue.message : resultat.erreur;
    return { erreur: `Inscription impossible : ${sansJargon(message)}`, valeurs };
  }
  return { message: MESSAGE_BOITE_MAIL };
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

  if (!email) return { erreur: "L'adresse e-mail est obligatoire.", valeurs };
  const emailTropLong = champTropLong({ email });
  if (emailTropLong) return { erreur: emailTropLong, valeurs: valeursBornees(valeurs) };

  // Le lien de confirmation mène à next=/artisan/inscription, où la fiche de
  // l'entreprise se remplit une fois connecté. Décision du 15/10/2026 : venu du
  // lien d'une invitation, l'artisan revient sur cette invitation (seul un
  // identifiant bien formé est suivi ; la page refuse toute autre session).
  const invitation = formData.get("invitation");
  return finirInscription({
    email,
    valeurs,
    next: estUuid(invitation) ? cheminInvitationArtisan(invitation) : "/artisan/inscription",
    metadonnees: {
      // Lu par /espaces : un compte artisan sans fiche est renvoyé vers
      // l'inscription de l'entreprise, jamais vers un espace propriétaire.
      espace: "artisan",
    },
  });
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
  const tropLong = champTropLong({ nom, prenom });
  if (tropLong) return { erreur: tropLong, valeurs: valeursBornees(valeurs) };
  if (!formData.get("cgu")) {
    return { erreur: "Acceptez les conditions d'utilisation pour continuer.", valeurs };
  }

  const supabase = await createClient();
  const { error: erreurProfil } = await supabase.auth.updateUser({
    data: {
      nom,
      prenom,
      espace: "proprietaire_direct",
      qualite: qualiteDeLaListe(formData.get("qualite")),
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
  redirect(baseEspace(orgId, true));
}
