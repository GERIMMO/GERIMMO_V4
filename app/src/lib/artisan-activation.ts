/** Le banc local garde ses interrupteurs de recette. En hébergement HTTPS,
 * l’ouverture métier est décidée en base par artisan_module_actif ; chaque RPC
 * et dépôt Storage vérifie encore l’identité réelle et la propriété du dossier.
 * Un ancien drapeau « local » ne peut jamais ouvrir une base distante en HTTP.
 */
export function activationModuleArtisan(module: "clients" | "reglements", env: Record<string, string | undefined> = process.env): boolean {
  try {
    const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (!["http:", "https:"].includes(api.protocol)) return false;
    if (["localhost", "127.0.0.1", "[::1]"].includes(api.hostname)) {
      return env[module === "clients" ? "GERIMMO_ARTISAN_CLIENTS_LOCAUX" : "GERIMMO_ARTISAN_REGLEMENTS_LOCAUX"] === "1";
    }
    return api.protocol === "https:";
  } catch { return false; }
}
