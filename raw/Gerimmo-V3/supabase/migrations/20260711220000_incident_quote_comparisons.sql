-- GERIMMO V3 Sprint 5.3 - Comparaison et validation des devis.
-- Comparatif, recommandation informative, decision responsable et historique.

create table if not exists public.incident_quote_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_request_id uuid not null references public.incident_quote_requests(id) on delete restrict,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  recommended_quote_id uuid references public.incident_quotes(id) on delete set null,
  recommendation_reason text,
  status text not null default 'brouillon',
  future_links jsonb not null default '{"planification":null,"intervention":null}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_quote_comparisons_status_valid check (status in ('brouillon', 'recommande', 'valide', 'refuse', 'complement', 'annule')),
  constraint incident_quote_comparisons_future_links_object check (jsonb_typeof(future_links) = 'object')
);

create table if not exists public.incident_quote_comparison_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  comparison_id uuid not null references public.incident_quote_comparisons(id) on delete restrict,
  quote_id uuid not null references public.incident_quotes(id) on delete restrict,
  recipient_id uuid not null references public.incident_quote_recipients(id) on delete restrict,
  artisan_name text not null,
  price_cents integer not null default 0,
  announced_delay_days integer,
  gerimmo_rating numeric(3, 2) not null default 0,
  administrative_documents_valid boolean not null default false,
  received_at timestamptz not null,
  comments text,
  recommendation_score numeric(10, 4) not null default 0,
  is_recommended boolean not null default false,
  decision_status text not null default 'en_attente',
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_quote_comparison_items_price_positive check (price_cents >= 0),
  constraint incident_quote_comparison_items_delay_positive check (announced_delay_days is null or announced_delay_days >= 0),
  constraint incident_quote_comparison_items_rating_range check (gerimmo_rating >= 0 and gerimmo_rating <= 5),
  constraint incident_quote_comparison_items_decision_valid check (decision_status in ('en_attente', 'accepte', 'refuse', 'complement'))
);

create table if not exists public.incident_quote_validation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  comparison_id uuid references public.incident_quote_comparisons(id) on delete set null,
  quote_id uuid references public.incident_quotes(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  comment text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_quote_validation_events_action_not_empty check (length(trim(action)) > 0)
);

create unique index if not exists incident_quote_comparisons_request_active_idx on public.incident_quote_comparisons (quote_request_id) where archived_at is null;
create unique index if not exists incident_quote_comparison_items_quote_active_idx on public.incident_quote_comparison_items (comparison_id, quote_id) where archived_at is null;
create index if not exists incident_quote_comparisons_organization_id_idx on public.incident_quote_comparisons (organization_id);
create index if not exists incident_quote_comparisons_quote_request_id_idx on public.incident_quote_comparisons (quote_request_id);
create index if not exists incident_quote_comparisons_recommended_quote_id_idx on public.incident_quote_comparisons (recommended_quote_id);
create index if not exists incident_quote_comparison_items_comparison_id_idx on public.incident_quote_comparison_items (comparison_id);
create index if not exists incident_quote_comparison_items_quote_id_idx on public.incident_quote_comparison_items (quote_id);
create index if not exists incident_quote_comparison_items_decision_status_idx on public.incident_quote_comparison_items (decision_status);
create index if not exists incident_quote_validation_events_comparison_id_idx on public.incident_quote_validation_events (comparison_id);
create index if not exists incident_quote_validation_events_created_at_idx on public.incident_quote_validation_events (created_at desc);

