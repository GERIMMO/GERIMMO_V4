import { LONGUEUR_MAX } from "@/lib/limites-saisie";

export const CLE_PROFIL_A_CONFIRMER = "profil_a_confirmer";
export const CHAMPS_PROFIL_INSCRIPTION = ["nom", "prenom", "telephone", "adresse", "code_postal", "ville", "qualite", "code_parrainage", "espace"] as const;

export function informationsAConfirmer(metadonnees: Record<string, unknown> | null | undefined): Record<string, string> {
  const profil: Record<string, string> = {};
  for (const champ of CHAMPS_PROFIL_INSCRIPTION) {
    if (typeof metadonnees?.[champ] === "string") profil[champ] = [...metadonnees[champ]].slice(0, ({ ...LONGUEUR_MAX, qualite: 100, code_parrainage: 8, espace: 32 })[champ]).join("");
  }
  return profil;
}
