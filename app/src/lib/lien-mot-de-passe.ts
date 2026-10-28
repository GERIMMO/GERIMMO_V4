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
// L’inscription crée un compte avec un secret aléatoire serveur. Le titulaire
// choisit son mot de passe et valide ses informations après confirmation de
// l’adresse. Une reprise renouvelle le lien sans modifier un compte existant.
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
import { cookies, headers } from "next/headers";
import { clientDeService } from "@/lib/supabase/service";
import {
  CLE_EMPREINTE_INSCRIPTION,
  COOKIE_INSCRIPTION,
  MOTIF_CONFIRMATION,
  MOTIF_INSCRIPTION,
  motDePasseInconnu,
  optionsCookieInscription,
  RAISON_ADRESSE_CONFIRMEE,
} from "@/lib/temoin-inscription";
import { envoyerEmail } from "@/lib/email";
import { adresseDuSite } from "@/lib/site";
import { destinationSure } from "@/lib/destination-sure";
import { sansJargon } from "@/lib/erreurs";
import { suiteInvitationLocataire } from "@/lib/invitations-locataire";
import { CLE_PROFIL_A_CONFIRMER, informationsAConfirmer } from "@/lib/revalidation-inscription";

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
    sujet: "Votre invitation locataire Gerimmo",
    titre: "Vous êtes invité sur Gerimmo",
    texte:
      "Votre gestionnaire vous propose un espace locataire sur Gerimmo. Après avoir sécurisé votre compte, vous pourrez accepter ou refuser cette invitation, valable 30 jours. Aucun accès à ce nouvel espace ne sera accordé avant votre acceptation.",
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
export function construireLien(origine: string, jetonHache: string, next: string, type: TypeLien = "recovery", email?: string): string {
  const url = new URL("/auth/confirm", origine);
  url.searchParams.set("token_hash", jetonHache);
  url.searchParams.set("type", type);
  url.searchParams.set("next", destinationSure(next, type === "signup" ? "/espaces" : "/nouveau-mot-de-passe"));
  if (email) url.searchParams.set("email", email.trim().toLowerCase());
  return url.toString();
}

function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Le corps de l'e-mail, aux couleurs des autres courriers du produit. Exporté pour les tests. */
export function corpsCourrier(motif: MotifLien, lien: string, origine: string): string {
  return corpsDuCourrier(COURRIERS[motif], lien, origine);
}

