// LE SUIVI DE L'ALERTE QUOTIDIENNE, À L'ÉCRAN (incident du 12 au 19/11/2026).
//
// L'alerte e-mail de 5 h (D46-B, `lib/relais-alerte-envoi.ts`) a échoué chaque jour du 12/11 au 19/11 sans
// destinataire, et personne ne l'a vu pendant huit jours : le seul signal était l'e-mail lui-même. Ce module lit le
// registre des passages (`relais_alertes_envois`, un rang par jour de Paris) et dit, sans rien envoyer ni modifier,
// si l'alerte attendue est partie. La console l'affiche sur l'accueil et sur « Santé et connexions ».
//
// CE QUI COMPTE COMME PARTI. Les résultats que consigne le passage (`terminer_alerte_relais`) :
//  - « envoye » : l'e-mail est parti vers toutes les adresses ;
//  - « envoi_partiel » : parti vers une partie seulement — l'alerte est partie, l'écran signale le reste ;
//  - « rien_a_signaler » : le passage a tout vérifié et n'avait rien à dire ; aucun e-mail, par conception.
// Ne comptent pas : « echec » (aucun envoi confirmé), « non_configure » (aucune adresse valide), « en_cours » passé
// l'échéance (passage coupé avant sa fin), et un jour sans rang (la tâche planifiée n'a pas été reçue).
//
// L'ÉCHÉANCE. Le passage n'agit qu'à 5 h à Paris (03 h UTC l'été, 04 h UTC l'hiver), en moins d'une minute, et aucun
// autre appel ne le reprend dans la journée. Passé 5 h 30 à Paris, le résultat du jour est donc acquis. Avant, c'est la
// veille qui fait foi, sauf si le passage du jour est déjà terminé.
//
// Rien ici ne lit l'environnement ni la base : la lecture du registre reçoit son client (`lirePassagesRelais`).

import { formaterDateHeureParis } from "./heure-paris";
import { dateParis, instantParis, lendemain } from "./heure-paris-calcul";
import { HEURE_RELAIS_PARIS, resultatPassageRelais, type PassageRelais } from "./relais-alerte";

/** La marge après 5 h (heure de Paris) au-delà de laquelle l'alerte du jour est attendue. */
export const MARGE_ALERTE_QUOTIDIENNE_MINUTES = 30;
/** Le registre garde six mois de passages (décision D48) : un rang par jour, au plus. */
export const PASSAGES_LUS = 200;

const PARTIS = new Set(["envoye", "envoi_partiel", "rien_a_signaler"]);

export type EtatAlerteQuotidienne =
  /** Le passage attendu (celui du jour, ou de la veille avant l'échéance) est parti, ou n'avait rien à signaler. */
  | "partie"
  /** L'échéance du jour n'est pas encore passée, et la veille est partie. */
  | "attendue"
  /** Le passage attendu n'est parti que vers une partie des adresses. */
  | "partielle"
  /** Un ou plusieurs jours de suite sans passage réussi, jusqu'au jour attendu. */
  | "en_defaut"
  /** Aucun passage réussi dans le registre. */
  | "jamais"
  /** Le registre n'a pas pu être lu. */
  | "illisible";

export type SuiviAlerteQuotidienne = {
  etat: EtatAlerteQuotidienne;
  /** Le jour de Paris de la lecture (AAAA-MM-JJ). */
  aujourdhui: string;
  /** Le dernier jour dont le passage est attendu : aujourd'hui après l'échéance, sinon la veille. Null si illisible. */
  jourAttendu: string | null;
  /** Les jours de suite sans passage réussi, jusqu'au jour attendu inclus (0 hors « en_defaut »). */
  joursEnDefaut: number;
  /** Le premier de ces jours (AAAA-MM-JJ), en « en_defaut » seulement. */
  depuis: string | null;
  /** Le dernier passage réussi (parti ou rien à signaler). */
  dernierReussi: PassageRelais | null;
  /** Le passage le plus récent, quel que soit son résultat. */
  dernier: PassageRelais | null;
  /** Le passage du jour attendu, s'il a laissé un rang. */
  passageAttendu: PassageRelais | null;
};

