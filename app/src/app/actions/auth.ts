"use server";

import { destinationSure } from "@/lib/destination-sure";
import { RAISON_DECONNEXION } from "@/lib/copies-locales";

import { CONDITIONS_VERSION } from "@/lib/editeur";
import {
  CASE_CONDITIONS_CLIENTS,
  CHAMP_DOCUMENT_AFFICHE,
  MESSAGE_CASE_A_REVOIR,
  caseConditions,
  documentAffiche,
  estEspaceInscription,
} from "@/lib/conditions-acceptation";
import { sansJargon } from "@/lib/erreurs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normaliserCode } from "@/lib/parrainage";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { classerErreurInscription, MESSAGE_BOITE_MAIL } from "@/lib/inscription";
import { champTropLong, premierChampTropLong, valeursBornees } from "@/lib/limites-saisie";
import { envoyerLienMotDePasse, inscrireEtEnvoyerConfirmation } from "@/lib/lien-mot-de-passe";
import { estQualiteBailleur, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { estUuid } from "@/lib/identifiants";
import { cheminInvitationArtisan } from "@/lib/invitations-artisan";
import { baseEspace } from "@/lib/racine-espace";
import { CHAMPS_PROFIL_INSCRIPTION, CLE_PROFIL_A_CONFIRMER, saisieProfilARetenir } from "@/lib/revalidation-inscription";
import { autorisationNouveauMotDePasse } from "@/lib/autorisation-nouveau-mot-de-passe";
import { CLE_PREMIER_MOT_DE_PASSE, premierMotDePasse } from "@/lib/premier-mot-de-passe";
import { clientDeService } from "@/lib/supabase/service";

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

/** Les champs auxquels un refus peut s'adresser : l'alerte se place sous eux (relevé du 23/10, PRO-4). */
export type ChampNouveauMotDePasse = "mot_de_passe" | "confirmation" | "cgu" | (typeof CHAMPS_PROFIL_INSCRIPTION)[number];

export type EtatNouveauMotDePasse = {
  erreur?: string;
  /** Le champ fautif ; absent pour une erreur qui ne tient à aucun champ (session, service). */
  champ?: ChampNouveauMotDePasse;
  /**
   * Conservation des saisies (lib/formulaires.ts) : React vide le formulaire après chaque action, refus compris. Le
   * profil et la case des conditions reviennent ici et le formulaire les repose. Jamais un mot de passe : comme
   * /inscription et « Mon compte », un refus vide les deux champs de mot de passe.
   */
  valeurs?: Record<string, string>;
};

export async function definirNouveauMotDePasse(
  _etat: EtatNouveauMotDePasse,
  formData: FormData
): Promise<EtatNouveauMotDePasse> {
  const motDePasse = String(formData.get("mot_de_passe") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  // PRO-4 (23/10) : un refus vidait le profil corrigé et décochait la case des conditions — tout était à ressaisir.
  const saisie = saisieProfilARetenir(formData);
  const refus = (erreur: string, champ?: ChampNouveauMotDePasse): EtatNouveauMotDePasse => ({
    erreur,
    ...(champ ? { champ } : {}),
    ...(Object.keys(saisie).length > 0 ? { valeurs: saisie } : {}),
  });

  // Politique RM-A4.3 : 12 caractères minimum (la vérification contre les
  // fuites connues est appliquée côté Supabase Auth)
  if (motDePasse.length < 12) {
    return refus("Le mot de passe doit compter au moins 12 caractères.", "mot_de_passe");
  }
  if (motDePasse !== confirmation) {
    return refus("Les deux saisies ne correspondent pas.", "confirmation");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return refus("Session expirée ou lien invalide. Redemandez un e-mail de réinitialisation.");
  }
  const autorisation = await autorisationNouveauMotDePasse(supabase, user.id);
  if (autorisation === "second_facteur_requis") {
    return refus("Confirmez votre double authentification dans « Sécurité du compte », puis rouvrez ce formulaire.");
  }
  if (autorisation === "indisponible") {
    return refus("La vérification du compte est momentanément indisponible. Réessayez dans quelques instants.");
  }
  if (autorisation !== "accordee") {
    return refus("Ce formulaire est réservé au lien reçu par e-mail, pendant quinze minutes après sa confirmation. Redemandez un lien ou changez votre mot de passe dans « Mon compte », avec le mot de passe actuel.");
  }

  // Le profil à confirmer n'existe qu'entre la première confirmation de l'adresse et ce premier choix
  // (lib/lien-mot-de-passe.ts, finirConfirmationInscription) : lu dans le compte, jamais dans l'envoi.
  let profil: Record<string, unknown> | undefined;
  if (Object.hasOwn(user.user_metadata ?? {}, CLE_PROFIL_A_CONFIRMER)) {
    const champs = Object.fromEntries(CHAMPS_PROFIL_INSCRIPTION.map((champ) => [champ, String(formData.get(champ) ?? "").trim()]));
    const tropLong = champTropLong(champs);
    const champLong = premierChampTropLong(champs);
    if (tropLong) return refus(tropLong, CHAMPS_PROFIL_INSCRIPTION.find((champ) => champ === champLong));
    if (!estEspaceInscription(champs.espace)) return refus("Choisissez l’usage de votre compte.", "espace");
    if (champs.espace === "proprietaire_direct" && !champs.nom) return refus("Le nom est obligatoire.", "nom");
    // Plan de conformité du 23/10 (R10, R60) : la case et le document accepté suivent l'usage choisi — conditions
    // clients pour le propriétaire, conditions de l'espace artisan dès leur publication, règles des espaces invités pour
    // la personne invitée (lib/conditions-acceptation.ts).
    const caseAcceptee = caseConditions(champs.espace);
    if (!formData.get("cgu")) return refus(caseAcceptee.refus, "cgu");
    // La case affichée à l'envoi doit être celle de l'usage choisi : sans script, changer la liste ne change pas son
    // libellé. On n'enregistre jamais l'accord sur un texte que la case ne nommait pas ; elle revient décochée.
    if (documentAffiche(formData.get(CHAMP_DOCUMENT_AFFICHE)) !== caseAcceptee.document) {
      const sansCase = Object.fromEntries(Object.entries(saisie).filter(([champ]) => champ !== "cgu" && champ !== CHAMP_DOCUMENT_AFFICHE));
      return { erreur: MESSAGE_CASE_A_REVOIR, champ: "cgu", ...(Object.keys(sansCase).length > 0 ? { valeurs: sansCase } : {}) };
    }
    const code = champs.code_parrainage ? normaliserCode(champs.code_parrainage) : null;
    if (champs.code_parrainage && !code) return refus("Le code de parrainage doit compter huit lettres ou chiffres.", "code_parrainage");
    const { error: erreurCgu } = await supabase.rpc("accepter_cgu", {
      p_version: caseAcceptee.version,
      p_source: "compte",
      p_document: caseAcceptee.document,
    });
    if (erreurCgu) return refus("L’acceptation des conditions n’a pas pu être enregistrée. Réessayez.", "cgu");
    profil = { ...champs, espace: champs.espace === "invite" ? null : champs.espace, qualite: qualiteDeLaListe(formData.get("qualite")), code_parrainage: code, cgu_version: caseAcceptee.version, cgu_document: caseAcceptee.document, cgu_acceptee_le: new Date().toISOString(), [CLE_PROFIL_A_CONFIRMER]: null };
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse, ...(profil ? { data: profil } : {}) });
  if (error) {
    if (error.code === "same_password") {
      return refus("Le nouveau mot de passe doit être différent de l'ancien.", "mot_de_passe");
    }
    if (error.code === "weak_password") {
      return refus(
        "Mot de passe refusé : trop faible ou présent dans des fuites de données connues. Choisissez-en un autre.",
        "mot_de_passe"
      );
    }
    return refus(`Changement impossible : ${sansJargon(error.message)}`);
  }

  // PREMIER CHOIX APRÈS LA CONFIRMATION DE L'ADRESSE : UNE SESSION « MOT DE PASSE » REMPLACE CELLE DU LIEN (relecture
  // adverse du 23/10, PRO-5). Changer le mot de passe ne touche ni la session courante ni sa preuve d'e-mail (`amr`,
  // valable quinze minutes) : gardée telle quelle, la session née du lien rouvrait /nouveau-mot-de-passe, où quiconque
  // l'utilisait (bouton Retour, poste partagé) pouvait reposer le mot de passe sans connaître l'actuel. La connexion
  // avec le mot de passe qui vient d'être choisi ouvre une nouvelle session (`amr` = password, cookies réécrits) ; la
  // fermeture des « autres » sessions ci-dessous emporte alors celle du lien. Un lien e-mail ne sert qu'à un seul choix,
  // comme avant PRO-5. Jamais une marque dans user_metadata : son titulaire peut l'écrire lui-même.
  //
  // L'INVITÉ (responsable, agent, locataire) suit le même chemin (audit final du 27/10, DRT-05) : il vient de créer son
  // PREMIER mot de passe, le renvoyer vers « Mot de passe modifié. Connectez-vous… » lui faisait ressaisir ce qu'il
  // venait de choisir. Sa marque vit dans app_metadata, que seul le service écrit (lib/premier-mot-de-passe.ts) ; elle
  // est effacée ici, par le service, une fois le choix fait — une récupération ultérieure reprend le parcours ordinaire.
  const premierChoix = premierMotDePasse(user);
  let sessionParMotDePasse = false;
  if ((profil || premierChoix) && user.email) {
    const { error: erreurConnexion } = await supabase.auth.signInWithPassword({ email: user.email, password: motDePasse });
    sessionParMotDePasse = !erreurConnexion;
  }
  if (premierChoix) {
    const { error: erreurMarque } = (await clientDeService()?.auth.admin.updateUserById(user.id, {
      app_metadata: { [CLE_PREMIER_MOT_DE_PASSE]: false },
    })) ?? { error: null };
    if (erreurMarque) console.error("[auth] marque du premier mot de passe non effacée :", erreurMarque.message);
  }

  // Sécurité : toute autre session active est invalidée — si quelqu'un était
  // connecté avec l'ancien mot de passe, il est éjecté
  await supabase.auth.signOut({ scope: "others" });

  // Trace technique (matrice A2 : « changement de mot de passe », 6 mois)
  await supabase.rpc("log_tech", {
    evenement: "changement_mot_de_passe",
    details: {},
  });

  let suite = destinationSure(String(formData.get("suite") ?? ""));
  if (profil?.espace === "proprietaire_direct") suite = "/espaces";
  else if (profil?.espace === "artisan" && suite === "/espaces") suite = "/artisan/inscription";

  // PREMIER CHOIX APRÈS LA CONFIRMATION DE L'ADRESSE : LA PERSONNE RESTE CONNECTÉE (relevé du 23/10, PRO-5).
  // Elle vient de prouver l'accès à sa boîte et de poser son mot de passe : la renvoyer vers la connexion
  // (« Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe. ») lui faisait ressaisir ce qu'elle venait
  // de choisir. Elle continue avec la session « mot de passe » ouverte ci-dessus (celle du lien est fermée) ; le proxy
  // applique la politique de session et le second facteur comme à toute session. Le profil est lu dans le compte : un
  // champ ajouté à l'envoi ne peut pas éviter la déconnexion d'une récupération.
  if (sessionParMotDePasse) redirect(suite);

  // RÉCUPÉRATION D'UN COMPTE EXISTANT (mot de passe oublié), choix d'origine
  // inchangé : on repart d'une connexion propre avec le nouveau mot de passe.
  // C'est aussi le repli du premier choix si la connexion avec le nouveau mot de passe n'a pas abouti (adresse
  // absente, limite de fréquence, service indisponible) : le mot de passe et le profil sont enregistrés, toutes les
  // sessions se ferment, celle du lien comprise, et la personne se connecte avec ce qu'elle vient de choisir.
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVITY_COOKIE);
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
    return { erreur: CASE_CONDITIONS_CLIENTS.refus, valeurs };
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
