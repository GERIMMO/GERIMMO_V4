-- Preserve revoked Telegram links as history without exposing them as active records.
update public.telegram_accounts
set archived_at = coalesce(revoked_at, updated_at, now())
where status in ('revoked', 'archived')
  and archived_at is null;

create or replace function public.normalize_telegram_account_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('revoked', 'archived') then
    new.archived_at := coalesce(new.archived_at, new.revoked_at, now());
  elsif new.status = 'connected' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists telegram_accounts_normalize_archive on public.telegram_accounts;
create trigger telegram_accounts_normalize_archive
before insert or update of status, revoked_at, archived_at
on public.telegram_accounts
for each row
execute function public.normalize_telegram_account_archive();

revoke all on function public.normalize_telegram_account_archive()
from public, anon, authenticated;

-- Keep the first response when an identical action was recorded again within five seconds.
create temporary table gerimmo_duplicate_schedule_responses (
  duplicate_id uuid primary key,
  canonical_id uuid not null
) on commit drop;

insert into gerimmo_duplicate_schedule_responses (duplicate_id, canonical_id)
select id, canonical_id
from (
  select
    id,
    first_value(id) over response_group as canonical_id,
    first_value(created_at) over response_group as canonical_created_at,
    row_number() over response_group as duplicate_rank,
    created_at
  from public.incident_schedule_responses
  window response_group as (
    partition by
      organization_id,
      schedule_request_id,
      batch_id,
      slot_id,
      actor_profile_id,
      actor_role,
      action,
      comment,
      metadata
    order by created_at, id
  )
) ranked
where duplicate_rank > 1
  and created_at <= canonical_created_at + interval '5 seconds';

insert into public.audit_logs (
  organization_id,
  action,
  table_name,
  record_id,
  old_values,
  new_values
)
select
  response.organization_id,
  'DEDUPLICATE',
  'incident_schedule_responses',
  response.id,
  to_jsonb(response),
  jsonb_build_object('canonical_id', duplicate.canonical_id)
from public.incident_schedule_responses response
join gerimmo_duplicate_schedule_responses duplicate
  on duplicate.duplicate_id = response.id;

update public.incident_schedule_events event
set
  response_id = duplicate.canonical_id,
  metadata = coalesce(event.metadata, '{}'::jsonb) || jsonb_build_object(
    'deduplicated_response_id', duplicate.duplicate_id,
    'deduplicated_at', now()
  )
from gerimmo_duplicate_schedule_responses duplicate
where event.response_id = duplicate.duplicate_id;

delete from public.incident_schedule_responses response
using gerimmo_duplicate_schedule_responses duplicate
where response.id = duplicate.duplicate_id;

create or replace function public.prevent_duplicate_incident_schedule_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.schedule_request_id::text, 0));

  if exists (
    select 1
    from public.incident_schedule_responses existing
    where existing.schedule_request_id = new.schedule_request_id
      and existing.organization_id = new.organization_id
      and existing.batch_id is not distinct from new.batch_id
      and existing.slot_id is not distinct from new.slot_id
      and existing.actor_profile_id is not distinct from new.actor_profile_id
      and existing.actor_role = new.actor_role
      and existing.action = new.action
      and existing.comment is not distinct from new.comment
      and existing.metadata = new.metadata
      and existing.created_at >= new.created_at - interval '5 seconds'
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists incident_schedule_responses_prevent_duplicate
on public.incident_schedule_responses;
create trigger incident_schedule_responses_prevent_duplicate
before insert on public.incident_schedule_responses
for each row
execute function public.prevent_duplicate_incident_schedule_response();

revoke all on function public.prevent_duplicate_incident_schedule_response()
from public, anon, authenticated;

drop index if exists public.incident_schedule_responses_request_idx;
create index incident_schedule_responses_request_idx
on public.incident_schedule_responses (schedule_request_id, created_at desc);

comment on table public.telegram_accounts is
  'Liaisons Telegram actives et historique archive des liaisons revoquees.';
comment on table public.incident_schedule_responses is
  'Reponses metier de planification, protegees contre les soumissions identiques rapprochees.';
