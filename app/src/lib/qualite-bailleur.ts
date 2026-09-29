// Qualité d'une personne au bail (persons.qualite) : liste FERMÉE, et la
// règle de durée du bail nu qui en dépend (art. 10 et 13 de la loi n° 89-462
// du 6 juillet 1989). Miroir exact de la base (migration
// 20260929120000_audit_baux_documents : qualites_bailleur,
// qualite_bailleur_normalisee, duree_bail_nu_annees) — un test de parité les
// compare.

export const QUALITES_BAILLEUR = [
  "Personne physique",
  "Indivision (personnes physiques)",
  "SCI familiale",
  "SCI",
  "Personne morale",
] as const;

export type QualiteBailleur = (typeof QUALITES_BAILLEUR)[number];

/** Aide affichée à côté de chaque qualité dans les listes. */
export const AIDE_QUALITE: Record<QualiteBailleur, string> = {
  "Personne physique": "bail nu de 3 ans",
  "Indivision (personnes physiques)": "bail nu de 3 ans",
  "SCI familiale": "entre parents et alliés jusqu'au 4e degré — bail nu de 3 ans",
  SCI: "SCI non familiale — bail nu de 6 ans",
  "Personne morale": "société, association… — bail nu de 6 ans",
};

/**
 * Ramène une écriture libre à la liste (casse, espaces, tirets bas,
 * « Indivision » des anciens formulaires). Ce qui ne se lit pas est rendu tel
 * quel — `estQualiteBailleur` le refuse.
 */
export function normaliserQualiteBailleur(brut: string | null | undefined): string | null {
  const t = (brut ?? "").trim();
  const v = t.replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase();
  if (v === "") return null;
  if (v === "personne physique") return "Personne physique";
  if (["indivision", "indivision (personnes physiques)", "indivision de personnes physiques"].includes(v))
    return "Indivision (personnes physiques)";
  if (["sci familiale", "sci (familiale)"].includes(v)) return "SCI familiale";
  if (["sci", "sci (non familiale)", "sci non familiale"].includes(v)) return "SCI";
  if (v === "personne morale") return "Personne morale";
  return t;
}

export function estQualiteBailleur(v: string | null | undefined): v is QualiteBailleur {
  return (QUALITES_BAILLEUR as readonly string[]).includes(v ?? "");
}

/**
 * Durée d'un bail nu, en années, selon les qualités des bailleurs : 6 ans dès
 * qu'un bailleur est une personne morale autre qu'une SCI familiale ; 3 ans
 * sinon (personne physique, indivision de personnes physiques, SCI
 * familiale). Qualité absente : personne physique.
 */
export function dureeBailNuAnnees(qualites: (string | null | undefined)[]): 3 | 6 {
  return qualites.some((q) => {
    const n = normaliserQualiteBailleur(q);
    return n === "SCI" || n === "Personne morale";
  })
    ? 6
    : 3;
}

/**
 * Le mandant est-il un consommateur (personne physique, ou indivision de
 * personnes physiques) ? Qualité absente : une fiche avec prénom est une
 * personne physique, une raison sociale n'en a pas.
 */
export function estPersonnePhysique(qualite: string | null | undefined, prenom?: string | null): boolean {
  const n = normaliserQualiteBailleur(qualite);
  if (n === null) return Boolean(prenom?.trim());
  return n === "Personne physique" || n === "Indivision (personnes physiques)";
}
