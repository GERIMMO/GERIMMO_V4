// L'ADRESSE DU BAILLEUR SUR LA FICHE DU COMPTE (26/11/2026, parcours de vérification du jour de publication).
// Les documents d'un propriétaire direct prennent le domicile du bailleur sur la fiche « personne » de chaque détenteur
// (documents/modeles/communs.ts, bail-nu.ts, bail-meuble.ts), pas sur l'espace. Un particulier qui saisissait son
// adresse au premier bien (« D'abord, vos coordonnées de bailleur ») ou dans le profil la voyait rangée sur l'espace
// seulement : la recopie SCI-2 ne vise que les fiches de société. Le bail affichait « Adresse à compléter » et refusait
// tout PDF. Ces fonctions, sans accès aux données, disent quoi recopier, avec la règle de SCI-2 : les seuls champs
// VIDES, et seulement si les champs déjà remplis concordent avec la saisie (jamais par-dessus une autre adresse).
import { estBailleurSociete } from "@/lib/qualite-bailleur";
import { verifierCodePostalPersonne } from "@/lib/validation-fiches";

export type AdresseFiche = { address_line1: string | null; postal_code: string | null; city: string | null };
export type FicheTitulaire = AdresseFiche & { id: string; qualite: string | null };

const CHAMPS = ["address_line1", "postal_code", "city"] as const;
const normaliser = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");

/** Vrai si la rue, le code postal et la ville sont tous renseignés. */
export function adresseFicheComplete(f: AdresseFiche): boolean {
  return CHAMPS.every((c) => (f[c] ?? "").trim() !== "");
}

/**
 * Les champs à écrire sur la fiche du compte, ou null s'il n'y a rien à faire : fiche de société (SCI-2 s'en charge),
 * adresse déjà complète, champ rempli qui ne concorde pas avec la saisie, saisie incomplète, ou code postal qu'une fiche
 * refuserait (même règle que la saisie d'une fiche).
 */
export function champsAdresseARecopier(fiche: FicheTitulaire, saisie: AdresseFiche): Partial<Record<(typeof CHAMPS)[number], string>> | null {
  if (estBailleurSociete(fiche.qualite)) return null;
  if (!adresseFicheComplete(saisie)) return null;
  if (verifierCodePostalPersonne(saisie.postal_code ?? "")) return null;
  const ecrire: Partial<Record<(typeof CHAMPS)[number], string>> = {};
  for (const c of CHAMPS) {
    const actuel = (fiche[c] ?? "").trim();
    if (!actuel) ecrire[c] = (saisie[c] ?? "").trim();
    else if (normaliser(actuel) !== normaliser(saisie[c])) return null;
  }
  return Object.keys(ecrire).length ? ecrire : null;
}
