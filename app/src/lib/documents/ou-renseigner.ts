// Où renseigner un champ resté en libellé dans un PDF généré (chantier
// documentaire 08/09, refondu à l'audit du 09/09) : chaque « manquant »
// pointe l'écran où la donnée se saisit — Gerimmo sait où vit chaque
// information. Les listes précédentes avaient été écrites sans confronter
// les libellés réels des modèles : la moitié ne matchait rien, « commune de
// naissance » partait au profil de l'organisation. Les règles ci-dessous
// couvrent les libellés effectivement employés par les 9 modèles, dans
// l'ordre — la première qui matche gagne. Un même libellé peut servir deux
// blocs (l'en-tête de l'organisation ET une partie du bail) : le modèle
// départage.

export type LienManquant = { href: string; ecran: string };
type Liens = { entite: "bail" | "personne" | "lot" | "mandat"; entiteId: string }[];
type Cible = "organisation" | "personne" | "lot" | "bail";

type Regle = { motifs: string[]; cible: Cible; cibleBail?: Cible };

const REGLES: Regle[] = [
  // L'état civil du locataire (bail) — avant « commune » tout court (faitA)
  {
    motifs: ["commune de naissance", "adresse actuelle", "nom et prénom(s) du ou des locataires"],
    cible: "personne",
  },
  // L'identité du bailleur : le nom de l'organisation n'est jamais vide, donc
  // ce libellé ne peut venir que du bloc bailleur — les détenteurs se
  // renseignent sur la fiche du lot (détentions du bien)
  { motifs: ["ou dénomination", "personne physique, sci"], cible: "lot" },
  // Les conditions financières et clauses du contrat
  {
    motifs: [
      "dernier loyer",
      "honoraires",
      "loyer de référence",
      "loyer + charges",
      "à échoir ou échu",
      "jour du mois",
      "trimestre",
      "valeur de l'indice",
      "rapport des indices",
      "montant mensuel",
      "montant inchangé",
      "total du terme",
      "durée applicable",
      "durée réduite",
      "montant convenu",
      "provisions avec régularisation",
      "iban",
      "virement",
      "domicile du bailleur",
      "clauses librement convenues",
      "référence du bail",
    ],
    cible: "bail",
  },
  // Le logement lui-même
  {
    motifs: [
      "adresse complète",
      "en m²",
      "identifiant fiscal",
      "le cas échéant",
      "immeuble collectif",
      "monopropriété",
      "avant 1949",
      "cave, grenier",
      "cuisine équipée",
      "individuel ou collectif",
      "cave, parking",
      "hall, ascenseur",
      "fibre",
    ],
    cible: "lot",
  },
  // L'en-tête de l'émetteur — sur un bail, « adresse électronique » et
  // « facultatif » (téléphone) désignent surtout les parties
  { motifs: ["siège social"], cible: "organisation" },
  { motifs: ["adresse électronique", "facultatif"], cible: "organisation", cibleBail: "personne" },
  { motifs: ["commune"], cible: "organisation" },
  // La date par défaut : sur un bail, c'est la date de naissance du locataire
  { motifs: ["jj/mm/aaaa"], cible: "bail", cibleBail: "personne" },
];

export function lienPourManquant(
  libelle: string,
  orgId: string,
  liens: Liens,
  modele?: string
): LienManquant | null {
  const l = libelle.toLowerCase();
  const bail = liens.find((x) => x.entite === "bail");
  const personne = liens.find((x) => x.entite === "personne");
  const lot = liens.find((x) => x.entite === "lot");

  const vers = (cible: Cible): LienManquant | null => {
    switch (cible) {
      case "organisation":
        return { href: `/agence/${orgId}/profil`, ecran: "profil de l'organisation" };
      case "personne":
        if (personne)
          return { href: `/agence/${orgId}/personnes/${personne.entiteId}`, ecran: "fiche de la personne" };
        break;
      case "lot":
        if (lot) return { href: `/agence/${orgId}/parc?sel=lot:${lot.entiteId}`, ecran: "fiche du lot" };
        break;
      case "bail":
        break;
    }
    if (bail) return { href: `/agence/${orgId}/baux/${bail.entiteId}`, ecran: "fiche du bail" };
    return null;
  };

  // « nombre » (pièces principales du bail type) est un libellé d'un seul mot :
  // en fragment il matcherait trop large, on le prend en égalité stricte
  if (l === "nombre") return vers("lot");

  for (const r of REGLES) {
    if (r.motifs.some((m) => l.includes(m))) {
      return vers(modele === "bail_nu" && r.cibleBail ? r.cibleBail : r.cible);
    }
  }
  if (personne) {
    return { href: `/agence/${orgId}/personnes/${personne.entiteId}`, ecran: "fiche de la personne" };
  }
  return null;
}
