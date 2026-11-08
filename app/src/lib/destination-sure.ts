import { baseEspace, lireCheminDeGestion } from "@/lib/racine-espace";

/**
 * Garde anti « open redirect » : ne suivre qu'un chemin INTERNE.
 *
 * Le motif existait déjà, écrit à la main dans app/auth/confirm/route.ts. Il
 * sert désormais à deux endroits (la confirmation d'email et la mémoire de
 * destination de la connexion) : une seule définition, pour qu'une correction
 * de sécurité n'ait pas à être retrouvée en deux exemplaires.
 *
 * Ce qui est refusé : une URL absolue (« https://ailleurs »), un chemin
 * protocole-relatif (« //ailleurs », qui vaut une URL absolue pour le
 * navigateur), et tout ce qui n'est pas un chemin.
 */
export function destinationSure(brut: string | null | undefined, repli = "/espaces"): string {
  if (!brut) return repli;
  if (!brut.startsWith("/")) return repli;
  if (brut.startsWith("//") || /[\\\x00-\x20\x7f]/.test(brut)) return repli;
  return brut;
}

/** Après identification, la liste générale des incidents laisse place à l’accueil propriétaire.
 * Un lien vers un incident précis, une déclaration ou une action conserve sa destination. */
export function destinationApresConnexion(suite: string | null): string {
  const destination = destinationSure(suite);
  const espace = lireCheminDeGestion(destination);
  if (espace?.racine === "espace" && /^\/incidents\/?$/.test(espace.suite)) {
    return baseEspace(espace.orgId, true);
  }
  return destination;
}
