import { pathToFileURL } from "node:url";
import { verifierEnvironnement } from "./garde-environnement.mjs";
export { verifierEnvironnement };

/**
 * Les aperçus restent suspendus tant qu'ils partagent les services réels.
 * Ce contrôle complète « Only build production » côté Vercel : une commande
 * de construction manuelle doit respecter la même suspension.
 * Il ne modifie pas les déploiements déjà construits.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifierEnvironnement();
  } catch (erreur) {
    console.error(erreur.message);
    process.exitCode = 1;
  }
}
