// EXPORT CSV DE LA LISTE D'ATTENTE DES AGENCES (20/10/2026).
//
// Le dirigeant exporte depuis la console (/admin/liste-attente/export) les agences inscrites sur /agences pour les
// recontacter à l'ouverture de l'offre. Le fichier est fait pour un tableur français : marque d'ordre des octets UTF-8
// (sinon Excel casse les accents), séparateur point-virgule, en-tête en français, dates à l'heure de Paris. Seules des
// fonctions pures ici : la route les appelle, les tests les rejouent sans base.

import { neutraliserFormule } from "@/lib/csv-sur";
import { formaterDateHeureParis, FUSEAU_PARIS } from "@/lib/heure-paris";
import { libelleTranche, STATUTS_LISTE_ATTENTE } from "@/lib/liste-attente-agences";

/** Une inscription telle que la console la lit (colonnes de public.liste_attente_agences). */
export type LigneListeAttente = {
  agence: string;
  contact: string;
  email: string;
  telephone: string | null;
  code_postal: string;
  nb_lots: string;
  message: string | null;
  statut: string;
  contactee_le: string | null;
  created_at: string;
};

export const SEPARATEUR_CSV = ";";

/** L'en-tête, dans l'ordre des colonnes du fichier. */
export const ENTETE_CSV_LISTE_ATTENTE = [
  "Date d'inscription",
  "Agence",
  "Contact",
  "E-mail",
  "Téléphone",
  "Code postal",
  "Lots gérés",
  "Message",
  "Statut",
  "Contactée le",
] as const;

// La marque d'ordre des octets, construite par code : écrite en clair, elle est invisible dans l'éditeur.
export const BOM_UTF8 = String.fromCharCode(0xfeff);

/**
 * Un champ du fichier : entre guillemets, guillemets doublés, dès qu'il contient le séparateur, un guillemet ou un saut
 * de ligne (RFC 4180). Un champ nul est vide.
 */
export function champCsv(valeur: string | null | undefined): string {
  const texte = valeur ?? "";
  return /["\r\n;]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** Le libellé d'un statut, ou le code tel quel si la base en connaît un que l'écran ignore encore. */
function libelleStatut(statut: string): string {
  return Object.hasOwn(STATUTS_LISTE_ATTENTE, statut)
    ? STATUTS_LISTE_ATTENTE[statut as keyof typeof STATUTS_LISTE_ATTENTE]
    : statut;
}

const dateCsv = (valeur: string | null) => (valeur ? formaterDateHeureParis(valeur) : "");

/** Les textes saisis par l'agence ne sont jamais évalués comme une formule à l'ouverture du tableur (audit du 13/10, CHF-04). */
const saisie = (valeur: string | null) => neutraliserFormule(valeur ?? "");

/** Les dix champs d'une inscription, dans l'ordre de l'en-tête, avant échappement. */
export function champsLigneListeAttente(l: LigneListeAttente): string[] {
  return [
    dateCsv(l.created_at),
    saisie(l.agence),
    saisie(l.contact),
    saisie(l.email),
    saisie(l.telephone),
    l.code_postal,
    libelleTranche(l.nb_lots),
    saisie(l.message),
    libelleStatut(l.statut),
    dateCsv(l.contactee_le),
  ];
}

/** Le fichier complet : marque d'ordre des octets, en-tête, une ligne par inscription, fins de ligne CRLF. */
export function csvListeAttenteAgences(lignes: readonly LigneListeAttente[]): string {
  const corps = [
    ENTETE_CSV_LISTE_ATTENTE.join(SEPARATEUR_CSV),
    ...lignes.map((l) => champsLigneListeAttente(l).map(champCsv).join(SEPARATEUR_CSV)),
  ];
  return `${BOM_UTF8}${corps.join("\r\n")}\r\n`;
}

/** « liste-attente-agences-AAAA-MM-JJ.csv », au jour de Paris de l'export. */
export function nomFichierExportListeAttente(instant: Date = new Date()): string {
  return `liste-attente-agences-${instant.toLocaleDateString("en-CA", { timeZone: FUSEAU_PARIS })}.csv`;
}