const jourDe = (p: PassageRelais) => String(p.jour ?? "").slice(0, 10);

/** Le jour précédent une date « AAAA-MM-JJ ». */
function veille(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
}

/** Le nombre de jours de `debut` à `fin` (dates « AAAA-MM-JJ »). */
function ecartJours(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

/** L'instant à partir duquel l'alerte d'un jour de Paris est attendue : 5 h 30, heure de Paris. */
export function echeanceAlerteQuotidienne(jour: string): Date {
  return instantParis(jour, HEURE_RELAIS_PARIS, MARGE_ALERTE_QUOTIDIENNE_MINUTES);
}

/** L'état de l'alerte quotidienne, d'après le registre des passages (dans n'importe quel ordre). Pur. */
export function suivreAlerteQuotidienne(passages: PassageRelais[] | null, maintenant: Date = new Date()): SuiviAlerteQuotidienne {
  const aujourdhui = dateParis(maintenant);
  const vide = { aujourdhui, joursEnDefaut: 0, depuis: null, dernierReussi: null, dernier: null, passageAttendu: null };
  if (passages === null) return { etat: "illisible", jourAttendu: null, ...vide };

  // Du plus récent au plus ancien ; un jour à venir (horloge décalée) n'est pas lu.
  const tries = passages
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(jourDe(p)) && jourDe(p) <= aujourdhui)
    .sort((a, b) => jourDe(b).localeCompare(jourDe(a)));
  const dernier = tries[0] ?? null;
  const duJour = dernier && jourDe(dernier) === aujourdhui ? dernier : null;
  // Le passage du jour fait foi dès l'échéance, ou plus tôt s'il est déjà terminé (réussi ou non).
  const echu = maintenant.getTime() >= echeanceAlerteQuotidienne(aujourdhui).getTime() || (duJour !== null && duJour.statut !== "en_cours");
  const jourAttendu = echu ? aujourdhui : veille(aujourdhui);
  const passageAttendu = tries.find((p) => jourDe(p) === jourAttendu) ?? null;
  const dernierReussi = tries.find((p) => PARTIS.has(p.statut)) ?? null;
  const base = { ...vide, jourAttendu, dernier, passageAttendu, dernierReussi };

  if (!dernierReussi) return { ...base, etat: "jamais" };
  const joursEnDefaut = Math.max(0, ecartJours(jourDe(dernierReussi), jourAttendu));
  if (joursEnDefaut > 0) return { ...base, etat: "en_defaut", joursEnDefaut, depuis: lendemain(jourDe(dernierReussi)) };
  if (passageAttendu?.statut === "envoi_partiel") return { ...base, etat: "partielle" };
  return { ...base, etat: jourAttendu === aujourdhui ? "partie" : "attendue" };
}

/** « 12/11 » */
function jourMois(jour: string): string {
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
}

/** Le résultat d'un passage ; « en cours » passé l'échéance est un passage coupé. */
function resultat(p: PassageRelais): string {
  return p.statut === "en_cours" ? "passage interrompu avant sa fin, aucun e-mail confirmé" : resultatPassageRelais(p);
}

/** Ce qu'il faut vérifier, selon le résultat du passage en défaut (ou son absence). */
function aVerifier(p: PassageRelais | null): string {
  switch (p?.statut) {
    case undefined:
      return "La tâche planifiée « alerte du relais » n’a laissé aucune trace : vérifiez-la chez l’hébergeur.";
    case "non_configure":
      return "Aucune adresse valide dans le réglage GERIMMO_RELAIS_EMAILS du serveur : renseignez-le chez l’hébergeur, puis redéployez.";
    case "echec":
      return "Le service d’e-mail n’a confirmé aucun envoi : vérifiez sa connexion et les adresses du relais.";
    case "en_cours":
      return "Le passage a été coupé avant sa fin : vérifiez les journaux de la tâche « alerte du relais » chez l’hébergeur.";
    default:
      return "Vérifiez la tâche planifiée « alerte du relais » et les adresses du relais.";
  }
}

