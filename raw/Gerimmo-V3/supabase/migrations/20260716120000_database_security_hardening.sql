-- GERIMMO V3 - Durcissement des privileges PostgreSQL et des fonctions RPC.

begin;

-- Le role anonyme ne dialogue jamais directement avec les objets metier.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- Les futurs objets doivent etre accordes explicitement par leur migration.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- Ce traitement global est reserve aux automatisations serveur authentifiees par secret.
revoke execute on function public.evaluate_subscription_lifecycle() from public, anon, authenticated;
grant execute on function public.evaluate_subscription_lifecycle() to service_role;

-- La recommandation reste accessible aux responsables autorises de l'organisation.
create or replace function public.recommend_incident_quote(target_comparison_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  recommended_id uuid;
  comparison_organization_id uuid;
begin
  select organization_id
  into comparison_organization_id
  from public.incident_quote_comparisons
  where id = target_comparison_id
    and archived_at is null;

  if comparison_organization_id is null then
    raise exception 'COMPARISON_NOT_FOUND';
  end if;

  if not public.can_manage_incidents(comparison_organization_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.incident_quote_comparison_items
  set recommendation_score = public.calculate_incident_quote_score(
        price_cents,
        gerimmo_rating,
        administrative_documents_valid
      ),
      is_recommended = false
  where comparison_id = target_comparison_id
    and archived_at is null;

  select quote_id
  into recommended_id
  from public.incident_quote_comparison_items
  where comparison_id = target_comparison_id
    and archived_at is null
  order by recommendation_score desc,
    administrative_documents_valid desc,
    price_cents asc,
    gerimmo_rating desc
  limit 1;

  update public.incident_quote_comparison_items
  set is_recommended = true
  where comparison_id = target_comparison_id
    and quote_id = recommended_id;

  update public.incident_quote_comparisons
  set recommended_quote_id = recommended_id,
      recommendation_reason = 'Recommandation informative calculee selon prix, note artisan et conformite administrative.',
      status = 'recommande'
  where id = target_comparison_id;

  insert into public.incident_quote_validation_events (
    organization_id,
    comparison_id,
    quote_id,
    actor_profile_id,
    action,
    comment
  )
  values (
    comparison_organization_id,
    target_comparison_id,
    recommended_id,
    auth.uid(),
    'RECOMMENDATION',
    'Recommandation GERIMMO calculee automatiquement.'
  );

  return recommended_id;
end;
$$;

revoke execute on function public.recommend_incident_quote(uuid) from public, anon;
grant execute on function public.recommend_incident_quote(uuid) to authenticated, service_role;

-- Une vue security invoker respecte la RLS de la table source.
create or replace view public.incident_artisan_rating_statistics
with (security_invoker = true)
as
select
  organization_id,
  artisan_profile_id,
  count(*)::integer as evaluations_count,
  round(avg(average_rating), 2) as average_rating
from public.incident_artisan_evaluations
where archived_at is null
  and artisan_profile_id is not null
group by organization_id, artisan_profile_id;

revoke all privileges on public.incident_artisan_rating_statistics from public, anon;
grant select on public.incident_artisan_rating_statistics to authenticated, service_role;

commit;
