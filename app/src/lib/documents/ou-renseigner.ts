// Où renseigner un champ resté en libellé dans un PDF généré (chantier
// documentaire 08/09) : chaque « manquant » pointe l'écran où la donnée se
// saisit — Gerimmo sait où vit chaque information. Résolution par mots-clés
// sur les libellés d'épreuve (stables), éclairée par les rattachements du
// document (bail, personne, lot).

export type LienManquant = { href: string; ecran: string };
type Liens = { entite: "bail" | "personne" | "lot"; entiteId: string }[];

const MOTS_ORGANISATION = [
  "dénomination",
  "siège social",
  "adresse électronique",
  "commune",
  "siret",
  "facultatif", // le téléphone de l'en-tête
];
const MOTS_PERSONNE = ["locataire", "garant", "prénom"];
const MOTS_LOT = ["surface", "étage", "porte", "pièces", "meublé", "équipement"];
const MOTS_BAIL = [
  "loyer",
  "charges",
  "dépôt",
  "échéance",
  "bail",
  "date d'effet",
  "durée",
  "irl",
  "jj/mm/aaaa",
];

export function lienPourManquant(
  libelle: string,
  orgId: string,
  liens: Liens
): LienManquant | null {
  const l = libelle.toLowerCase();
  const bail = liens.find((x) => x.entite === "bail");
  const personne = liens.find((x) => x.entite === "personne");
  const lot = liens.find((x) => x.entite === "lot");

  if (MOTS_ORGANISATION.some((m) => l.includes(m))) {
    return { href: `/agence/${orgId}/profil`, ecran: "profil de l'organisation" };
  }
  if (MOTS_PERSONNE.some((m) => l.includes(m)) && personne) {
    return { href: `/agence/${orgId}/personnes/${personne.entiteId}`, ecran: "fiche de la personne" };
  }
  if (MOTS_LOT.some((m) => l.includes(m))) {
    if (lot) return { href: `/agence/${orgId}/parc?sel=lot:${lot.entiteId}`, ecran: "fiche du lot" };
    if (bail) return { href: `/agence/${orgId}/baux/${bail.entiteId}`, ecran: "fiche du bail" };
  }
  if (MOTS_BAIL.some((m) => l.includes(m)) && bail) {
    return { href: `/agence/${orgId}/baux/${bail.entiteId}`, ecran: "fiche du bail" };
  }
  if (personne) {
    return { href: `/agence/${orgId}/personnes/${personne.entiteId}`, ecran: "fiche de la personne" };
  }
  return null;
}
