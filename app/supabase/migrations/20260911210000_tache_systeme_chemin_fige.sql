-- `tache_systeme()` était la seule fonction du schéma sans chemin de recherche
-- figé (advisor Supabase « Function Search Path Mutable », relevé après la
-- migration du cycle mensuel). Elle n'est ni SECURITY DEFINER ni exécutable par
-- un compte applicatif : le risque est faible. Mais elle pose le drapeau qui
-- LÈVE le refus d'écriture des organisations suspendues — c'est-à-dire la seule
-- fonction du produit dont le rôle est de désarmer un garde-fou. Celle-là ne
-- doit pas dépendre de ce que le chemin de recherche contient au moment où on
-- l'appelle.
create or replace function public.tache_systeme()
returns void
language sql
volatile
set search_path = ''
as $$ select pg_catalog.set_config('gerimmo.systeme', 'on', true); $$;
comment on function public.tache_systeme() is
  'À appeler en tête d''une tâche planifiée : lève le refus d''écriture sur les organisations suspendues, pour la seule transaction en cours.';
revoke execute on function public.tache_systeme() from public, anon, authenticated;
