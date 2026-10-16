// L'INVITATION D'UN ARTISAN PAR UN PROPRIÉTAIRE DIRECT (décision du dirigeant du 15/10/2026).
//
// « L'artisan doit pouvoir être invité par un propriétaire, ce sera à l'artisan de s'inscrire. » Le propriétaire invite
// par l'adresse e-mail ; l'artisan crée son compte, inscrit son entreprise, dépose ses attestations ; Gerimmo le valide ;
// une fois l'invitation acceptée, il est dans le carnet du propriétaire et peut être sollicité par lui, même si la
// commune du bien n'est pas ouverte au réseau — pour les biens situés dans sa zone d'intervention.
//
// Ce fichier est PUR (aucun accès à la base, aucun secret) : libellés, lien de l'e-mail, lecture de l'adresse pré-remplie.
// Les règles sont en base (migration 20261014840000) ; l'écran les nomme.

import { formaterDate } from "@/lib/ged";
import { baseEspace } from "@/lib/racine-espace";

/** Même forme que la contrainte de la table `invitations_artisans`. */
export const ADRESSE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LONGUEUR_MAX_EMAIL = 254;
export const LONGUEUR_MAX_NOM_MEMO = 120;

/** L'ancre du formulaire « Inviter un artisan » dans le carnet du propriétaire ; la voie de sortie « commune fermée » y mène. */
export const ANCRE_INVITER_ARTISAN = "inviter-un-artisan";

/** Le carnet n'existe que chez le propriétaire direct : son adresse vit sous `/espace/<id>` (décision D27). */
export function cheminCarnetInvitation(orgId: string): string {
  return `${baseEspace(orgId, true)}/artisans#${ANCRE_INVITER_ARTISAN}`;
}

export function cheminInvitationArtisan(invitationId: string): string {
  return `/artisan/invitation/${invitationId}`;
}

/**
 * Le lien de l'e-mail. L'adresse invitée voyage dans l'ANCRE (#adresse=…), jamais dans le chemin ni dans les paramètres :
 * l'ancre n'est envoyée à aucun serveur (ni le nôtre, ni ses journaux), elle ne sert qu'à pré-remplir le formulaire de
 * création du compte dans le navigateur de celui qui a reçu l'e-mail. Sans elle, le champ est simplement vide.
 */
export function lienInvitationArtisan(origine: string, invitationId: string, email: string): string {
  return `${origine.replace(/\/+$/, "")}${cheminInvitationArtisan(invitationId)}#adresse=${encodeURIComponent(email)}`;
}

/**
 * Ce que le propriétaire voit de l'artisan une fois l'invitation acceptée, dit à l'artisan AVANT qu'il accepte
 * (relecture du 15/10). La base lui ouvre alors la fiche de l'entreprise (règle de lecture `artisan_lisible`, commune
 * aux agences), limitée depuis 20261014842000 aux colonnes ouvertes aux clients : jamais les motifs, auteurs ni
 * échéances des décisions de Gerimmo. Chaque colonne ouverte a ses mots ici ; éprouvé dans
 * invitation-artisan-actions.test.ts, artisans-colonnes-internes.test.ts et invitation-artisan-proprietaire.test.ts.
 */
export const VISIBLE_APRES_ACCEPTATION =
  "le nom de votre entreprise, son SIRET et l’état de sa vérification, votre téléphone, votre adresse e-mail professionnelle, vos métiers, votre zone d’intervention, la visibilité de votre profil, la date de votre inscription et son état chez Gerimmo (en attente, validée ou refusée, exclusion éventuelle de la plateforme), mais jamais les motifs des décisions de Gerimmo";

/**
 * Le dernier jour de validité d'une invitation, au jour de Paris, ce jour-là inclus (seconde relecture du 15/10). Depuis
 * 20261014847000, une invitation expire à minuit, heure de Paris, au début du 31e jour : le dernier jour valable est la
 * veille de l'échéance. On le lit donc à l'instant qui précède l'échéance — une échéance plus ancienne, au milieu d'un
 * jour, se dit par ce jour-là. `long` : « 14 novembre 2026 » (e-mail) ; sinon « 14/11/2026 » (écrans).
 */
export function valableJusquAu(expireLe: string, forme: "court" | "long" = "court"): string {
  const dernierInstant = new Date(Date.parse(expireLe) - 1).toISOString();
  return forme === "long"
    ? new Date(dernierInstant).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    : formaterDate(dernierInstant);
}

