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
// SÉCURITÉ.
// - La clé de service (src/lib/supabase/service.ts) ne sert ici qu'à fabriquer
//   un lien de récupération pour UNE adresse, jamais à lire ni écrire des
//   données. Ce module n'est appelé que par des actions serveur, APRÈS leurs
//   propres contrôles : superviseur permanent, admin de l'agence, ou le
//   formulaire public « mot de passe oublié ».
// - Les demandes anonymes (mot de passe oublié, adresse déjà inscrite) passent
//   d'abord par `autoriser_lien_mot_de_passe` : 3 par adresse et 20 par IP sur
//   une heure (20260930130000_limite_liens_mot_de_passe.sql). L'API
//   d'administration n'a pas la limite de Supabase Auth ; elle est ici.
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
  | "compte_existant";

/** Les motifs déclenchés SANS session : limités en fréquence, réponse neutre. */
const MOTIFS_ANONYMES: ReadonlySet<MotifLien> = new Set(["mot_de_passe_oublie", "compte_existant"]);

export const MESSAGE_TROP_DE_DEMANDES =
  "Trop de demandes de lien pour cette adresse ou depuis ce réseau. Réessayez dans une heure.";

type Courrier = { sujet: string; titre: string; texte: string; bouton: string };

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

/** Le lien que l'e-mail porte. Exporté pour les tests. */
export function construireLien(origine: string, jetonHache: string, next: string): string {
  const url = new URL("/auth/confirm", origine);
  url.searchParams.set("token_hash", jetonHache);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", destinationSure(next, "/nouveau-mot-de-passe"));
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
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#151b2b;max-width:560px">
      <h2 style="color:#0f2352">${c.titre}</h2>
      <p>Bonjour,</p>
      <p>${c.texte}</p>
      <p style="margin:24px 0">
        <a href="${href}" style="display:inline-block;background:#0f2352;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${c.bouton}</a>
      </p>
      <p style="color:#4a5163">Ce lien est personnel, valable pour une durée limitée et ne sert qu’une fois. S’il a expiré, demandez-en un nouveau sur <a href="${oublie}">la page « Mot de passe oublié »</a>.</p>
      <p style="color:#4a5163">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><span style="word-break:break-all">${href}</span></p>
      <p style="color:#4a5163">Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre compte reste inchangé.</p>
      <p>— L’équipe Gerimmo</p>
    </div>`;
}

export function sujetCourrier(motif: MotifLien): string {
  return COURRIERS[motif].sujet;
}

/**
 * Fabrique un lien de mot de passe pour `email` et l'envoie.
 *
 * À n'appeler que depuis une action serveur, APRÈS ses contrôles d'accès.
 * Rend `{}` quand l'e-mail est parti — ou, pour une demande anonyme, quand
 * l'adresse est inconnue (réponse neutre). `limite` signale un refus de la
 * limite de fréquence.
 */
export async function envoyerLienMotDePasse(params: {
  email: string;
  motif: MotifLien;
  next?: string;
}): Promise<{ erreur?: string; limite?: true }> {
  const email = params.email.trim().toLowerCase();
  const anonyme = MOTIFS_ANONYMES.has(params.motif);
  if (!email) return { erreur: "Adresse e-mail manquante." };

  const origine = adresseDuSite();
  const service = clientDeService();
  if (!origine || !service) {
    return { erreur: "L’envoi des liens de connexion n’est pas configuré. Contactez l’administrateur." };
  }

  if (anonyme) {
    const { data: autorise, error } = await service.rpc("autoriser_lien_mot_de_passe", {
      p_email: email,
      p_ip: await ipDeLaRequete(),
    });
    if (error) return { erreur: "Le service est momentanément indisponible. Réessayez dans un instant." };
    if (autorise !== true) return { erreur: MESSAGE_TROP_DE_DEMANDES, limite: true };
  }

  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  const jeton = data?.properties?.hashed_token;
  if (error || !jeton) {
    // Adresse sans compte (ou refus d'Auth) : silence pour une demande anonyme,
    // l'erreur pour une invitation — celui qui invite doit savoir.
    if (anonyme) return {};
    return { erreur: sansJargon(error?.message ?? "Le lien n’a pas pu être créé.") };
  }

  const lien = construireLien(origine, jeton, params.next ?? "/nouveau-mot-de-passe");
  const envoi = await envoyerEmail({
    to: email,
    subject: sujetCourrier(params.motif),
    html: corpsCourrier(params.motif, lien, origine),
  });
  if (envoi.erreur) {
    console.error("[lien-mot-de-passe] e-mail non parti :", params.motif, envoi.erreur);
    return anonyme ? {} : { erreur: envoi.erreur };
  }
  return {};
}
