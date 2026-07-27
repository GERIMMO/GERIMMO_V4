-- GERIMMO V3 Sprint 5.2 - Demandes de devis.
-- Demandes rattachees aux incidents, destinataires artisans, devis recus et historique.

create table if not exists public.incident_quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'demande',
  allow_single_private_artisan boolean not null default false,
  sent_at timestamptz,
  expires_at timestamptz,
  future_links jsonb not null default '{"validation":null,"planification":null,"intervention":null}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_quote_requests_title_not_empty check (length(trim(title)) > 0),
  constraint incident_quote_requests_status_valid check (status in ('demande', 'recu', 'refuse', 'expire', 'retenu')),
  constraint incident_quote_requests_future_links_object check (jsonb_typeof(future_links) = 'object')
);

create table if not exists public.incident_quote_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_request_id uuid not null references public.incident_quote_requests(id) on delete restrict,
  artisan_profile_id uuid references public.profiles(id) on delete set null,
  artisan_name text not null,
  artisan_email citext,
  artisan_scope text not null,
  status text not null default 'demande',
  sent_at timestamptz,
  responded_at timestamptz,
  declined_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_quote_recipients_name_not_empty check (length(trim(artisan_name)) > 0),
  constraint incident_quote_recipients_scope_valid check (artisan_scope in ('prive', 'gerimmo_valide')),
  constraint incident_quote_recipients_status_valid check (status in ('demande', 'recu', 'refuse', 'expire', 'retenu'))
);

create table if not exists public.incident_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_request_id uuid not null references public.incident_quote_requests(id) on delete restrict,
  recipient_id uuid not null references public.incident_quote_recipients(id) on delete restrict,
  amount_cents integer not null default 0,
  currency text not null default 'EUR',
  received_at timestamptz not null default now(),
  valid_until date,
  file_name text,
  storage_path text,
  notes text,
  status text not null default 'recu',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_quotes_amount_positive check (amount_cents >= 0),
  constraint incident_quotes_currency_not_empty check (length(trim(currency)) > 0),
  constraint incident_quotes_status_valid check (status in ('demande', 'recu', 'refuse', 'expire', 'retenu'))
);

create table if not exists public.incident_quote_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  quote_request_id uuid references public.incident_quote_requests(id) on delete set null,
  recipient_id uuid references public.incident_quote_recipients(id) on delete set null,
  quote_id uuid references public.incident_quotes(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_quote_events_action_not_empty check (length(trim(action)) > 0)
);

create index if not exists incident_quote_requests_organization_id_idx on public.incident_quote_requests (organization_id);
create index if not exists incident_quote_requests_incident_id_idx on public.incident_quote_requests (incident_id);
create index if not exists incident_quote_requests_status_idx on public.incident_quote_requests (status);
create index if not exists incident_quote_requests_archived_at_idx on public.incident_quote_requests (archived_at);
create index if not exists incident_quote_recipients_request_id_idx on public.incident_quote_recipients (quote_request_id);
create index if not exists incident_quote_recipients_artisan_profile_id_idx on public.incident_quote_recipients (artisan_profile_id);
create index if not exists incident_quote_recipients_status_idx on public.incident_quote_recipients (status);
create index if not exists incident_quotes_request_id_idx on public.incident_quotes (quote_request_id);
create index if not exists incident_quotes_recipient_id_idx on public.incident_quotes (recipient_id);
create index if not exists incident_quotes_status_idx on public.incident_quotes (status);
create index if not exists incident_quote_events_request_id_idx on public.incident_quote_events (quote_request_id);
create index if not exists incident_quote_events_created_at_idx on public.incident_quote_events (created_at desc);

