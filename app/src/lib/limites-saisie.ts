// Les longueurs maximales des champs d'identité saisis à l'inscription.
//
// POURQUOI UNE LIMITE. Nom, prénom, adresse… voyagent dans les métadonnées du
// compte, donc dans le jeton de session, donc dans les cookies envoyés à chaque
// requête. Audit du 13/10/2026 (AUD-B-02) : un nom de 24 000 caractères était
// accepté, puis tous les cookies de session pesaient 77 Ko et le site répondait
// « 431 » à ce navigateur, sur toutes ses pages, sans moyen de se reconnecter.
// La borne se dit en clair à l'écran, côté serveur (jamais seulement par le
// `maxLength` du champ, que n'importe quel appel direct contourne).

export const LONGUEUR_MAX = {
  nom: 100,
  prenom: 100,
  email: 254,
  telephone: 30,
  adresse: 200,
  code_postal: 10,
  ville: 100,
} as const;

export type ChampIdentite = keyof typeof LONGUEUR_MAX;

// Le libellé s'accorde : « Le nom est trop long », « La ville est trop longue ».
const LIBELLES: Record<ChampIdentite, string> = {
  nom: "Le nom est trop long",
  prenom: "Le prénom est trop long",
  email: "L'adresse e-mail est trop longue",
  telephone: "Le numéro de téléphone est trop long",
  adresse: "L'adresse est trop longue",
  code_postal: "Le code postal est trop long",
  ville: "La ville est trop longue",
};

/**
 * Le premier champ qui dépasse sa borne, dit en français ; `null` si tout tient.
 * On compte les caractères réels (un accent ou un émoji pèse un caractère).
 */
export function champTropLong(champs: Partial<Record<ChampIdentite, string | null | undefined>>): string | null {
  for (const cle of Object.keys(LONGUEUR_MAX) as ChampIdentite[]) {
    const valeur = champs[cle];
    if (typeof valeur === "string" && [...valeur].length > LONGUEUR_MAX[cle]) {
      return `${LIBELLES[cle]} : ${LONGUEUR_MAX[cle]} caractères au plus.`;
    }
  }
  return null;
}

/**
 * Les valeurs à remettre dans le formulaire après un refus : chacune coupée à
 * 300 caractères, pour ne pas renvoyer au navigateur les 24 000 caractères
 * qu'on vient de refuser (les autres champs restent remplis).
 */
export function valeursBornees(valeurs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(valeurs).map(([cle, v]) => [cle, [...v].slice(0, 300).join("")]));
}
