// LES LIENS « CRÉER / CHOISIR MON MOT DE PASSE » — une seule fabrique.
//
// POURQUOI CE FICHIER EXISTE (30/09/2026, incident de production). Toutes les
// invitations (responsable d'agence ouvert par la supervision, agent, locataire,
// renvoi depuis la console) et « mot de passe oublié » passaient par
// `supabase.auth.resetPasswordForEmail`. Le client serveur est en flux PKCE :
// Supabase renvoie alors vers /auth/confirm?code=…, et l'échange du code exige
// le `code_verifier` rangé dans un cookie… du navigateur qui a DEMANDÉ le lien.
// Pour une invitation, c'est celui du super admin ou de l'admin d'agence, pas
// celui du destinataire : « lien invalide » à tous les coups, puis « One-time
// token not found » au second clic (le jeton est à usage unique, et les
// antivirus de messagerie qui pré-ouvrent les liens le consomment aussi).
//
// LE REMÈDE. Le jeton est fabriqué par l'API d'administration
// (`auth.admin.generateLink`, type `recovery`), qui ne dépend d'aucun
// navigateur : on en garde l'empreinte (`hashed_token`) et l'on bâtit NOTRE
// lien, /auth/confirm?token_hash=…&type=recovery&next=…. Ce lien n'est pas
// vérifié à l'ouverture : il mène à une page avec un bouton (/auth/confirmer),
// et c'est le clic — une requête POST, qu'aucun analyseur de liens n'envoie —
// qui consomme le jeton. L'e-mail part par le même expéditeur que les autres
// courriers du produit (Resend, src/lib/email.ts).
//
// L'INSCRIPTION (audit du 30/09, H1). `auth.signUp` faisait envoyer par
// Supabase un lien PKCE, lui aussi limité au navigateur de la demande et
// consommé à l'ouverture. Le compte est désormais créé par
// `auth.admin.generateLink({ type: "signup", … })` : l'appel crée
// l'utilisateur (métadonnées comprises — les déclencheurs de la base les
// lisent dans `raw_user_meta_data`), applique la politique de mot de passe,
// n'envoie AUCUN e-mail et rend l'empreinte du jeton. Le courrier est le
// nôtre, le lien est le nôtre, et c'est le bouton de /auth/confirmer (POST,
// type `signup`) qui confirme l'adresse et ouvre la session. Une adresse déjà
// confirmée est refusée par Auth (`email_exists`) : son titulaire reçoit un
// lien de reconnexion, et l'écran dit la même chose qu'à une adresse neuve.
// Une adresse inscrite mais jamais confirmée (inscription interrompue) reçoit
// un nouveau lien de confirmation.
//
// SÉCURITÉ.
// - La clé de service (src/lib/supabase/service.ts) ne sert ici qu'à fabriquer
//   un lien pour UNE adresse (et, à l'inscription, à créer CE compte), jamais
//   à lire ni écrire des données. Ce module n'est appelé que par des actions
//   serveur, APRÈS leurs propres contrôles : superviseur permanent, admin de
//   l'agence, ou les formulaires publics (inscription, mot de passe oublié).
// - Les demandes anonymes (inscription, mot de passe oublié, adresse déjà
//   inscrite) passent d'abord par `autoriser_lien_mot_de_passe` : 3 par
//   adresse et 20 par IP sur une heure (20260930130000_limite_liens_mot_de_passe.sql).
//   L'API d'administration n'a pas la limite de Supabase Auth ; elle est ici.
// - Les invitations d'une organisation (agent, locataire, renvoi) passent par
//   `autoriser_lien_mot_de_passe_cle` : 30 liens par organisation et par heure
//   (20260930140000_limite_invitations.sql). Un compte d'agence compromis ne
//   devient pas une machine à courrier.
// - Pour une demande anonyme, une adresse inconnue reçoit la même réponse
//   qu'une adresse connue : on ne révèle pas qui a un compte.

import "server-only";
import { headers } from "next/headers";
import { clientDeService } from "@/lib/supabase/service";
import { envoyerEmail } from "@/lib/email";
import { adresseDuSite } from "@/lib/site";
import { destinationSure } from "@/lib/destination-sure";
import { sansJargon } from "@/lib/erreurs";

export type MotifLien =
  /** La supervision vient d'ouvrir l'organisation : son responsable crée son mot de passe. */
  | "invitation_responsable"
  /** Le responsable d'une organisation, relancé depuis la console. */
  | "renvoi_supervision"
  /** L'admin d'une agence ajoute un agent qui n'avait pas de compte. */
  | "invitation_agent"
  /** Le gérant ouvre l'espace d'un locataire. */
  | "invitation_locataire"
  /** Formulaire public « mot de passe oublié ». */
  | "mot_de_passe_oublie"
  /** Inscription tentée avec une adresse qui a déjà un compte. */
  | "compte_existant"
  /** Confirmation de l'adresse à l'inscription (propriétaire, artisan). */
  | "confirmation_inscription";

