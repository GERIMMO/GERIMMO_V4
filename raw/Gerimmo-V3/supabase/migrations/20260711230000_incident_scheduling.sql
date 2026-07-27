-- GERIMMO V3 Sprint 5.4 - Planification des interventions.
-- Disponibilites artisan, choix responsable/locataire et historique complet.

create table if not exists public.incident_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  quote_request_id uuid not null references public.incident_quote_requests(id) on delete restrict,
  comparison_id uuid references public.incident_quote_comparisons(id) on delete set null,
  accepted_quote_id uuid not null references public.incident_quotes(id) on delete restrict,
  quote_recipient_id uuid not null references public.incident_quote_recipients(id) on delete restrict,
  artisan_profile_id uuid references public.profiles(id) on delete set null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  tenant_profile_id uuid references public.profiles(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'demande_disponibilites',
  current_round integer not null default 1,
  selected_slot_id uuid,
  validated_at timestamptz,
  future_links jsonb not null default '{"intervention":null,"bot":null,"notifications":null}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_schedule_requests_round_positive check (current_round >= 1),
  constraint incident_schedule_requests_status_valid check (status in ('demande_disponibilites', 'creneaux_proposes', 'transmis_locataire', 'valide', 'relance_artisan', 'annule')),
  constraint incident_schedule_requests_future_links_object check (jsonb_typeof(future_links) = 'object')
);

create table if not exists public.incident_schedule_slot_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_request_id uuid not null references public.incident_schedule_requests(id) on delete restrict,
  proposed_by uuid references public.profiles(id) on delete set null,
  round_number integer not null default 1,
  status text not null default 'brouillon',
  artisan_comment text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_schedule_slot_batches_round_positive check (round_number >= 1),
  constraint incident_schedule_slot_batches_status_valid check (status in ('brouillon', 'proposee', 'transmise', 'acceptee', 'refusee', 'remplacee'))
);

create table if not exists public.incident_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_request_id uuid not null references public.incident_schedule_requests(id) on delete restrict,
  batch_id uuid not null references public.incident_schedule_slot_batches(id) on delete restrict,
  slot_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  comment text,
  status text not null default 'propose',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_schedule_slots_time_order check (ends_at > starts_at),
  constraint incident_schedule_slots_status_valid check (status in ('propose', 'selectionne', 'refuse', 'expire'))
);

alter table public.incident_schedule_requests drop constraint if exists incident_schedule_requests_selected_slot_fk;
alter table public.incident_schedule_requests add constraint incident_schedule_requests_selected_slot_fk foreign key (selected_slot_id) references public.incident_schedule_slots(id) on delete set null;

create table if not exists public.incident_schedule_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_request_id uuid not null references public.incident_schedule_requests(id) on delete restrict,
  batch_id uuid references public.incident_schedule_slot_batches(id) on delete set null,
  slot_id uuid references public.incident_schedule_slots(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  action text not null,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_schedule_responses_actor_role_valid check (actor_role in ('responsable', 'locataire', 'artisan', 'systeme')),
  constraint incident_schedule_responses_action_valid check (action in ('acceptation_directe', 'transmission_locataire', 'choix_locataire', 'refus_locataire', 'nouvelle_demande_artisan', 'annulation'))
);

create table if not exists public.incident_schedule_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  schedule_request_id uuid references public.incident_schedule_requests(id) on delete set null,
  batch_id uuid references public.incident_schedule_slot_batches(id) on delete set null,
  slot_id uuid references public.incident_schedule_slots(id) on delete set null,
  response_id uuid references public.incident_schedule_responses(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  comment text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_schedule_events_action_not_empty check (length(trim(action)) > 0)
);

