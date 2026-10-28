import { createClient as creerClientSupabase } from "@supabase/supabase-js";

/**
 * Le client des LECTURES PUBLIQUES (audit final, PUB-05) : clé publique, sans cookie ni session.
 *
 * La vitrine, le journal et les pages légales lisaient leurs articles et l'identité de l'éditeur avec le client à
 * cookies (lib/supabase/server) : lire `cookies()` rend la route dynamique, et `export const revalidate = 3600` ne
 * servait à rien — fonction serveur et aller-retour Supabase à chaque visite, en-tête « private, no-store ». Ce qui
 * est public se lit comme le plan du site (sitemap.ts) : pareil pour tout le monde, donc mis en cache par l'ISR ;
 * les actions de publication invalident la page (`revalidatePath`).
 *
 * `null` sans configuration (construction en CI) : l'appelant rend la page sans ces données plutôt que d'échouer.
 */
export function createClientPublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !cle) return null;
  return creerClientSupabase(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}
