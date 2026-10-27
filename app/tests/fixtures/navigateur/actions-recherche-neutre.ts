// `@/app/actions/recherche-espace` est une action serveur (session, base) : elle n'existe pas dans le navigateur du
// banc. La fenêtre de recherche ne l'appelle qu'à partir de deux caractères ; le banc n'éprouve que son ouverture
// et sa fermeture, cette version neutre ne sert qu'à satisfaire l'import.
import type { ReponseRecherche } from "@/lib/recherche-espace";
export async function rechercherDansEspace(): Promise<ReponseRecherche> {
  return { resultats: [] };
}