create or replace function public.can_access_incident_quote_comparison(target_comparison_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or coalesce((
      select true
      from public.incident_quote_comparisons iqc
      where iqc.id = target_comparison_id
        and iqc.archived_at is null
        and public.can_access_incident_quote_request(iqc.quote_request_id)
      limit 1
    ), false);
$$;

create or replace function public.calculate_incident_quote_score(price_cents integer, gerimmo_rating numeric, administrative_documents_valid boolean)
returns numeric
language sql
immutable
as $$
  select round(
    greatest(0, 1000000.0 / greatest(price_cents, 1)) * 0.45
    + coalesce(gerimmo_rating, 0) * 20 * 0.35
    + case when administrative_documents_valid then 20 else 0 end,
    4
  );
$$;

create or replace function public.recommend_incident_quote(target_comparison_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  recommended_id uuid;
begin
  update public.incident_quote_comparison_items
  set recommendation_score = public.calculate_incident_quote_score(price_cents, gerimmo_rating, administrative_documents_valid),
      is_recommended = false
  where comparison_id = target_comparison_id
    and archived_at is null;

  select quote_id
  into recommended_id
  from public.incident_quote_comparison_items
  where comparison_id = target_comparison_id
    and archived_at is null
  order by recommendation_score desc, administrative_documents_valid desc, price_cents asc, gerimmo_rating desc
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

  insert into public.incident_quote_validation_events (organization_id, comparison_id, quote_id, actor_profile_id, action, comment)
  select organization_id, id, recommended_id, auth.uid(), 'RECOMMENDATION', 'Recommandation GERIMMO calculee automatiquement.'
  from public.incident_quote_comparisons
  where id = target_comparison_id;

  return recommended_id;
end;
$$;

create or replace function public.log_incident_quote_comparison_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.incident_quote_validation_events (organization_id, comparison_id, actor_profile_id, action, old_values, new_values)
    values (new.organization_id, new.id, auth.uid(), 'CREATE', null, to_jsonb(new));
    return new;
  end if;

  action_name := case
    when new.status = 'valide' and old.status is distinct from 'valide' then 'VALIDATION'
    when new.status = 'refuse' and old.status is distinct from 'refuse' then 'REFUS'
    when new.status = 'complement' and old.status is distinct from 'complement' then 'COMPLEMENT'
    when new.status = 'annule' and old.status is distinct from 'annule' then 'ANNULATION'
    else 'UPDATE'
  end;

  insert into public.incident_quote_validation_events (organization_id, comparison_id, quote_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, new.recommended_quote_id, auth.uid(), action_name, to_jsonb(old), to_jsonb(new));

  return new;
end;
$$;

create or replace function public.log_incident_quote_comparison_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.incident_quote_validation_events (organization_id, comparison_id, quote_id, actor_profile_id, action, old_values, new_values)
    values (new.organization_id, new.comparison_id, new.quote_id, auth.uid(), 'ITEM_ADD', null, to_jsonb(new));
    return new;
  end if;

  insert into public.incident_quote_validation_events (organization_id, comparison_id, quote_id, actor_profile_id, action, comment, old_values, new_values)
  values (
    new.organization_id,
    new.comparison_id,
    new.quote_id,
    auth.uid(),
    case
      when new.decision_status = 'accepte' and old.decision_status is distinct from 'accepte' then 'VALIDATION'
      when new.decision_status = 'refuse' and old.decision_status is distinct from 'refuse' then 'REFUS'
      when new.decision_status = 'complement' and old.decision_status is distinct from 'complement' then 'COMPLEMENT'
      when new.comments is distinct from old.comments then 'COMMENTAIRE'
      else 'ITEM_UPDATE'
    end,
    new.decision_comment,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists incident_quote_comparisons_set_updated_at on public.incident_quote_comparisons;
create trigger incident_quote_comparisons_set_updated_at before update on public.incident_quote_comparisons for each row execute function public.set_updated_at();
drop trigger if exists incident_quote_comparison_items_set_updated_at on public.incident_quote_comparison_items;
create trigger incident_quote_comparison_items_set_updated_at before update on public.incident_quote_comparison_items for each row execute function public.set_updated_at();
drop trigger if exists incident_quote_comparisons_history on public.incident_quote_comparisons;
create trigger incident_quote_comparisons_history after insert or update on public.incident_quote_comparisons for each row execute function public.log_incident_quote_comparison_change();
drop trigger if exists incident_quote_comparison_items_history on public.incident_quote_comparison_items;
create trigger incident_quote_comparison_items_history after insert or update on public.incident_quote_comparison_items for each row execute function public.log_incident_quote_comparison_item_change();

alter table public.incident_quote_comparisons enable row level security;
alter table public.incident_quote_comparison_items enable row level security;
alter table public.incident_quote_validation_events enable row level security;

drop policy if exists incident_quote_comparisons_select_policy on public.incident_quote_comparisons;
create policy incident_quote_comparisons_select_policy on public.incident_quote_comparisons for select to authenticated using (public.can_access_incident_quote_comparison(id));
drop policy if exists incident_quote_comparisons_insert_policy on public.incident_quote_comparisons;
create policy incident_quote_comparisons_insert_policy on public.incident_quote_comparisons for insert to authenticated with check (public.can_manage_incidents(organization_id));
drop policy if exists incident_quote_comparisons_update_policy on public.incident_quote_comparisons;
create policy incident_quote_comparisons_update_policy on public.incident_quote_comparisons for update to authenticated using (public.can_manage_incidents(organization_id)) with check (public.can_manage_incidents(organization_id));
drop policy if exists incident_quote_comparisons_delete_policy on public.incident_quote_comparisons;
create policy incident_quote_comparisons_delete_policy on public.incident_quote_comparisons for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_quote_comparison_items_select_policy on public.incident_quote_comparison_items;
create policy incident_quote_comparison_items_select_policy on public.incident_quote_comparison_items for select to authenticated using (public.can_access_incident_quote_comparison(comparison_id));
drop policy if exists incident_quote_comparison_items_write_policy on public.incident_quote_comparison_items;
create policy incident_quote_comparison_items_write_policy on public.incident_quote_comparison_items for all to authenticated using (public.can_manage_incidents(organization_id)) with check (public.can_manage_incidents(organization_id));

drop policy if exists incident_quote_validation_events_select_policy on public.incident_quote_validation_events;
create policy incident_quote_validation_events_select_policy on public.incident_quote_validation_events for select to authenticated using (
  public.is_super_admin() or (comparison_id is not null and public.can_access_incident_quote_comparison(comparison_id)) or (organization_id is not null and public.can_manage_incidents(organization_id))
);
drop policy if exists incident_quote_validation_events_delete_policy on public.incident_quote_validation_events;
create policy incident_quote_validation_events_delete_policy on public.incident_quote_validation_events for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.incident_quote_comparisons to authenticated, service_role;
grant select, insert, update, delete on table public.incident_quote_comparison_items to authenticated, service_role;
grant select, insert, delete on table public.incident_quote_validation_events to authenticated, service_role;
grant execute on function public.can_access_incident_quote_comparison(uuid) to authenticated, service_role;
grant execute on function public.calculate_incident_quote_score(integer, numeric, boolean) to authenticated, service_role;
grant execute on function public.recommend_incident_quote(uuid) to authenticated, service_role;
