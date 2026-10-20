import { pathToFileURL } from "node:url";

/**
 * Les aperçus restent suspendus tant qu'ils partagent les services réels.
 * Ce contrôle complète « Only build production » côté Vercel : une commande
 * de construction manuelle doit respecter la même suspension.
 * Il ne modifie pas les déploiements déjà construits.
 */
export function verifierEnvironnement(env = process.env) {
  const cible = env.VERCEL_ENV;
  if (cible === "preview" || (env.VERCEL === "1" && cible !== "production")) {
    throw new Error(
      "Construction suspendue : les prévisualisations Gerimmo doivent disposer de services isolés avant leur réouverture. La production et le banc local restent disponibles.",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifierEnvironnement();
  } catch (erreur) {
    console.error(erreur.message);
    process.exitCode = 1;
  }
}