const passageDate = (p: PassageRelais) => formaterDateHeureParis(p.termine_le ?? p.commence_le);

/**
 * Le bandeau à afficher : un titre et ses précisions, en français ; null quand l'alerte est partie ou pas encore
 * attendue. Ni adresse, ni contenu de l'e-mail : le registre n'en porte pas.
 */
export function messageAlerteQuotidienne(s: SuiviAlerteQuotidienne): { titre: string; details: string[] } | null {
  const dernierReussi = s.dernierReussi ? `Dernier passage réussi : ${passageDate(s.dernierReussi)} — ${resultat(s.dernierReussi)}.` : null;
  switch (s.etat) {
    case "partie":
    case "attendue":
      return null;
    case "illisible":
      return {
        titre: "L’état de l’alerte quotidienne n’a pas pu être lu.",
        details: ["Rien ne confirme qu’elle est partie ce matin. Rechargez la page avant de conclure."],
      };
    case "partielle": {
      const p = s.passageAttendu!;
      const quand = s.jourAttendu === s.aujourdhui ? "de ce matin" : `du ${jourMois(s.jourAttendu!)}`;
      return {
        titre: `L’alerte quotidienne ${quand} n’est partie que vers ${p.envoyes} adresse${p.envoyes > 1 ? "s" : ""} sur ${p.destinataires}.`,
        details: ["Les autres envois ont échoué : vérifiez les adresses du relais et le service d’e-mail."],
      };
    }
    case "jamais":
      return {
        titre: "L’alerte quotidienne n’est jamais partie.",
        details: [
          "Le registre des passages ne contient aucun passage réussi.",
          ...(s.dernier ? [`Dernier passage : ${passageDate(s.dernier)} — ${resultat(s.dernier)}.`] : []),
          aVerifier(s.dernier),
        ],
      };
    case "en_defaut": {
      const n = s.joursEnDefaut;
      const titre = n === 1 && s.depuis === s.aujourdhui
        ? "L’alerte quotidienne de ce matin n’est pas partie."
        : `L’alerte quotidienne n’est pas partie depuis le ${jourMois(s.depuis!)} (${n} jour${n > 1 ? "s" : ""}).`;
      const constat = s.passageAttendu
        ? `Passage du ${jourMois(s.jourAttendu!)} : ${resultat(s.passageAttendu)}.`
        : `Le ${jourMois(s.jourAttendu!)}, aucun passage n’a été consigné.`;
      return { titre, details: [constat, aVerifier(s.passageAttendu), ...(dernierReussi ? [dernierReussi] : [])] };
    }
  }
}

type ChaineRegistre = {
  select: (colonnes: string) => ChaineRegistre;
  order: (colonne: string, options: { ascending: boolean }) => ChaineRegistre;
  limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Les derniers passages du registre, du plus récent au plus ancien ; null si la lecture échoue. La politique de la table
 * réserve la lecture au superviseur permanent avec second facteur (`supervision_lecture`, migration 20261014810000) :
 * la console, protégée par `is_super_admin()`, la lit avec la session de l'utilisateur.
 */
export async function lirePassagesRelais(db: { from: (table: string) => unknown }): Promise<PassageRelais[] | null> {
  try {
    const { data, error } = await (db.from("relais_alertes_envois") as ChaineRegistre)
      .select("jour,statut,destinataires,envoyes,points,compteurs,commence_le,termine_le")
      .order("jour", { ascending: false })
      .limit(PASSAGES_LUS);
    return error || !Array.isArray(data) ? null : (data as PassageRelais[]);
  } catch {
    return null;
  }
}
