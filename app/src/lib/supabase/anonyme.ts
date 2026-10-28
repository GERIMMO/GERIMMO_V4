import { createClient } from "@supabase/supabase-js";

// UN CLIENT SANS COOKIE POUR LES PAGES PUBLIQUES (audit final du 27/10/2026, PUB-03).
//
// Le client serveur (`./server`) lit les cookies : une page qui l'emploie est rendue à chaque requête, en flux sous
// le « Chargement… » racine, et un notFound() posé pendant ce rendu part en 200 (« soft 404 »). Les contenus publics
// (articles parus, versions archivées des conditions) sont lisibles par `anon` sous leur RLS : lus sans session, la
// page redevient ISR, et une adresse inconnue répond un vrai 404. Même lecture que sitemap.ts.
export function clientAnonyme() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
