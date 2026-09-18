// Le gabarit d'import du parc, et la lecture du fichier déposé.
//
// La mécanique CSV elle-même (séparateur détecté, guillemets, en-têtes
// reconnus sans accents ni casse) vit dans `csv.ts` depuis le 18/09 : la
// reprise comptable en a eu besoin pour d'autres colonnes, et deux lecteurs
// auraient divergé au premier fichier bancal. Ne reste ici que ce qui est
// propre au parc — les colonnes, et l'exemple du gabarit.

import { gabarit, lire, type Colonne, type LectureCsv, type LigneCsv } from "@/lib/csv";

export type LigneImport = LigneCsv;
export type { LectureCsv };

/** Les colonnes attendues, dans l'ordre du gabarit. */
export const COLONNES = [
  ["bien", "Nom du bien", true],
  ["type", "Type (appartement, maison, immeuble, local, parking, terrain, autre)", true],
  ["adresse", "Adresse", true],
  ["adresse2", "Complément d'adresse", false],
  ["code_postal", "Code postal", true],
  ["ville", "Ville", true],
  ["annee", "Année de construction", false],
  ["lot", "Nom du lot", true],
  ["etage", "Étage", false],
  ["surface", "Surface (m²)", false],
  ["pieces", "Pièces", false],
  ["proprietaire_nom", "Nom du propriétaire", true],
  ["proprietaire_prenom", "Prénom du propriétaire", false],
  ["proprietaire_email", "Email du propriétaire", false],
  ["quote_part", "Quote-part (%) — 100 si vide", false],
  ["locataire_nom", "Nom du locataire", false],
  ["locataire_prenom", "Prénom du locataire", false],
  ["locataire_email", "Email du locataire", false],
  ["loyer_hc", "Loyer hors charges (€)", false],
  ["charges", "Provision pour charges (€)", false],
  ["depot_garantie", "Dépôt de garantie (€)", false],
  ["date_debut", "Date d'entrée (AAAA-MM-JJ)", false],
  ["jour_echeance", "Jour d'échéance (1 si vide)", false],
] as const satisfies readonly Colonne[];

/** Le gabarit, en-tête seul plus une ligne d'exemple. */
export function gabaritCsv(): string {
  return gabarit(COLONNES, [
    "Résidence des Tilleuls", "appartement", "12 rue des Tilleuls", "Bâtiment A",
    "75011", "Paris", "1974", "A12", "3e", "42", "2",
    "Durand", "Paul", "paul.durand@exemple.fr", "100",
    "Petit", "Awa", "awa.petit@exemple.fr", "700", "50", "700", "2026-01-01", "1",
  ]);
}

export function lireCsv(contenu: string): LectureCsv {
  return lire(COLONNES, contenu);
}
