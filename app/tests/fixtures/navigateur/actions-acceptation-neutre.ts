// `@/app/actions/acceptation-conditions` est un fichier d'actions serveur : le banc de l'encart « Nos conditions
// générales évoluent » n'envoie jamais le formulaire d'acceptation (seul « Plus tard » y est éprouvé).
const neutre = async (): Promise<Record<string, never>> => ({});
export const accepterNouvelleVersionConditions = neutre;
export const accepterConditionsArtisans = neutre;