function corpsDuCourrier(c: Courrier, lien: string, origine: string): string {
  const href = echapper(lien);
  const oublie = echapper(`${origine}/mot-de-passe-oublie`);
  const renouvellement =
    c.renouvellement ?? `S’il a expiré, demandez-en un nouveau sur <a href="${oublie}">la page « Mot de passe oublié »</a>.`;
  const siIgnore = c.siIgnore ?? "Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre compte reste inchangé.";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#16243a;max-width:560px">
      <h2 style="color:#14304f">${c.titre}</h2>
      <p>Bonjour,</p>
      <p>${c.texte}</p>
      <p style="margin:24px 0">
        <a href="${href}" style="display:inline-block;background:#14304f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${c.bouton}</a>
      </p>
      <p style="color:#626f82">Ce lien est personnel, valable pour une durée limitée et ne sert qu’une fois. ${renouvellement}</p>
      <p style="color:#626f82">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><span style="word-break:break-all">${href}</span></p>
      <p style="color:#626f82">${siIgnore}</p>
      <p>— L’équipe Gerimmo</p>
    </div>`;
}

export function sujetCourrier(motif: MotifLien): string {
  return COURRIERS[motif].sujet;
}

// LES RELANCES AUTOMATIQUES D'UNE INVITATION DE LOCATAIRE (décision X16 du 15/10/2026, RM-16.6.1 : J+3 et J+10).
// Même gabarit que l'invitation, objet « Rappel : … », même destination (la page de réponse de CETTE invitation, voir
// `suiteInvitationLocataire`). Seul le texte dit la date d'expiration réelle au lieu de « valable 30 jours », et qu'un
// refus arrête les rappels (RM-16.7.2).

/** L'objet de la relance : celui de l'invitation, précédé de « Rappel : ». */
export const SUJET_RAPPEL_INVITATION_LOCATAIRE = `Rappel : ${COURRIERS.invitation_locataire.sujet}`;

/** « 14 novembre 2026 » : le jour de Paris de l'expiration. */
function jourEnLettres(instant: string): string {
  return new Date(instant).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });
}

/** Le corps de la relance (gabarit de l'invitation). Exporté pour les tests. */
export function corpsRappelInvitationLocataire(lien: string, origine: string, expireLe: string): string {
  const invitation = COURRIERS.invitation_locataire;
  return corpsDuCourrier(
    {
      ...invitation,
      sujet: SUJET_RAPPEL_INVITATION_LOCATAIRE,
      texte:
        `Votre gestionnaire vous a proposé un espace locataire sur Gerimmo et attend votre réponse. Après avoir sécurisé votre compte, vous pourrez accepter ou refuser cette invitation, valable jusqu’au ${jourEnLettres(expireLe)}. Si vous la refusez, vous ne recevrez plus de rappel. Aucun accès à ce nouvel espace ne sera accordé avant votre acceptation.`,
    },
    lien,
    origine
  );
}

/** L'issue d'une relance : partie, ou non, et dans ce cas si elle a pu partir quand même (délai dépassé). */
export type ResultatRappelInvitation = { envoye: true } | { envoye: false; erreur: string; incertain: boolean };

/**
 * Envoie UNE relance d'invitation de locataire. Appelée par la mission planifiée « rappels », APRÈS la réservation de
 * la relance en base (`reserver_relance_invitation_locataire`) et le contrôle de la limite par organisation : cette
 * fonction ne compte rien, ne réserve rien et ne trace rien.
 *
 * Le jeton de connexion d'un e-mail précédent ne sert plus : il est à usage unique, valable une heure dans le réglage
 * actuel du projet (3 600 s), et aucune relance ne part moins de trois jours après un e-mail d'invitation. Sans jeton
 * neuf, le bouton mènerait à « lien invalide » : un jeton neuf est fabriqué, comme au renvoi manuel. L'invitation, elle,
 * ne change pas (même identifiant, même échéance, même page de réponse).
 *
 * `avantEnvoi` (arrêt d'urgence) est lu avant de fabriquer le jeton, puis juste avant l'appel au service d'e-mail.
 */
export async function envoyerRappelInvitationLocataire(params: {
  email: string;
  invitationId: string;
  expireLe: string;
  avantEnvoi?: () => Promise<void>;
  echeanceMs?: number;
  horloge?: () => number;
}): Promise<ResultatRappelInvitation> {
  const maintenant = params.horloge ?? Date.now;
  const reste = () => params.echeanceMs === undefined ? Infinity : params.echeanceMs - maintenant();
  const delaiEcoule = (): ResultatRappelInvitation => ({ envoye: false, erreur: "Le délai de cette relance est écoulé.", incertain: false });
  if (reste() <= 0) return delaiEcoule();
  const email = params.email.trim().toLowerCase();
  if (!email) return { envoye: false, erreur: "Adresse e-mail manquante.", incertain: false };
  const origine = adresseDuSite();
  const service = clientDeService();
  if (!origine || !service) return { envoye: false, erreur: NON_CONFIGURE, incertain: false };

  await params.avantEnvoi?.();
  if (reste() <= 0) return delaiEcoule();
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  if (reste() <= 0) return delaiEcoule();
  const jeton = data?.properties?.hashed_token;
  if (error || !jeton) {
    return { envoye: false, erreur: sansJargon(error?.message ?? "Le lien n’a pas pu être créé."), incertain: false };
  }
  const lien = construireLien(origine, jeton, suiteInvitationLocataire(params.invitationId), "recovery", email);
  const delaiMaxMs = Math.min(15_000, reste());
  if (delaiMaxMs <= 0) return delaiEcoule();
  const envoi = await envoyerEmail({
    to: email,
    subject: SUJET_RAPPEL_INVITATION_LOCATAIRE,
    html: corpsRappelInvitationLocataire(lien, origine, params.expireLe),
    get delaiMaxMs() { return Math.max(1, Math.floor(Math.min(15_000, reste()))); },
    avantEnvoi: async () => {
      await params.avantEnvoi?.();
      if (reste() <= 0) throw new Error("Le délai de cette relance est écoulé.");
    },
  });
  if (envoi.erreur) {
    console.error("[lien-mot-de-passe] relance d'invitation non partie :", envoi.incertain ? "délai dépassé" : "refus");
    return { envoye: false, erreur: envoi.erreur, incertain: envoi.incertain === true };
  }
  return { envoye: true };
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
  const lien = construireLien(params.origine, params.jeton, params.next, params.type, params.email);
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
  | { erreur: string; code?: string; limite?: true };

/** L'erreur d'Auth qui dit qu'un compte confirmé porte déjà cette adresse. Exporté pour les tests. */
export function adresseDejaInscrite(error: { code?: string; message: string }): boolean {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already (been )?registered/i.test(error.message)
  );
}

// LES RÈGLES D'AUTH QUE L'INSCRIPTION RESPECTE (contre-relecture finale du 15/10/2026, prouvées sur GoTrue v2.197.0).
// - Tout changement de mot de passe (`UpdatePassword`, par l'API d'administration comme par la session) vide le jeton
//   de confirmation, efface tous les jetons à usage unique et ferme les sessions : toutes par l'API d'administration,
//   toutes SAUF celle qui parle quand c'est la session elle-même (`auth.updateUser`). Poser un mot de passe APRÈS
//   `generateLink` tuait donc le lien envoyé, pour toute inscription ; le poser par l'administration après `verifyOtp`
//   fermait la session que le bouton venait d'ouvrir.
// - `generateLink` (signup) sur une adresse inscrite mais non confirmée renouvelle le jeton (les liens précédents
//   meurent), fusionne `data` dans les métadonnées et GARDE le mot de passe ; il n'applique alors aucune politique de
//   mot de passe.
// - Changer seulement des métadonnées ne touche ni aux jetons ni aux sessions.
//
// Une reprise ne modifie jamais le compte avant la confirmation de l'adresse.
// La session ouverte par le bouton porte les changements nécessaires.

/** Auth répond qu'aucun compte ne porte cette adresse (recherche par un lien de récupération). */
function compteIntrouvable(error: { code?: string; status?: number }): boolean {
  return error.code === "user_not_found" || error.status === 404;
}

/** Un instant d'Auth (« 2026-10-15T22:22:41.114601Z ») en microsecondes ; `null` s'il est illisible. */
function microsecondes(instant: unknown): number | null {
  if (typeof instant !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(instant);
  if (!m) return null;
  const secondes = Date.parse(`${m[1]}${m[3]}`);
  if (Number.isNaN(secondes)) return null;
  return secondes * 1000 + Number((m[2] ?? "").padEnd(6, "0").slice(0, 6));
}

/**
 * Le compte rendu par `generateLink` (signup) vient-il d'être CRÉÉ par cet appel ? Exporté pour les tests.
 *
 * Garde contre une course : l'adresse était libre à la recherche, mais un tiers l'a inscrite (avec SON mot de passe)
 * avant notre création. Auth relève l'heure de l'envoi (`confirmation_sent_at`) AVANT de créer le compte (GoTrue
 * v2.197.0, api/mail.go) : un compte créé par l'appel lui est postérieur, un compte qui existait déjà lui est
 * antérieur. Tout doute (champ absent ou illisible, égalité) répond « non » : le compte est alors traité comme
 * pré-inscrit, avec un lien de récupération et un choix explicite du mot de passe.
 */
export function creeParCetAppel(utilisateur: { created_at?: string; confirmation_sent_at?: string } | null | undefined): boolean {
  const creation = microsecondes(utilisateur?.created_at);
  const envoi = microsecondes(utilisateur?.confirmation_sent_at);
  return creation !== null && envoi !== null && creation > envoi;
}

type CompteAuth = { id: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> | null };

/**
 * Crée le compte d'une inscription (ou reprend une inscription jamais confirmée) et envoie NOTRE lien de confirmation.
 *
 * 1. Recherche : un lien de récupération pour l'adresse. Aucun compte : Auth répond « introuvable ». Compte confirmé :
 *    ce lien part à son titulaire (« vous avez déjà un compte »). Compte non confirmé : son identifiant.
 * 2. Adresse neuve : création avec un secret serveur et le profil proposé, encore à valider.
 * 3. Adresse pré-inscrite : le lien de récupération est envoyé sans modifier le compte.
 * 4. Les anciens témoins sont effacés, puis le courrier part.
 *
 * Demande anonyme : la limite de fréquence s'applique d'abord. La réponse est la même pour une adresse neuve,
 * pré-inscrite ou déjà confirmée (aucune énumération de comptes). L'erreur rendue garde le `code` de Supabase pour que
 * l'action la classe (mot de passe faible…).
 */
export async function inscrireEtEnvoyerConfirmation(params: {
  email: string;
  /** Compatibilité des appels précédents : cette valeur est ignorée. */
  motDePasse?: string;
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

  /** L'adresse a un compte confirmé : son titulaire reçoit de quoi se reconnecter ; l'échec de l'envoi est tu. */
  const prevenirTitulaire = async (jetonDejaFabrique?: string | null): Promise<ResultatInscription> => {
    let jeton = jetonDejaFabrique ?? null;
    if (!jeton) {
      const { data } = await service.auth.admin.generateLink({ type: "recovery", email });
      jeton = data?.properties?.hashed_token ?? null;
    }
    if (jeton) {
      const suite = destinationSure(params.next);
      const next = suite === "/espaces" ? "/nouveau-mot-de-passe" : `/nouveau-mot-de-passe?suite=${encodeURIComponent(suite)}`;
      await envoyerCourrier({ origine, email, motif: "compte_existant", jeton, next, type: "recovery" });
    }
    return { etat: "compte_existant" };
  };

  // 1. Recherche.
  const recherche = await service.auth.admin.generateLink({ type: "recovery", email });
  if (recherche.error && !compteIntrouvable(recherche.error)) return { erreur: INDISPONIBLE };
  let preInscrit: CompteAuth | null = recherche.error ? null : (recherche.data.user ?? null);
  if (!recherche.error && !preInscrit) return { erreur: INDISPONIBLE };
  if (preInscrit?.email_confirmed_at) return prevenirTitulaire(recherche.data.properties?.hashed_token);

  const motDePasse = motDePasseInconnu();
  const profilInitial = { [CLE_PROFIL_A_CONFIRMER]: informationsAConfirmer(params.metadonnees) };
  let jeton: string | null = null;

  // 2. Adresse neuve : une seule opération, aucun `updateUserById` (il effacerait le jeton du lien).
  if (!preInscrit) {
    const { data, error } = await service.auth.admin.generateLink({
      type: "signup",
      email,
      password: motDePasse,
      options: { data: profilInitial },
    });
    if (error) {
      if (adresseDejaInscrite(error)) return prevenirTitulaire();
      if (error.status && error.status >= 500) {
        const reprise = await service.auth.admin.generateLink({ type: "recovery", email });
        if (!reprise.error && reprise.data.user?.email_confirmed_at) return prevenirTitulaire(reprise.data.properties?.hashed_token);
        if (!reprise.error && reprise.data.user) preInscrit = reprise.data.user;
        else return { erreur: INDISPONIBLE };
      } else return { erreur: error.message, code: error.code };
    }
    // Un projet qui confirme automatiquement (ancien banc local) passe aussi
    // par le courrier de récupération et le choix explicite du mot de passe.
    if (!error) {
      if (data.user?.email_confirmed_at) return prevenirTitulaire();
      if (creeParCetAppel(data.user)) jeton = data.properties?.hashed_token ?? null;
      else if (data.user) preInscrit = data.user;
      else return { erreur: "Le lien de confirmation n’a pas pu être créé." };
    }
  }

  // Une reprise utilise un lien de récupération : le titulaire choisira son mot de passe après le clic.
  let typeLien: TypeLien = "signup";
  if (preInscrit) {
    const reprise = recherche.data.user?.id === preInscrit.id ? recherche : await service.auth.admin.generateLink({ type: "recovery", email });
    if (reprise.error) return { erreur: INDISPONIBLE };
    if (reprise.data.user?.email_confirmed_at) return prevenirTitulaire(reprise.data.properties?.hashed_token);
    jeton = reprise.data.properties?.hashed_token ?? null;
    typeLien = "recovery";
  }
  if (!jeton) return { erreur: "Le lien de confirmation n’a pas pu être créé." };

  // Effacement des anciens témoins avant le courrier.
  try {
    (await cookies()).set(COOKIE_INSCRIPTION, "", optionsCookieInscription(0));
  } catch (e) {
    console.error("[lien-mot-de-passe] ancien témoin non effacé :", e);
  }

  const erreurEnvoi = await envoyerCourrier({
    origine,
    email,
    motif: "confirmation_inscription",
    jeton,
    next: params.next,
    type: typeLien,
  });
  if (erreurEnvoi) return { erreur: erreurEnvoi };
  return { etat: "confirmation_envoyee" };
}

/** Les clés qu'Auth tient elle-même dans `user_metadata` (identité du fournisseur) : jamais effacées. */
const CLES_AUTH = new Set(["sub", "email", "email_verified", "phone_verified"]);

/**
 * Les métadonnées de cette inscription, et l'effacement (valeur nulle, règle d'Auth) de toute autre clé qu'une
 * inscription précédente aurait posée. Exporté pour les tests.
 */
export function metadonneesRemplacees(
  anciennes: Record<string, unknown> | null | undefined,
  nouvelles: Record<string, unknown>
): Record<string, unknown> {
  const effacees = Object.keys(anciennes ?? {})
    .filter((cle) => !(cle in nouvelles) && !CLES_AUTH.has(cle))
    .map((cle) => [cle, null] as const);
  return { ...Object.fromEntries(effacees), ...nouvelles };
}

/**
 * L'issue d'une confirmation d'inscription : la destination prévue ; d'abord le choix du mot de passe (session
 * ouverte) ; ou, si Auth a refusé de poser le mot de passe provisoire par la session, une nouvelle demande de lien.
 */
export type IssueConfirmationInscription = "mot_de_passe_a_choisir" | "mot_de_passe_a_redemander";

/** Ce que la fin de confirmation demande au client de la requête : la session que `verifyOtp` vient d'ouvrir. */
type SessionDeConfirmation = {
  auth: {
    updateUser: (attributs: { password?: string; data?: Record<string, unknown> }) => Promise<{ error: { message: string; code?: string; status?: number } | null }>;
    signOut: (options: { scope: "local" }) => Promise<unknown>;
  };
};

/**
 * L'inscription de ce compte n'est pas finie : l'empreinte du témoin y est encore (aucun bouton de confirmation n'est
 * passé par `finirConfirmationInscription`). Exporté pour la route et les tests.
 */
export function inscriptionInachevee(utilisateur: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return Boolean(utilisateur?.user_metadata?.[CLE_EMPREINTE_INSCRIPTION]) || Object.hasOwn(utilisateur?.user_metadata ?? {}, CLE_PROFIL_A_CONFIRMER);
}

/** Les champs du compte rendu par `verifyOtp` qui disent si CE clic a confirmé l'adresse. */
type CompteVerifie =
  | {
      email_confirmed_at?: string | null;
      confirmation_sent_at?: string | null;
      recovery_sent_at?: string | null;
    }
  | null
  | undefined;

/** Comparaison historique des instants Auth, conservée pour les tests du modèle. La route utilise le contexte serveur. */
export function premiereConfirmation(type: string, utilisateur: CompteVerifie): boolean {
  if (type === "email_change") return false;
  if (type === "signup" || type === "invite") return true;
  const confirmation = microsecondes(utilisateur?.email_confirmed_at);
  const envoisBruts = type === "email" ? [utilisateur?.confirmation_sent_at, utilisateur?.recovery_sent_at] : [utilisateur?.recovery_sent_at];
  const envois = envoisBruts.filter((v) => v !== null && v !== undefined).map(microsecondes);
  if (confirmation === null || envois.length === 0 || envois.some((e) => e === null)) return true;
  return confirmation >= Math.max(...(envois as number[]));
}

/** Destination du choix de mot de passe, avec conservation du parcours demandé. */
export function destinationApresConfirmation(
  issue: IssueConfirmationInscription,
  type: string,
  next: string,
  inscriptionDeGerimmo: boolean
): string {
  if (issue === "mot_de_passe_a_redemander") return `/mot-de-passe-oublie?raison=${RAISON_ADRESSE_CONFIRMEE}`;
  const motif = type === "signup" && inscriptionDeGerimmo ? MOTIF_INSCRIPTION : MOTIF_CONFIRMATION;
  const cible = new URL(next, "https://gerimmo.invalid");
  if (cible.pathname === "/nouveau-mot-de-passe") {
    cible.searchParams.set("motif", motif);
    return `${cible.pathname}${cible.search}`;
  }
  return `/nouveau-mot-de-passe?motif=${motif}&suite=${encodeURIComponent(next)}`;
}

/** Termine la confirmation dans sa session, puis demande le mot de passe et la validation du profil. */
export async function finirConfirmationInscription(
  session: SessionDeConfirmation,
  utilisateur: { id: string; user_metadata?: Record<string, unknown> | null } | null | undefined
): Promise<IssueConfirmationInscription> {
  const profil = metadonneesRemplacees(utilisateur?.user_metadata, {
    [CLE_PROFIL_A_CONFIRMER]: informationsAConfirmer(
      utilisateur?.user_metadata?.[CLE_PROFIL_A_CONFIRMER] && typeof utilisateur.user_metadata[CLE_PROFIL_A_CONFIRMER] === "object"
        ? utilisateur.user_metadata[CLE_PROFIL_A_CONFIRMER] as Record<string, unknown>
        : utilisateur?.user_metadata
    ),
  });
  const { error } = await session.auth.updateUser({ password: motDePasseInconnu(), data: profil });
  if (!error) return "mot_de_passe_a_choisir";

  console.error("[lien-mot-de-passe] mot de passe provisoire refusé par la session :", { statut: error.status, code: error.code, message: error.message });
  const service = clientDeService();
  if (utilisateur && service) {
    const { error: erreurService } = await service.auth.admin.updateUserById(utilisateur.id, {
      password: motDePasseInconnu(),
      user_metadata: profil,
    });
    if (erreurService) console.error("[lien-mot-de-passe] mot de passe provisoire non posé :", erreurService.message);
  } else {
    console.error("[lien-mot-de-passe] mot de passe provisoire non posé : service indisponible");
  }
  await session.auth.signOut({ scope: "local" });
  return "mot_de_passe_a_redemander";
}
