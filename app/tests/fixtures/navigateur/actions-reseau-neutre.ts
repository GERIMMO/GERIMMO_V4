// `@/app/actions/reseau` est un fichier d'actions serveur : le module des formulaires d'artisan l'importe par
// `disponibilite-reseau`, le banc des décisions sur un devis ne l'appelle jamais.
const neutre = async (): Promise<Record<string, never>> => ({});
export const confirmerCommuneBien = neutre;
export const confirmerCommunesEvidentes = neutre;
export const signalerInteretReseau = neutre;
