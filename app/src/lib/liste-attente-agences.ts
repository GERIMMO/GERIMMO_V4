// LISTE D'ATTENTE DES AGENCES DE GESTION (20/10/2026).
//
// La V1 publique s'adresse aux propriétaires bailleurs et aux SCI ; les agences sont hors du site public depuis le
// 13/10 (code et espace /agence conservés). Le dirigeant veut que les agences puissent se déclarer intéressées avant
// l'ouverture de leur offre : ce module porte ce qui est commun au formulaire du site (src/app/agences), à l'action
// serveur qui l'enregistre et à la console du dirigeant (/admin/liste-attente). Table : public.liste_attente_agences
// (migration 20261020120000), distincte de `liste_attente` (29/09, visiteurs du site, hors dépôt puis bornée le 19/10).
//
// Règles : seules des fonctions pures ici (ni "use server", ni accès à la base) ; les bornes reprennent exactement celles
// de la base, pour que le refus arrive avant l'envoi avec un message en français.

/** Les tranches de lots gérés, telles que la base les admet (`nb_lots`). */
export const TRANCHES_LOTS = [
  { code: "moins_de_50", libelle: "Moins de 50 lots" },
  { code: "50_a_199", libelle: "De 50 à 199 lots" },
  { code: "200_a_499", libelle: "De 200 à 499 lots" },
  { code: "500_et_plus", libelle: "500 lots et plus" },
] as const;
export type TrancheLots = (typeof TRANCHES_LOTS)[number]["code"];

/** Les états d'une inscription, suivis par le dirigeant dans la console (`statut`). */
export const STATUTS_LISTE_ATTENTE = {
  en_attente: "En attente",
  contactee: "Contactée",
  convertie: "Devenue cliente",
  retiree: "Retirée à sa demande",
} as const;
export type StatutListeAttente = keyof typeof STATUTS_LISTE_ATTENTE;

/** Message de succès du formulaire ; c'est aussi celui d'un doublon (on ne révèle pas qu'une adresse est déjà connue). */
export const MESSAGE_SUCCES_LISTE_ATTENTE =
  "Merci ! Votre agence est sur la liste d'attente. Nous vous écrirons dès l'ouverture de l'offre aux agences, sans autre sollicitation.";

/** Bornes de la base (contraintes CHECK de public.liste_attente_agences) : à garder identiques. */
export const BORNES_LISTE_ATTENTE = {
  email: 254,
  agence: 120,
  contact: 120,
  telephone: 40,
  message: 1000,
  source: 80,
} as const;

export type InscriptionAgence = {
  agence: string;
  contact: string;
  email: string;
  telephone: string | null;
  code_postal: string;
  nb_lots: TrancheLots;
  message: string | null;
};

