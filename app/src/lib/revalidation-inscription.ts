import { LONGUEUR_MAX, valeursBornees } from "@/lib/limites-saisie";
import { CHAMP_DOCUMENT_AFFICHE, documentAffiche } from "@/lib/conditions-acceptation";

export const CLE_PROFIL_A_CONFIRMER = "profil_a_confirmer";
export const CHAMPS_PROFIL_INSCRIPTION = ["nom", "prenom", "telephone", "adresse", "code_postal", "ville", "qualite", "code_parrainage", "espace"] as const;

export function informationsAConfirmer(metadonnees: Record<string, unknown> | null | undefined): Record<string, string> {
  const profil: Record<string, string> = {};
  for (const champ of CHAMPS_PROFIL_INSCRIPTION) {
    if (typeof metadonnees?.[champ] === "string") profil[champ] = [...metadonnees[champ]].slice(0, ({ ...LONGUEUR_MAX, qualite: 100, code_parrainage: 8, espace: 32 })[champ]).join("");
  }
  return profil;
}

/**
 * La saisie à reposer dans /nouveau-mot-de-passe après un refus (relevé du 23/10, PRO-4) : les champs du profil
 * envoyés et la case des conditions générales (« on » si elle était cochée), bornés comme toute saisie renvoyée
 * (lib/limites-saisie.ts). Liste fermée : un mot de passe n'en fait jamais partie, quoi que contienne l'envoi.
 *
 * Une case cochée revient avec le document dont elle portait le texte à l'envoi (`cgu_document`, relecture adverse du
 * 24/10) : le formulaire ne la recoche que sous ce même texte. Sans script, changer l'usage dans la liste ne change pas
 * la case ; un refus venu avant le contrôle du document (mot de passe, champ trop long…) renvoyait la page avec la case
 * du nouvel usage, cochée. Une valeur inconnue ne laisse aucune trace : aucune coche n'est reposée.
 */
export function saisieProfilARetenir(formData: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const champ of CHAMPS_PROFIL_INSCRIPTION) {
    const valeur = formData.get(champ);
    if (typeof valeur === "string") valeurs[champ] = valeur;
  }
  if (formData.get("cgu")) {
    valeurs.cgu = "on";
    const document = documentAffiche(formData.get(CHAMP_DOCUMENT_AFFICHE));
    if (document) valeurs[CHAMP_DOCUMENT_AFFICHE] = document;
  }
  return valeursBornees(valeurs);
}
