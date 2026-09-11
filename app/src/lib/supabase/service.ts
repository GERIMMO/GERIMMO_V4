// Client Supabase de la PLATEFORME, pour les tâches planifiées uniquement.
//
// Il porte la clé `service_role`, qui CONTOURNE la RLS : c'est la seule clé du
// produit qui voit toutes les organisations à la fois. Elle n'a donc rien à
// faire dans un écran, ni dans une action serveur déclenchée par un
// utilisateur — deux endroits où une faille d'autorisation la transformerait en
// accès universel. Elle ne sert qu'aux routes `/api/cron/*`, elles-mêmes
// fermées par `CRON_SECRET`.
//
// Ce que le client peut faire est en outre borné côté base : les fonctions que
// les tâches appellent sont révoquées de `anon` et `authenticated` et accordées
// au seul `service_role`, et chacune ne rend que ce dont la tâche a besoin.

import { createClient as creerClientSupabase } from "@supabase/supabase-js";

export function clientDeService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return creerClientSupabase(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * L'adresse publique du site, pour fabriquer les liens des e-mails envoyés
 * hors requête (une tâche planifiée n'a pas d'en-tête `origin`).
 */
export function adresseDuSite(): string | null {
  const explicite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicite) return explicite.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}
