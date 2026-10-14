-- La préparation du soir ne se déclenchait jamais depuis pg_cron (13/10/2026).
--
-- Constat : `declencher_marketing()` (appelée par pg_cron, rôle postgres, sans
-- jeton JWT) demande `preparation_marketing_due()`, qui interroge
-- `cible_preparation_marketing()`. Celle-ci filtrait sur
-- `(select auth.role()) = 'service_role'` : sans jeton, `auth.role()` est nul,
-- la fonction ne renvoyait aucune ligne et la préparation n'était jamais jugée
-- « due ». Seule la diffusion des posts programmés (requête directe sur
-- `publications`) partait. Les posts n'étaient donc préparés que par le
-- rattrapage du cron Vercel de la matinée — sans fenêtre de veto la veille.
--
-- Correction : la logique passe dans une fonction interne sans garde
-- d'appelant, fermée à tous les rôles ; la fonction publique garde sa garde
-- `service_role` (route de traitement) et `preparation_marketing_due()`, que
-- seul `declencher_marketing()` (security definer) atteint côté base, lit la
-- version interne. Aucun droit n'est élargi : `anon` et `authenticated`
-- n'exécutent toujours rien de tout cela.

create or replace function public.cible_preparation_marketing_interne()
returns table (jour date, rang integer, parution timestamptz, rattrapage boolean)
language sql stable security definer set search_path = '' as $$
  with r as (select * from public.marketing_reglages where singleton and actif),
       j as (select (now() at time zone 'Europe/Paris')::date as aujourdhui),
       libre as (select d.jour from (values ((select aujourdhui from j)), ((select aujourdhui + 1 from j))) as d(jour)
                 where not exists (select from public.publications p where p.marketing_jour = d.jour and p.statut not in ('brouillon', 'planifiee')))
  select l.jour, array_position(r.jours_semaine, extract(isodow from l.jour)::smallint) - 1 as rang,
         case when l.jour = j.aujourdhui then greatest(public.instant_paris(l.jour, r.heure_paris), now() + interval '1 hour')
              else public.instant_paris(l.jour, r.heure_paris) end as parution,
         l.jour = j.aujourdhui as rattrapage
    from r, j, libre l
   where extract(isodow from l.jour)::smallint = any(r.jours_semaine)
     and ((l.jour = j.aujourdhui + 1 and now() >= public.instant_paris(j.aujourdhui, r.heure_preparation_paris))
       or (l.jour = j.aujourdhui and now() between public.instant_paris(l.jour, r.heure_paris) - interval '12 hours'
                                               and public.instant_paris(l.jour, r.heure_paris) + interval '3 hours'))
   order by l.jour limit 1;
$$;
revoke all on function public.cible_preparation_marketing_interne() from public, anon, authenticated, service_role;

create or replace function public.cible_preparation_marketing()
returns table (jour date, rang integer, parution timestamptz, rattrapage boolean)
language sql stable security definer set search_path = '' as $$
  select c.jour, c.rang, c.parution, c.rattrapage
    from public.cible_preparation_marketing_interne() c
   where (select auth.role()) = 'service_role';
$$;
revoke all on function public.cible_preparation_marketing() from public, anon, authenticated;
grant execute on function public.cible_preparation_marketing() to service_role;

create or replace function public.preparation_marketing_due()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select from public.cible_preparation_marketing_interne());
$$;
revoke all on function public.preparation_marketing_due() from public, anon, authenticated;
grant execute on function public.preparation_marketing_due() to service_role;

select public.fermer_fonctions_a_anon();