create unique index if not exists incident_schedule_requests_quote_active_idx on public.incident_schedule_requests (accepted_quote_id) where archived_at is null;
create index if not exists incident_schedule_requests_organization_id_idx on public.incident_schedule_requests (organization_id);
create index if not exists incident_schedule_requests_incident_id_idx on public.incident_schedule_requests (incident_id);
create index if not exists incident_schedule_requests_quote_request_id_idx on public.incident_schedule_requests (quote_request_id);
create index if not exists incident_schedule_requests_status_idx on public.incident_schedule_requests (status);
create index if not exists incident_schedule_requests_artisan_idx on public.incident_schedule_requests (artisan_profile_id);
create index if not exists incident_schedule_requests_tenant_idx on public.incident_schedule_requests (tenant_profile_id);
create index if not exists incident_schedule_slot_batches_request_idx on public.incident_schedule_slot_batches (schedule_request_id, round_number);
create index if not exists incident_schedule_slots_request_idx on public.incident_schedule_slots (schedule_request_id);
create index if not exists incident_schedule_slots_batch_idx on public.incident_schedule_slots (batch_id);
create index if not exists incident_schedule_slots_starts_at_idx on public.incident_schedule_slots (starts_at);
create index if not exists incident_schedule_responses_request_idx on public.incident_schedule_responses (schedule_request_id);
create index if not exists incident_schedule_events_request_idx on public.incident_schedule_events (schedule_request_id);
create index if not exists incident_schedule_events_created_at_idx on public.incident_schedule_events (created_at desc);