/** Les motifs déclenchés SANS session : limités en fréquence, réponse neutre. */
const MOTIFS_ANONYMES: ReadonlySet<MotifLien> = new Set([
  "mot_de_passe_oublie",
  "compte_existant",
  "confirmation_inscription",
]);

export const MESSAGE_TROP_DE_DEMANDES =
  "Trop de demandes de lien pour cette adresse ou depuis ce réseau. Réessayez dans une heure.";
export const MESSAGE_TROP_D_INVITATIONS =
  "Trop d’invitations envoyées par cette organisation en une heure. Réessayez plus tard.";
/** Liens par organisation et par heure (invitations, renvois). */
export const LIMITE_INVITATIONS_PAR_ORGANISATION = 30;

const NON_CONFIGURE = "L’envoi des liens de connexion n’est pas configuré. Contactez l’administrateur.";
const INDISPONIBLE = "Le service est momentanément indisponible. Réessayez dans un instant.";

type Courrier = {
  sujet: string;
  titre: string;
  texte: string;
  bouton: string;
  /** Comment obtenir un nouveau lien s'il a expiré. Défaut : « Mot de passe oublié ». */
  renouvellement?: string;
  /** Ce qui se passe si l'on ignore le message. Défaut : le compte reste inchangé. */
  siIgnore?: string;
};

const COURRIERS: Record<MotifLien, Courrier> = {
  invitation_responsable: {
    sujet: "Votre espace Gerimmo est prêt — créez votre mot de passe",
    titre: "Votre espace Gerimmo est prêt",
    texte:
      "L’espace de votre organisation vient d’être ouvert sur Gerimmo, et vous en êtes le responsable. Pour y entrer, il ne vous reste qu’à créer votre mot de passe.",
    bouton: "Créer mon mot de passe",
  },
  renvoi_supervision: {
    sujet: "Votre accès à Gerimmo — créez votre mot de passe",
    titre: "Votre accès à Gerimmo",
    texte:
      "Voici un nouveau lien pour créer votre mot de passe et accéder à l’espace de votre organisation sur Gerimmo. Les liens envoyés précédemment ne sont plus à utiliser.",
    bouton: "Créer mon mot de passe",
  },
  invitation_agent: {
    sujet: "Vous rejoignez l’équipe d’une agence sur Gerimmo — créez votre mot de passe",
    titre: "Bienvenue dans l’équipe",
    texte:
      "Vous avez été ajouté comme agent à l’équipe d’une agence sur Gerimmo. Pour accéder à votre espace, créez votre mot de passe.",
    bouton: "Créer mon mot de passe",
  },
  invitation_locataire: {
    sujet: "Votre espace locataire Gerimmo — créez votre mot de passe",
    titre: "Votre espace locataire est ouvert",
    texte:
      "Votre gestionnaire vous a ouvert un espace locataire sur Gerimmo : vous y retrouverez vos quittances et les documents de votre location. Pour y accéder, créez votre mot de passe.",
    bouton: "Créer mon mot de passe",
  },
  mot_de_passe_oublie: {
    sujet: "Réinitialisation de votre mot de passe Gerimmo",
    titre: "Choisissez un nouveau mot de passe",
    texte:
      "Une réinitialisation du mot de passe de votre compte Gerimmo a été demandée. Pour choisir un nouveau mot de passe, suivez le lien ci-dessous.",
    bouton: "Choisir un nouveau mot de passe",
  },
  compte_existant: {
    sujet: "Vous avez déjà un compte Gerimmo",
    titre: "Vous avez déjà un compte",
    texte:
      "Quelqu’un — sans doute vous — a voulu créer un compte Gerimmo avec cette adresse, qui en a déjà un. Connectez-vous avec votre mot de passe habituel ; si vous l’avez oublié, choisissez-en un nouveau :",
    bouton: "Choisir un nouveau mot de passe",
  },
  confirmation_inscription: {
    sujet: "Confirmez votre adresse — Gerimmo",
    titre: "Confirmez votre adresse",
    texte:
      "Vous venez de créer un compte Gerimmo. Pour l’ouvrir, confirmez que cette adresse est bien la vôtre :",
    bouton: "Confirmer mon adresse",
    renouvellement:
      "S’il a expiré, recommencez l’inscription avec la même adresse : un nouveau lien vous sera envoyé.",
    siIgnore:
      "Vous n’êtes pas à l’origine de cette inscription ? Ignorez ce message : aucun compte ne sera ouvert sans cette confirmation.",
  },
};