// Les blancs Unicode hors ASCII que la base refuse dans une adresse (mêmes caractères que liste_attente_email_borne) :
// espace insécable, espace ogham, espaces typographiques U+2000 à U+200B, séparateurs de ligne et de paragraphe, espace fine
// insécable, espace mathématique, espace idéographique, marque d'ordre des octets. Construits par code plutôt qu'écrits en
// clair : certains sont invisibles, et U+2028 termine une ligne pour le lecteur JavaScript.
const car = (code: number) => String.fromCharCode(code);
const BLANCS_UNICODE = new RegExp(
  `[${car(0x00a0)}${car(0x1680)}${car(0x2000)}-${car(0x200b)}${car(0x2028)}${car(0x2029)}${car(0x202f)}${car(0x205f)}${car(0x3000)}${car(0xfeff)}]`,
);
// Caractères de contrôle (U+0000 à U+001F et U+007F), le saut de ligne excepté : admis dans le message seulement.
const CONTROLE_SAUF_SAUT = new RegExp(`[${car(0)}-${car(9)}${car(0x0b)}-${car(0x1f)}${car(0x7f)}]`);
const CONTROLE = new RegExp(`[${car(0)}-${car(0x1f)}${car(0x7f)}]`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const texte = (f: FormData, nom: string) => String(f.get(nom) ?? "").replace(/\r\n?/g, "\n").trim();
/** Un caractère de contrôle (tabulation collée avec un texte, par exemple) : dit pour ce qu'il est, pas comme une longueur dépassée. */
const caractereNonAdmis = (champ: string, suite = "retirez-le") =>
  `${champ} contient un caractère invisible non admis (une tabulation, par exemple) : ${suite}.`;

export function estTranche(code: string): code is TrancheLots {
  return TRANCHES_LOTS.some((t) => t.code === code);
}

export function libelleTranche(code: string | null): string {
  return TRANCHES_LOTS.find((t) => t.code === code)?.libelle ?? "—";
}

/**
 * Valide la saisie du formulaire ; renvoie les valeurs normalisées (espaces du code postal retirés, saut de ligne
 * normalisé) ou le premier défaut, en français, dans l'ordre des champs.
 */
export function validerInscriptionAgence(f: FormData): { valeurs: InscriptionAgence } | { erreur: string } {
  const agence = texte(f, "agence");
  const contact = texte(f, "contact");
  const email = texte(f, "email");
  const telephone = texte(f, "telephone");
  const codePostal = texte(f, "code_postal").replace(/\s+/g, "");
  const nbLots = texte(f, "nb_lots");
  const message = texte(f, "message");

  if (!agence) return { erreur: "Indiquez le nom de votre agence." };
  if (agence.length > BORNES_LISTE_ATTENTE.agence) {
    return { erreur: `Le nom de l'agence ne doit pas dépasser ${BORNES_LISTE_ATTENTE.agence} caractères.` };
  }
  if (CONTROLE.test(agence)) return { erreur: caractereNonAdmis("Le nom de l'agence") };
  if (!contact) return { erreur: "Indiquez votre nom." };
  if (contact.length > BORNES_LISTE_ATTENTE.contact) {
    return { erreur: `Votre nom ne doit pas dépasser ${BORNES_LISTE_ATTENTE.contact} caractères.` };
  }
  if (CONTROLE.test(contact)) return { erreur: caractereNonAdmis("Votre nom") };
  if (!EMAIL.test(email) || email.length > BORNES_LISTE_ATTENTE.email || BLANCS_UNICODE.test(email) || CONTROLE.test(email)) {
    return { erreur: "Indiquez une adresse e-mail valide : c'est là que nous vous écrirons." };
  }
  if (telephone && telephone.length > BORNES_LISTE_ATTENTE.telephone) {
    return { erreur: `Le téléphone ne doit pas dépasser ${BORNES_LISTE_ATTENTE.telephone} caractères.` };
  }
  if (telephone && CONTROLE.test(telephone)) return { erreur: caractereNonAdmis("Le téléphone") };
  if (!/^[0-9]{5}$/.test(codePostal)) return { erreur: "Indiquez le code postal de l'agence : cinq chiffres." };
  if (!estTranche(nbLots)) return { erreur: "Indiquez le nombre de lots que vous gérez." };
  if (message && message.length > BORNES_LISTE_ATTENTE.message) {
    return { erreur: `Votre message ne doit pas dépasser ${BORNES_LISTE_ATTENTE.message} caractères.` };
  }
  if (message && CONTROLE_SAUF_SAUT.test(message)) {
    return { erreur: caractereNonAdmis("Votre message", "seuls les sauts de ligne sont acceptés") };
  }

  return {
    valeurs: {
      agence,
      contact,
      email,
      telephone: telephone || null,
      code_postal: codePostal,
      nb_lots: nbLots,
      message: message || null,
    },
  };
}

/**
 * Les identifiants rendus par `inscriptions_agences_opposees` (inscriptions retirées ou adresses opposées). La fonction
 * rend une table à une colonne `id` ([{"id": …}]) ; une valeur nue est acceptée aussi. Toute autre forme est écartée,
 * jamais convertie en « [object Object] » (relecture transverse du 24/10 : l'émulateur des parcours rendait des objets,
 * et aucune opposition n'était reconnue).
 */
export function identifiantsOpposes(donnees: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(donnees)) return ids;
  for (const d of donnees) {
    if (typeof d === "string" && d !== "") ids.add(d);
    else if (d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string") ids.add((d as { id: string }).id);
  }
  return ids;
}