create or replace function public.can_access_incident_schedule_request(target_schedule_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
    or coalesce((
      select true from public.incident_schedule_requests isr
      where isr.id = target_schedule_request_id
        and isr.archived_at is null
        and (public.can_manage_incidents(isr.organization_id) or public.can_access_incident(isr.incident_id) or isr.responsible_profile_id = auth.uid() or isr.tenant_profile_id = auth.uid() or isr.artisan_profile_id = auth.uid())
      limit 1
    ), false);
$$;

create or replace function public.can_write_incident_schedule(target_schedule_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
    or coalesce((
      select true from public.incident_schedule_requests isr
      where isr.id = target_schedule_request_id
        and isr.archived_at is null
        and (public.can_manage_incidents(isr.organization_id) or isr.responsible_profile_id = auth.uid() or isr.tenant_profile_id = auth.uid() or isr.artisan_profile_id = auth.uid())
      limit 1
    ), false);
$$;

create or replace function public.validate_incident_schedule_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare quote_status text; quote_request uuid; quote_recipient uuid; quote_organization uuid;
begin
  select status, quote_request_id, recipient_id, organization_id into quote_status, quote_request, quote_recipient, quote_organization from public.incident_quotes where id = new.accepted_quote_id and archived_at is null;
  if quote_status is distinct from 'retenu' then raise exception 'La planification necessite un devis accepte.'; end if;
  if new.quote_request_id is distinct from quote_request or new.quote_recipient_id is distinct from quote_recipient or new.organization_id is distinct from quote_organization then raise exception 'La planification doit rester rattachee au devis accepte.'; end if;
  return new;
end;
$$;

create or replace function public.validate_incident_schedule_batch()
returns trigger language plpgsql security definer set search_path = public as $$
declare slots_count integer;
begin
  if new.status in ('proposee', 'transmise') and (old.status is null or new.status is distinct from old.status) then
    select count(*) into slots_count from public.incident_schedule_slots where batch_id = new.id and archived_at is null;
    if slots_count < 3 then raise exception 'L artisan doit proposer au moins 3 creneaux.'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.log_incident_schedule_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_schedule_events (organization_id, schedule_request_id, slot_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, new.selected_slot_id, auth.uid(), case when tg_op = 'INSERT' then 'CREATE' when new.status = 'valide' and old.status is distinct from 'valide' then 'VALIDATION_CRENEAU' when new.status = 'relance_artisan' and old.status is distinct from 'relance_artisan' then 'RELANCE_ARTISAN' when new.status = 'transmis_locataire' and old.status is distinct from 'transmis_locataire' then 'TRANSMISSION_LOCATAIRE' else 'UPDATE' end, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

create or replace function public.log_incident_schedule_batch_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_schedule_events (organization_id, schedule_request_id, batch_id, actor_profile_id, action, comment, old_values, new_values)
  values (new.organization_id, new.schedule_request_id, new.id, auth.uid(), case when tg_op = 'INSERT' then 'BATCH_CREATE' when new.status = 'proposee' and old.status is distinct from 'proposee' then 'PROPOSITION_CRENEAUX' when new.status = 'transmise' and old.status is distinct from 'transmise' then 'BATCH_TRANSMIS' when new.status = 'acceptee' and old.status is distinct from 'acceptee' then 'BATCH_ACCEPTE' when new.status = 'refusee' and old.status is distinct from 'refusee' then 'BATCH_REFUSE' else 'BATCH_UPDATE' end, new.artisan_comment, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

create or replace function public.log_incident_schedule_slot_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_schedule_events (organization_id, schedule_request_id, batch_id, slot_id, actor_profile_id, action, comment, old_values, new_values)
  values (new.organization_id, new.schedule_request_id, new.batch_id, new.id, auth.uid(), case when tg_op = 'INSERT' then 'SLOT_ADD' when new.status = 'selectionne' and old.status is distinct from 'selectionne' then 'SLOT_SELECTIONNE' else 'SLOT_UPDATE' end, new.comment, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

create or replace function public.log_incident_schedule_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_schedule_events (organization_id, schedule_request_id, batch_id, slot_id, response_id, actor_profile_id, action, comment, new_values)
  values (new.organization_id, new.schedule_request_id, new.batch_id, new.slot_id, new.id, new.actor_profile_id, upper(new.action), new.comment, to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists incident_schedule_requests_validate on public.incident_schedule_requests;
create trigger incident_schedule_requests_validate before insert or update on public.incident_schedule_requests for each row execute function public.validate_incident_schedule_request();
drop trigger if exists incident_schedule_slot_batches_validate on public.incident_schedule_slot_batches;
create trigger incident_schedule_slot_batches_validate before update on public.incident_schedule_slot_batches for each row execute function public.validate_incident_schedule_batch();
drop trigger if exists incident_schedule_requests_set_updated_at on public.incident_schedule_requests;
create trigger incident_schedule_requests_set_updated_at before update on public.incident_schedule_requests for each row execute function public.set_updated_at();
drop trigger if exists incident_schedule_slot_batches_set_updated_at on public.incident_schedule_slot_batches;
create trigger incident_schedule_slot_batches_set_updated_at before update on public.incident_schedule_slot_batches for each row execute function public.set_updated_at();
drop trigger if exists incident_schedule_slots_set_updated_at on public.incident_schedule_slots;
create trigger incident_schedule_slots_set_updated_at before update on public.incident_schedule_slots for each row execute function public.set_updated_at();
drop trigger if exists incident_schedule_requests_history on public.incident_schedule_requests;
create trigger incident_schedule_requests_history after insert or update on public.incident_schedule_requests for each row execute function public.log_incident_schedule_request_change();
drop trigger if exists incident_schedule_slot_batches_history on public.incident_schedule_slot_batches;
create trigger incident_schedule_slot_batches_history after insert or update on public.incident_schedule_slot_batches for each row execute function public.log_incident_schedule_batch_change();
drop trigger if exists incident_schedule_slots_history on public.incident_schedule_slots;
create trigger incident_schedule_slots_history after insert or update on public.incident_schedule_slots for each row execute function public.log_incident_schedule_slot_change();
drop trigger if exists incident_schedule_responses_history on public.incident_schedule_responses;
create trigger incident_schedule_responses_history after insert on public.incident_schedule_responses for each row execute function public.log_incident_schedule_response();

alter table public.incident_schedule_requests enable row level security;
alter table public.incident_schedule_slot_batches enable row level security;
alter table public.incident_schedule_slots enable row level security;
alter table public.incident_schedule_responses enable row level security;
alter table public.incident_schedule_events enable row level security;

drop policy if exists incident_schedule_requests_select_policy on public.incident_schedule_requests;
create policy incident_schedule_requests_select_policy on public.incident_schedule_requests for select to authenticated using (public.can_access_incident_schedule_request(id));
drop policy if exists incident_schedule_requests_insert_policy on public.incident_schedule_requests;
create policy incident_schedule_requests_insert_policy on public.incident_schedule_requests for insert to authenticated with check (public.can_manage_incidents(organization_id));
drop policy if exists incident_schedule_requests_update_policy on public.incident_schedule_requests;
create policy incident_schedule_requests_update_policy on public.incident_schedule_requests for update to authenticated using (public.can_write_incident_schedule(id)) with check (public.can_write_incident_schedule(id));
drop policy if exists incident_schedule_requests_delete_policy on public.incident_schedule_requests;
create policy incident_schedule_requests_delete_policy on public.incident_schedule_requests for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_schedule_slot_batches_select_policy on public.incident_schedule_slot_batches;
create policy incident_schedule_slot_batches_select_policy on public.incident_schedule_slot_batches for select to authenticated using (public.can_access_incident_schedule_request(schedule_request_id));
drop policy if exists incident_schedule_slot_batches_write_policy on public.incident_schedule_slot_batches;
create policy incident_schedule_slot_batches_write_policy on public.incident_schedule_slot_batches for all to authenticated using (public.can_write_incident_schedule(schedule_request_id)) with check (public.can_write_incident_schedule(schedule_request_id));

drop policy if exists incident_schedule_slots_select_policy on public.incident_schedule_slots;
create policy incident_schedule_slots_select_policy on public.incident_schedule_slots for select to authenticated using (public.can_access_incident_schedule_request(schedule_request_id));
drop policy if exists incident_schedule_slots_write_policy on public.incident_schedule_slots;
create policy incident_schedule_slots_write_policy on public.incident_schedule_slots for all to authenticated using (public.can_write_incident_schedule(schedule_request_id)) with check (public.can_write_incident_schedule(schedule_request_id));

drop policy if exists incident_schedule_responses_select_policy on public.incident_schedule_responses;
create policy incident_schedule_responses_select_policy on public.incident_schedule_responses for select to authenticated using (public.can_access_incident_schedule_request(schedule_request_id));
drop policy if exists incident_schedule_responses_insert_policy on public.incident_schedule_responses;
create policy incident_schedule_responses_insert_policy on public.incident_schedule_responses for insert to authenticated with check (public.can_write_incident_schedule(schedule_request_id));
drop policy if exists incident_schedule_responses_delete_policy on public.incident_schedule_responses;
create policy incident_schedule_responses_delete_policy on public.incident_schedule_responses for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_schedule_events_select_policy on public.incident_schedule_events;
create policy incident_schedule_events_select_policy on public.incident_schedule_events for select to authenticated using (public.is_super_admin() or (schedule_request_id is not null and public.can_access_incident_schedule_request(schedule_request_id)) or (organization_id is not null and public.can_manage_incidents(organization_id)));
drop policy if exists incident_schedule_events_delete_policy on public.incident_schedule_events;
create policy incident_schedule_events_delete_policy on public.incident_schedule_events for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.incident_schedule_requests to authenticated, service_role;
grant select, insert, update, delete on table public.incident_schedule_slot_batches to authenticated, service_role;
grant select, insert, update, delete on table public.incident_schedule_slots to authenticated, service_role;
grant select, insert, delete on table public.incident_schedule_responses to authenticated, service_role;
grant select, insert, delete on table public.incident_schedule_events to authenticated, service_role;
grant execute on function public.can_access_incident_schedule_request(uuid) to authenticated, service_role;
grant execute on function public.can_write_incident_schedule(uuid) to authenticated, service_role;
