// La clé d'envoi d'un encaissement : un envoi n'encaisse qu'une fois.
//
// Décision du dirigeant du 14/10/2026, D05, option A, fiche PR178-B-06 : après une réponse perdue, la saisie reste à
// l'écran et le bouton reste actif ; un second clic créait un second encaissement (et un reçu en trop au locataire).
// Le formulaire produit UNE clé (champ caché `cle_envoi`, un UUID) et la rejoue telle quelle à chaque nouvel envoi du
// même formulaire ; la base la rend unique (colonne facultative `cle_envoi` + index unique partiel) : un second envoi
// de la même clé n'écrit rien et l'écran dit « déjà enregistré ». Le patron est celui de `retours_utilisateurs.cle_envoi`
// et de `creation_id` du parc.
//
// Ce module ne dépend d'aucune API serveur : il sert aussi bien aux actions qu'au composant du formulaire.
import { eur, formaterDate } from "@/lib/ged";

const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dit quoi faire, sans parler de clé : l'utilisatrice ne sait pas ce que c'est. */
export const MESSAGE_CLE_ENVOI_MANQUANTE =
  "La référence de cet envoi manque. Rechargez la page avant d'enregistrer, pour éviter un doublon.";

export type CleLue = { cle: string } | { erreur: string };

/** Lit le champ caché `cle_envoi` : un UUID, sinon l'action refuse avant d'écrire. */
export function lireCleEnvoi(brut: FormDataEntryValue | null): CleLue {
  const texte = typeof brut === "string" ? brut.trim() : "";
  if (!FORMAT_UUID.test(texte)) return { erreur: MESSAGE_CLE_ENVOI_MANQUANTE };
  return { cle: texte.toLowerCase() };
}

/** Un UUID v4. `crypto.randomUUID` n'existe qu'en contexte sécurisé (https, localhost) : repli sur `getRandomValues`. */
export function nouvelleCleEnvoi(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const o = c.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Le retour de l'action libère-t-il la clé du formulaire ? Seul un succès CONFIRMÉ par le serveur le fait (« enregistré »
 * comme « déjà enregistré ») : l'envoi suivant est alors un autre encaissement. Un refus de validation, une demande de
 * confirmation ou une réponse perdue (le retour est alors l'état précédent avec une erreur) gardent la clé : le
 * nouvel envoi du même formulaire doit rejouer la même.
 */
export function cleLiberee(etat: { succes?: string; erreur?: string } | null | undefined): boolean {
  return Boolean(etat?.succes) && !etat?.erreur;
}

/** Ce que PostgREST rend d'une erreur de la base. */
export type ErreurBase = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

/**
 * L'erreur est-elle « cette clé a déjà servi » ? Violation d'unicité (23505) dont le texte nomme `cle_envoi` : l'index
 * `*_cle_envoi_unique`, ou l'erreur que lève `encaisser_depot` pour un envoi déjà enregistré. Toute autre violation
 * d'unicité garde son message.
 */
export function estRejeuCleEnvoi(erreur: ErreurBase): boolean {
  if (!erreur || erreur.code !== "23505") return false;
  return /cle_envoi/.test(`${erreur.message ?? ""} ${erreur.details ?? ""}`);
}

/**
 * Le message d'un envoi déjà reçu : il dit « déjà enregistré », ce qui l'est, et que rien n'a été doublé.
 * `montantSaisi` n'est donné que si ce qui est tapé diffère de ce qui est enregistré.
 */
export function messageDejaEnregistre(p: {
  objet: string;
  feminin?: boolean;
  montant?: number | null;
  date?: string | null;
  montantSaisi?: number | null;
}): string {
  const participe = p.feminin ? "enregistrée" : "enregistré";
  const sujet = p.feminin ? "elle" : "il";
  const quoi = p.montant == null ? p.objet : `${p.objet} de ${eur(p.montant)}${p.date ? ` du ${formaterDate(p.date)}` : ""}`;
  const base = `${quoi} est déjà ${participe} : ${sujet} n'a pas été ${participe} une seconde fois.`;
  if (p.montantSaisi != null && p.montant != null && Math.round(p.montantSaisi * 100) !== Math.round(p.montant * 100)) {
    return `${base} Le montant saisi, ${eur(p.montantSaisi)}, n'a pas été pris en compte : saisissez-le de nouveau s'il s'agit d'un autre versement.`;
  }
  return base;
}