create or replace function public.can_access_incident_quote_request(target_quote_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or coalesce((
      select true
      from public.incident_quote_requests iqr
      where iqr.id = target_quote_request_id
        and iqr.archived_at is null
        and (
          public.can_manage_incidents(iqr.organization_id)
          or public.can_access_incident(iqr.incident_id)
          or iqr.requested_by = auth.uid()
          or exists (
            select 1
            from public.incident_quote_recipients iqrp
            where iqrp.quote_request_id = iqr.id
              and iqrp.archived_at is null
              and iqrp.artisan_profile_id = auth.uid()
          )
        )
      limit 1
    ), false);
$$;

create or replace function public.validate_incident_quote_request_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients_count integer;
  private_count integer;
begin
  if new.sent_at is not null and (old.sent_at is null or new.sent_at is distinct from old.sent_at) then
    select count(*), count(*) filter (where artisan_scope = 'prive')
    into recipients_count, private_count
    from public.incident_quote_recipients
    where quote_request_id = new.id
      and archived_at is null;

    if recipients_count < 1 then
      raise exception 'Une demande de devis doit avoir au moins un artisan destinataire.';
    end if;

    if recipients_count < 2 and not (new.allow_single_private_artisan and recipients_count = 1 and private_count = 1) then
      raise exception 'GERIMMO exige au moins 2 devis, sauf choix explicite d un seul artisan prive.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.log_incident_quote_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.incident_quote_events (organization_id, quote_request_id, actor_profile_id, action, old_values, new_values)
    values (new.organization_id, new.id, auth.uid(), 'CREATE', null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.incident_quote_events (organization_id, quote_request_id, actor_profile_id, action, old_values, new_values)
    values (old.organization_id, null, auth.uid(), 'DELETE', to_jsonb(old), null);
    return old;
  end if;

  action_name := case
    when new.sent_at is not null and old.sent_at is null then 'SEND'
    when new.archived_at is not null and old.archived_at is null then 'ARCHIVE'
    else 'UPDATE'
  end;

  insert into public.incident_quote_events (organization_id, quote_request_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, auth.uid(), action_name, to_jsonb(old), to_jsonb(new));

  return new;
end;
$$;

create or replace function public.log_incident_quote_recipient_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.incident_quote_events (organization_id, quote_request_id, recipient_id, actor_profile_id, action, new_values)
    values (new.organization_id, new.quote_request_id, new.id, auth.uid(), 'RECIPIENT_ADD', to_jsonb(new));
    return new;
  end if;

  insert into public.incident_quote_events (organization_id, quote_request_id, recipient_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.quote_request_id, new.id, auth.uid(), case when new.status = 'recu' and old.status is distinct from 'recu' then 'QUOTE_RECEIVED' else 'RECIPIENT_UPDATE' end, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

create or replace function public.log_incident_quote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.incident_quote_events (organization_id, quote_request_id, recipient_id, quote_id, actor_profile_id, action, new_values)
    values (new.organization_id, new.quote_request_id, new.recipient_id, new.id, auth.uid(), 'QUOTE_RECEIVED', to_jsonb(new));

    update public.incident_quote_recipients
    set status = 'recu', responded_at = coalesce(responded_at, now())
    where id = new.recipient_id;

    update public.incident_quote_requests
    set status = 'recu'
    where id = new.quote_request_id
      and status = 'demande';

    return new;
  end if;

  insert into public.incident_quote_events (organization_id, quote_request_id, recipient_id, quote_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.quote_request_id, new.recipient_id, new.id, auth.uid(), case when new.status = 'retenu' and old.status is distinct from 'retenu' then 'QUOTE_SELECTED' else 'QUOTE_UPDATE' end, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists incident_quote_requests_validate_send on public.incident_quote_requests;
create trigger incident_quote_requests_validate_send before update of sent_at on public.incident_quote_requests for each row execute function public.validate_incident_quote_request_send();
drop trigger if exists incident_quote_requests_set_updated_at on public.incident_quote_requests;
create trigger incident_quote_requests_set_updated_at before update on public.incident_quote_requests for each row execute function public.set_updated_at();
drop trigger if exists incident_quote_recipients_set_updated_at on public.incident_quote_recipients;
create trigger incident_quote_recipients_set_updated_at before update on public.incident_quote_recipients for each row execute function public.set_updated_at();
drop trigger if exists incident_quotes_set_updated_at on public.incident_quotes;
create trigger incident_quotes_set_updated_at before update on public.incident_quotes for each row execute function public.set_updated_at();
drop trigger if exists incident_quote_requests_history on public.incident_quote_requests;
create trigger incident_quote_requests_history after insert or update or delete on public.incident_quote_requests for each row execute function public.log_incident_quote_request_change();
drop trigger if exists incident_quote_recipients_history on public.incident_quote_recipients;
create trigger incident_quote_recipients_history after insert or update on public.incident_quote_recipients for each row execute function public.log_incident_quote_recipient_change();
drop trigger if exists incident_quotes_history on public.incident_quotes;
create trigger incident_quotes_history after insert or update on public.incident_quotes for each row execute function public.log_incident_quote_change();

alter table public.incident_quote_requests enable row level security;
alter table public.incident_quote_recipients enable row level security;
alter table public.incident_quotes enable row level security;
alter table public.incident_quote_events enable row level security;

drop policy if exists incident_quote_requests_select_policy on public.incident_quote_requests;
create policy incident_quote_requests_select_policy on public.incident_quote_requests for select to authenticated using (public.can_access_incident_quote_request(id));
drop policy if exists incident_quote_requests_insert_policy on public.incident_quote_requests;
create policy incident_quote_requests_insert_policy on public.incident_quote_requests for insert to authenticated with check (public.can_manage_incidents(organization_id));
drop policy if exists incident_quote_requests_update_policy on public.incident_quote_requests;
create policy incident_quote_requests_update_policy on public.incident_quote_requests for update to authenticated using (public.can_manage_incidents(organization_id)) with check (public.can_manage_incidents(organization_id));
drop policy if exists incident_quote_requests_delete_policy on public.incident_quote_requests;
create policy incident_quote_requests_delete_policy on public.incident_quote_requests for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_quote_recipients_select_policy on public.incident_quote_recipients;
create policy incident_quote_recipients_select_policy on public.incident_quote_recipients for select to authenticated using (public.can_access_incident_quote_request(quote_request_id));
drop policy if exists incident_quote_recipients_write_policy on public.incident_quote_recipients;
create policy incident_quote_recipients_write_policy on public.incident_quote_recipients for all to authenticated using (public.can_manage_incidents(organization_id)) with check (public.can_manage_incidents(organization_id));

drop policy if exists incident_quotes_select_policy on public.incident_quotes;
create policy incident_quotes_select_policy on public.incident_quotes for select to authenticated using (public.can_access_incident_quote_request(quote_request_id));
drop policy if exists incident_quotes_write_policy on public.incident_quotes;
create policy incident_quotes_write_policy on public.incident_quotes for all to authenticated using (public.can_manage_incidents(organization_id)) with check (public.can_manage_incidents(organization_id));

drop policy if exists incident_quote_events_select_policy on public.incident_quote_events;
create policy incident_quote_events_select_policy on public.incident_quote_events for select to authenticated using (
  public.is_super_admin() or (quote_request_id is not null and public.can_access_incident_quote_request(quote_request_id)) or (organization_id is not null and public.can_manage_incidents(organization_id))
);
drop policy if exists incident_quote_events_delete_policy on public.incident_quote_events;
create policy incident_quote_events_delete_policy on public.incident_quote_events for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.incident_quote_requests to authenticated, service_role;
grant select, insert, update, delete on table public.incident_quote_recipients to authenticated, service_role;
grant select, insert, update, delete on table public.incident_quotes to authenticated, service_role;
grant select, insert, delete on table public.incident_quote_events to authenticated, service_role;
grant execute on function public.can_access_incident_quote_request(uuid) to authenticated, service_role;
