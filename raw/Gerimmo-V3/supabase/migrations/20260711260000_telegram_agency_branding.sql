-- GERIMMO V3 Sprint 6 - Personnalisation Telegram reservee aux agences.

create table if not exists public.organization_branding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  branding_enabled boolean not null default false,
  display_name text,
  logo_url text,
  welcome_message text,
  support_signature text,
  support_email text,
  support_phone text,
  opening_hours text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint organization_branding_display_name_length check (display_name is null or char_length(display_name) between 2 and 120),
  constraint organization_branding_welcome_length check (welcome_message is null or char_length(welcome_message) <= 500),
  constraint organization_branding_signature_length check (support_signature is null or char_length(support_signature) <= 300)
);

create table if not exists public.organization_branding_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branding_id uuid references public.organization_branding(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now(),
  constraint organization_branding_history_action_valid check (action in ('CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'RESTORED', 'ARCHIVED'))
);

create index if not exists organization_branding_organization_idx on public.organization_branding (organization_id) where archived_at is null;
create index if not exists organization_branding_history_organization_created_idx on public.organization_branding_history (organization_id, created_at desc);

create or replace function public.is_agency_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.member_role_assignments mra on mra.organization_member_id = om.id and mra.archived_at is null
    join public.roles r on r.id = mra.role_id and r.archived_at is null
    where om.organization_id = target_organization_id
      and om.status = 'active'
      and om.archived_at is null
      and r.key = 'administrateur_agence'
  );
$$;

create or replace function public.validate_agency_branding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branding_enabled and not public.is_agency_organization(new.organization_id) then
    raise exception 'La personnalisation de marque est reservee aux agences immobilieres.';
  end if;
  return new;
end;
$$;

create or replace function public.log_organization_branding_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_action text;
begin
  if tg_op = 'INSERT' then
    event_action := case when new.branding_enabled then 'ENABLED' else 'CREATED' end;
  elsif new.archived_at is not null and old.archived_at is null then
    event_action := 'ARCHIVED';
  elsif old.branding_enabled and not new.branding_enabled then
    event_action := case
      when new.display_name is null and new.logo_url is null and new.welcome_message is null and new.support_signature is null then 'RESTORED'
      else 'DISABLED'
    end;
  elsif not old.branding_enabled and new.branding_enabled then
    event_action := 'ENABLED';
  else
    event_action := 'UPDATED';
  end if;

  insert into public.organization_branding_history (
    organization_id,
    branding_id,
    actor_profile_id,
    action,
    previous_values,
    new_values
  ) values (
    new.organization_id,
    new.id,
    auth.uid(),
    event_action,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists organization_branding_validate on public.organization_branding;
create trigger organization_branding_validate before insert or update on public.organization_branding
for each row execute function public.validate_agency_branding();

drop trigger if exists organization_branding_updated_at on public.organization_branding;
create trigger organization_branding_updated_at before update on public.organization_branding
for each row execute function public.set_updated_at();

drop trigger if exists organization_branding_history_trigger on public.organization_branding;
create trigger organization_branding_history_trigger after insert or update on public.organization_branding
for each row execute function public.log_organization_branding_change();

alter table public.organization_branding enable row level security;
alter table public.organization_branding_history enable row level security;

drop policy if exists organization_branding_select_policy on public.organization_branding;
create policy organization_branding_select_policy on public.organization_branding for select to authenticated using (
  public.is_super_admin() or public.is_active_organization_member(organization_id)
);

drop policy if exists organization_branding_insert_policy on public.organization_branding;
create policy organization_branding_insert_policy on public.organization_branding for insert to authenticated with check (
  (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']))
  and (not branding_enabled or public.is_agency_organization(organization_id))
);

drop policy if exists organization_branding_update_policy on public.organization_branding;
create policy organization_branding_update_policy on public.organization_branding for update to authenticated using (
  public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence'])
) with check (
  (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']))
  and (not branding_enabled or public.is_agency_organization(organization_id))
);

drop policy if exists organization_branding_delete_policy on public.organization_branding;
create policy organization_branding_delete_policy on public.organization_branding for delete to authenticated using (public.is_super_admin());

drop policy if exists organization_branding_history_select_policy on public.organization_branding_history;
create policy organization_branding_history_select_policy on public.organization_branding_history for select to authenticated using (
  public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence'])
);

grant select, insert, update, delete on table public.organization_branding to authenticated, service_role;
grant select on table public.organization_branding_history to authenticated;
grant select, insert on table public.organization_branding_history to service_role;
grant execute on function public.is_agency_organization(uuid) to authenticated, service_role;