/** L'adresse IP du visiteur, telle que la plateforme (Vercel) la transmet. */
export async function ipDeLaRequete(): Promise<string | null> {
  try {
    const h = await headers();
    const transmise = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return transmise || h.get("x-real-ip")?.trim() || null;
  } catch {
    return null;
  }
}

/** Les types de jeton que nos liens portent. `signup` confirme l'adresse à l'inscription. */
export type TypeLien = "recovery" | "signup";

/** Le lien que l'e-mail porte. Exporté pour les tests. */
export function construireLien(origine: string, jetonHache: string, next: string, type: TypeLien = "recovery"): string {
  const url = new URL("/auth/confirm", origine);
  url.searchParams.set("token_hash", jetonHache);
  url.searchParams.set("type", type);
  url.searchParams.set("next", destinationSure(next, type === "signup" ? "/espaces" : "/nouveau-mot-de-passe"));
  return url.toString();
}

function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Le corps de l'e-mail, aux couleurs des autres courriers du produit. Exporté pour les tests. */
export function corpsCourrier(motif: MotifLien, lien: string, origine: string): string {
  const c = COURRIERS[motif];
  const href = echapper(lien);
  const oublie = echapper(`${origine}/mot-de-passe-oublie`);
  const renouvellement =
    c.renouvellement ?? `S’il a expiré, demandez-en un nouveau sur <a href="${oublie}">la page « Mot de passe oublié »</a>.`;
  const siIgnore = c.siIgnore ?? "Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre compte reste inchangé.";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#151b2b;max-width:560px">
      <h2 style="color:#0f2352">${c.titre}</h2>
      <p>Bonjour,</p>
      <p>${c.texte}</p>
      <p style="margin:24px 0">
        <a href="${href}" style="display:inline-block;background:#0f2352;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${c.bouton}</a>
      </p>
      <p style="color:#4a5163">Ce lien est personnel, valable pour une durée limitée et ne sert qu’une fois. ${renouvellement}</p>
      <p style="color:#4a5163">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><span style="word-break:break-all">${href}</span></p>
      <p style="color:#4a5163">${siIgnore}</p>
      <p>— L’équipe Gerimmo</p>
    </div>`;
}

export function sujetCourrier(motif: MotifLien): string {
  return COURRIERS[motif].sujet;
}

type Service = NonNullable<ReturnType<typeof clientDeService>>;
type Refus = { erreur: string; limite?: true };

/** La limite des demandes anonymes : 3 par adresse et 20 par IP sur une heure. `null` : la demande passe. */
async function limiteAnonyme(service: Service, email: string): Promise<Refus | null> {
  const { data: autorise, error } = await service.rpc("autoriser_lien_mot_de_passe", {
    p_email: email,
    p_ip: await ipDeLaRequete(),
  });
  if (error) return { erreur: INDISPONIBLE };
  if (autorise !== true) return { erreur: MESSAGE_TROP_DE_DEMANDES, limite: true };
  return null;
}

/** La limite par organisation (invitations) : 30 liens par heure. `null` : la demande passe. */
async function limiteOrganisation(service: Service, organisation: string): Promise<Refus | null> {
  const { data: autorise, error } = await service.rpc("autoriser_lien_mot_de_passe_cle", {
    p_cle: `organisation:${organisation}`,
    p_max: LIMITE_INVITATIONS_PAR_ORGANISATION,
  });
  if (error) return { erreur: INDISPONIBLE };
  if (autorise !== true) return { erreur: MESSAGE_TROP_D_INVITATIONS, limite: true };
  return null;
}

/** Bâtit le lien et envoie le courrier. Rend l'erreur d'envoi, ou `null`. */
async function envoyerCourrier(params: {
  origine: string;
  email: string;
  motif: MotifLien;
  jeton: string;
  next: string;
  type: TypeLien;
}): Promise<string | null> {
  const lien = construireLien(params.origine, params.jeton, params.next, params.type);
  const envoi = await envoyerEmail({
    to: params.email,
    subject: sujetCourrier(params.motif),
    html: corpsCourrier(params.motif, lien, params.origine),
  });
  if (envoi.erreur) {
    console.error("[lien-mot-de-passe] e-mail non parti :", params.motif, envoi.erreur);
    return envoi.erreur;
  }
  return null;
}

/**
 * Fabrique un lien de mot de passe pour `email` et l'envoie.
 *
 * À n'appeler que depuis une action serveur, APRÈS ses contrôles d'accès.
 * Rend `{}` quand l'e-mail est parti — ou, pour une demande anonyme, quand
 * l'adresse est inconnue (réponse neutre). `limite` signale un refus de la
 * limite de fréquence. `organisation` : l'invitation compte dans la limite de
 * cette organisation (30 par heure).
 */
export async function envoyerLienMotDePasse(params: {
  email: string;
  motif: MotifLien;
  next?: string;
  organisation?: string;
}): Promise<{ erreur?: string; limite?: true }> {
  const email = params.email.trim().toLowerCase();
  const anonyme = MOTIFS_ANONYMES.has(params.motif);
  if (!email) return { erreur: "Adresse e-mail manquante." };

  const origine = adresseDuSite();
  const service = clientDeService();
  if (!origine || !service) return { erreur: NON_CONFIGURE };

  if (anonyme) {
    const refus = await limiteAnonyme(service, email);
    if (refus) return refus;
  } else if (params.organisation) {
    const refus = await limiteOrganisation(service, params.organisation);
    if (refus) return refus;
  }

  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  const jeton = data?.properties?.hashed_token;
  if (error || !jeton) {
    // Adresse sans compte (ou refus d'Auth) : silence pour une demande anonyme,
    // l'erreur pour une invitation — celui qui invite doit savoir.
    if (anonyme) return {};
    return { erreur: sansJargon(error?.message ?? "Le lien n’a pas pu être créé.") };
  }

  const erreurEnvoi = await envoyerCourrier({
    origine,
    email,
    motif: params.motif,
    jeton,
    next: params.next ?? "/nouveau-mot-de-passe",
    type: "recovery",
  });
  if (erreurEnvoi) return anonyme ? {} : { erreur: erreurEnvoi };
  return {};
}

export type ResultatInscription =
  /** Le compte est créé (ou existait sans confirmation) : le lien de confirmation est parti. */
  | { etat: "confirmation_envoyee" }
  /** L'adresse a déjà un compte confirmé : son titulaire a reçu un lien de reconnexion. */
  | { etat: "compte_existant" }
  /** Auth a rendu l'adresse déjà confirmée (projet sans confirmation d'e-mail) : la session peut s'ouvrir. */
  | { etat: "deja_confirme" }
  | { erreur: string; code?: string; limite?: true };

/** L'erreur d'Auth qui dit qu'un compte confirmé porte déjà cette adresse. Exporté pour les tests. */
export function adresseDejaInscrite(error: { code?: string; message: string }): boolean {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already (been )?registered/i.test(error.message)
  );
}

/**
 * Crée le compte d'une inscription et envoie NOTRE lien de confirmation.
 *
 * Une seule opération Auth (`generateLink`, type `signup`) : elle crée
 * l'utilisateur avec ses métadonnées, applique la politique de mot de passe,
 * n'envoie aucun e-mail et rend l'empreinte du jeton. Demande anonyme : la
 * limite de fréquence s'applique d'abord. L'erreur rendue garde le `code` de
 * Supabase pour que l'action la classe (mot de passe faible…).
 */
export async function inscrireEtEnvoyerConfirmation(params: {
  email: string;
  motDePasse: string;
  metadonnees: Record<string, unknown>;
  next: string;
}): Promise<ResultatInscription> {
  const email = params.email.trim().toLowerCase();
  if (!email) return { erreur: "Adresse e-mail manquante." };

  const origine = adresseDuSite();
  const service = clientDeService();
  if (!origine || !service) return { erreur: NON_CONFIGURE };

  const refus = await limiteAnonyme(service, email);
  if (refus) return refus;

  const { data, error } = await service.auth.admin.generateLink({
    type: "signup",
    email,
    password: params.motDePasse,
    options: { data: params.metadonnees },
  });

  if (error) {
    if (adresseDejaInscrite(error)) {
      // Le titulaire reçoit de quoi se reconnecter (le même lien que « mot de
      // passe oublié »). La limite a déjà compté cette demande ; l'échec de
      // l'envoi est ignoré : la réponse reste neutre.
      const { data: recuperation } = await service.auth.admin.generateLink({ type: "recovery", email });
      const jeton = recuperation?.properties?.hashed_token;
      if (jeton) {
        await envoyerCourrier({ origine, email, motif: "compte_existant", jeton, next: "/nouveau-mot-de-passe", type: "recovery" });
      }
      return { etat: "compte_existant" };
    }
    return { erreur: error.message, code: error.code };
  }

  // Un projet qui n'exige pas la confirmation d'adresse (banc local) rend le
  // compte déjà confirmé : pas de courrier, la session s'ouvre tout de suite.
  if (data.user?.email_confirmed_at) return { etat: "deja_confirme" };

  const jeton = data.properties?.hashed_token;
  if (!jeton) return { erreur: "Le lien de confirmation n’a pas pu être créé." };

  const erreurEnvoi = await envoyerCourrier({
    origine,
    email,
    motif: "confirmation_inscription",
    jeton,
    next: params.next,
    type: "signup",
  });
  if (erreurEnvoi) return { erreur: erreurEnvoi };
  return { etat: "confirmation_envoyee" };
}