/** Le nom de l'organisation qui invite, une fois borné (e-mail, page de l'artisan, console de validation). */
export const LONGUEUR_MAX_NOM_INVITANT = 80;

// Caractères de contrôle, retours à la ligne, caractères invisibles et de sens d'écriture : remplacés par une espace.
const CARACTERES_INVISIBLES = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
// Ce qui ferait d'un nom un relais d'hameçonnage : un lien (même sans « http »), une adresse e-mail, un numéro de
// téléphone (six chiffres ou plus, espacés ou non), ou le nom de Gerimmo lui-même.
const LIEN_OU_ADRESSE = /https?:|www\.|@|[a-z0-9-]\.[a-z]{2,}\b/i;
const NUMERO = /(?:\d[\s.\-/()]*){6,}/;
const MARQUE = /gerimmo/i;

/**
 * Le nom de l'organisation qui invite tel qu'on peut le montrer à l'artisan (et au valideur) : sans caractère de
 * contrôle, espaces resserrées, tronqué à LONGUEUR_MAX_NOM_INVITANT caractères. NULL s'il est vide ou s'il contient un
 * lien, une adresse, un numéro ou le nom de Gerimmo : l'écran dit alors « un propriétaire ». Relecture du 15/10 : ce
 * nom est un texte libre de l'invitant, envoyé sous la marque Gerimmo à une adresse quelconque.
 */
export function nomInvitant(nom: string | null | undefined): string | null {
  const propre = (nom ?? "").replace(CARACTERES_INVISIBLES, " ").replace(/\s+/g, " ").trim();
  if (!propre || LIEN_OU_ADRESSE.test(propre) || NUMERO.test(propre) || MARQUE.test(propre)) return null;
  const lettres = Array.from(propre);
  return lettres.length > LONGUEUR_MAX_NOM_INVITANT
    ? `${lettres.slice(0, LONGUEUR_MAX_NOM_INVITANT - 1).join("").trimEnd()}…`
    : propre;
}

