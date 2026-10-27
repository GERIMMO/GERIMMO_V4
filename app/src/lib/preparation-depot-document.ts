import { TYPES_DEPOSABLES } from "./ged";

/** Une suggestion issue du nom seulement : jamais une analyse du contenu. */
export function typeSuggereParNom(nom: string): string {
  const texte = nom.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const correspondances = [
    ["attestation_assurance", /\b(assurance|multirisque)\b/],
    ["piece_identite", /\b(cni|passeport|carte (nationale d )?identite|piece d identite|titre de sejour)\b/],
    ["justificatif", /\b(justificatif|bulletin(s)? (de )?(paie|salaire)|avis d? ?imposition)\b/],
    ["courrier", /\b(courrier|lettre|relance)\b/],
  ] as const;
  const types = correspondances.filter(([, motif]) => motif.test(texte)).map(([type]) => type);
  // Un intitulé ambigu ne doit pas décider des droits et de la conservation.
  return types.length === 1 ? types[0] : "";
}

export function titreDepuisFichier(nom: string): string {
  return nom.replace(/\.(pdf|jpe?g|png)$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export function typeDepotAutorise(type?: string): string {
  return type && (TYPES_DEPOSABLES as readonly string[]).includes(type) ? type : "";
}