/** L'adresse pré-remplie, lue dans l'ancre de la page ; vide si elle manque ou n'a pas la forme d'une adresse. */
export function adresseDepuisAncre(ancre: string | null | undefined): string {
  if (!ancre) return "";
  try {
    const adresse = (new URLSearchParams(ancre.replace(/^#/, "")).get("adresse") ?? "").trim().toLowerCase();
    return adresse.length <= LONGUEUR_MAX_EMAIL && ADRESSE_EMAIL.test(adresse) ? adresse : "";
  } catch {
    return "";
  }
}

/** Une ligne du carnet du propriétaire, telle que `carnet_artisans_proprietaire` la rend. */
export type LigneCarnetArtisan = {
  invitation_id: string | null;
  email: string | null;
  nom_memo: string | null;
  metier_memo: string | null;
  etat_invitation: "en_attente" | "acceptee" | "refusee" | "annulee" | "expiree" | null;
  invite_le: string | null;
  envoye_le: string | null;
  erreur_envoi: boolean | null;
  expire_le: string | null;
  repondu_le: string | null;
  artisan_id: string | null;
  raison_sociale: string | null;
  telephone: string | null;
  statut_plateforme: "en_attente" | "valide" | "refuse" | null;
  sollicitable_plateforme: boolean | null;
  relation_statut: "actif" | "desactive" | null;
  liste_noire: boolean | null;
  metiers: string[] | null;
  codes_postaux: string[] | null;
};

export type TonEtat = "attente" | "succes" | "neutre" | "alerte";

export type EtatLigneCarnet = {
  libelle: string;
  ton: TonEtat;
  /** Les gestes que l'écran propose sur cette ligne. */
  renvoyer: boolean;
  annuler: boolean;
  reinviter: boolean;
};

/**
 * L'état lisible d'une ligne du carnet. Avant l'acceptation, c'est l'état de l'invitation ; après, celui de l'artisan
 * (validation de Gerimmo, relation dans le carnet). « Validé » ne s'affiche que si Gerimmo l'a validé, SIRET vérifié et
 * sans exclusion ; il ne promet pas de sollicitation (seconde relecture du 15/10) : la zone et la décennale se jugent
 * bien par bien, et la fiche de l'incident dit pourquoi un artisan n'y est pas proposé (`motifsCarnetPourBien`).
 * Un échec d'envoi n'est jamais masqué par un envoi réussi plus ancien.
 */
export function etatLigneCarnet(ligne: LigneCarnetArtisan): EtatLigneCarnet {
  const sans = { renvoyer: false, annuler: false, reinviter: false };
  if (ligne.artisan_id) {
    if (ligne.liste_noire) return { ...sans, libelle: "Sur votre liste noire", ton: "alerte" };
    if (ligne.relation_statut === "desactive") return { ...sans, libelle: "Désactivé dans votre carnet", ton: "neutre" };
    if (ligne.statut_plateforme === "refuse") return { ...sans, libelle: "Inscription refusée par Gerimmo", ton: "alerte" };
    if (ligne.statut_plateforme === "valide") {
      return ligne.sollicitable_plateforme
        ? { ...sans, libelle: "Validé", ton: "succes" }
        : { ...sans, libelle: "Ne peut pas être sollicité pour le moment", ton: "neutre" };
    }
    return { ...sans, libelle: "Inscrit, en attente de validation par Gerimmo", ton: "attente" };
  }
  switch (ligne.etat_invitation) {
    case "en_attente": {
      const gestes = { renvoyer: true, annuler: true, reinviter: false };
      if (ligne.erreur_envoi) {
        return {
          ...gestes,
          ton: "alerte",
          libelle: ligne.envoye_le
            ? `Invitation envoyée le ${formaterDate(ligne.envoye_le)}, mais le dernier envoi n’est pas parti`
            : `Invitation enregistrée le ${formaterDate(ligne.invite_le)}, e-mail non envoyé`,
        };
      }
      return ligne.envoye_le
        ? { ...gestes, ton: "attente", libelle: `Invitation envoyée le ${formaterDate(ligne.envoye_le)}` }
        : { ...gestes, ton: "attente", libelle: `Invitation enregistrée le ${formaterDate(ligne.invite_le)}, envoi non confirmé` };
    }
    case "expiree":
      return { ...sans, libelle: "Invitation expirée", ton: "neutre", reinviter: true };
    case "annulee":
      return { ...sans, libelle: "Annulée", ton: "neutre", reinviter: true };
    case "refusee":
      return { ...sans, libelle: "Invitation refusée par l’artisan", ton: "neutre" };
    case "acceptee":
      return { ...sans, libelle: "Invitation acceptée", ton: "succes" };
    default:
      return { ...sans, libelle: "État inconnu", ton: "neutre" };
  }
}

/**
 * Un artisan du carnet, vu pour UN bien (`carnet_artisans_bien`, 20261014848000) : les conditions de
 * `artisan_affectable`, chacune lue au serveur (la zone par `zone_artisan_couvre`, la décennale par
 * `artisan_decennale_valide`).
 */
export type ArtisanCarnetBien = {
  artisan_id: string;
  raison_sociale: string;
  metiers: string[] | null;
  sollicitable_plateforme: boolean;
  relation_active: boolean;
  zone_couvre: boolean;
  decennale_valide: boolean;
  code_postal: string | null;
};

/**
 * Pourquoi cet artisan du carnet ne peut pas être sollicité pour ce bien et ces travaux (seconde relecture du 15/10) :
 * NULL s'il n'exerce pas ce métier (il n'est pas concerné), [] s'il peut l'être. Les motifs reprennent une à une les
 * conditions de `artisan_affectable` ; la fidélité est éprouvée dans invitation-artisan-proprietaire.test.ts.
 */
export function motifsCarnetPourBien(artisan: ArtisanCarnetBien, metier: string, decennaleExigee: boolean): string[] | null {
  if (!(artisan.metiers ?? []).includes(metier)) return null;
  const motifs: string[] = [];
  if (!artisan.relation_active) motifs.push("désactivé dans votre carnet ou sur votre liste noire");
  if (!artisan.sollicitable_plateforme) motifs.push("inscription pas validée par Gerimmo pour le moment");
  if (!artisan.zone_couvre) motifs.push(`sa zone d’intervention ne couvre pas le ${artisan.code_postal ?? "code postal du bien"}`);
  if (decennaleExigee && !artisan.decennale_valide) motifs.push("pas de garantie décennale valide, exigée pour ces travaux");
  return motifs;
}

/** Ce que voit l'artisan sur la page de son invitation (`mon_invitation_artisan`). */
export type InvitationRecue = {
  id: string;
  organisation: string;
  etat: "en_attente" | "acceptee" | "refusee" | "annulee" | "expiree";
  expire_le: string;
  a_une_fiche: boolean;
};
