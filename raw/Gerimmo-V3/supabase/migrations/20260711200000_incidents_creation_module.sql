-- GERIMMO V3 Sprint 5.1 - Incidents.
-- Socle de creation, consultation, archivage et historique des incidents.

create table if not exists public.incident_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  is_official boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_categories_name_not_empty check (length(trim(name)) > 0),
  constraint incident_categories_slug_not_empty check (length(trim(slug)) > 0)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bien_id uuid not null references public.biens(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  category_id uuid references public.incident_categories(id) on delete set null,
  category text not null,
  subcategory text,
  description text not null,
  priority text not null default 'normale',
  status text not null default 'nouveau',
  photos jsonb not null default '[]'::jsonb,
  future_links jsonb not null default '{"devis":[],"interventions":[],"rapports":[],"bot":null}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incidents_number_not_empty check (length(trim(number)) > 0),
  constraint incidents_category_not_empty check (length(trim(category)) > 0),
  constraint incidents_description_not_empty check (length(trim(description)) > 0),
  constraint incidents_priority_valid check (priority in ('basse', 'normale', 'haute', 'urgente')),
  constraint incidents_status_valid check (status in ('nouveau', 'en_cours', 'archive')),
  constraint incidents_photos_array check (jsonb_typeof(photos) = 'array'),
  constraint incidents_future_links_object check (jsonb_typeof(future_links) = 'object')
);

create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_events_action_not_empty check (length(trim(action)) > 0)
);

create unique index if not exists incident_categories_slug_org_active_idx
  on public.incident_categories (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug))
  where archived_at is null;
create unique index if not exists incidents_number_org_active_idx on public.incidents (organization_id, lower(number)) where archived_at is null;
create index if not exists incident_categories_organization_id_idx on public.incident_categories (organization_id);
create index if not exists incidents_organization_id_idx on public.incidents (organization_id);
create index if not exists incidents_bien_id_idx on public.incidents (bien_id);
create index if not exists incidents_created_by_idx on public.incidents (created_by);
create index if not exists incidents_responsible_profile_id_idx on public.incidents (responsible_profile_id);
create index if not exists incidents_category_id_idx on public.incidents (category_id);
create index if not exists incidents_status_idx on public.incidents (status);
create index if not exists incidents_priority_idx on public.incidents (priority);
create index if not exists incidents_archived_at_idx on public.incidents (archived_at);
create index if not exists incidents_created_at_idx on public.incidents (created_at desc);
create index if not exists incident_events_incident_id_idx on public.incident_events (incident_id);
create index if not exists incident_events_organization_id_idx on public.incident_events (organization_id);
create index if not exists incident_events_created_at_idx on public.incident_events (created_at desc);

create or replace function public.can_access_incident(target_incident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or coalesce((
      select true
      from public.incidents i
      where i.id = target_incident_id
        and i.archived_at is null
        and (
          public.has_organization_role(i.organization_id, array['administrateur_agence', 'agent_immobilier'])
          or public.is_active_organization_member(i.organization_id)
          or i.created_by = auth.uid()
          or i.responsible_profile_id = auth.uid()
        )
      limit 1
    ), false);
$$;

create or replace function public.can_manage_incidents(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_organization_role(target_organization_id, array['administrateur_agence', 'agent_immobilier']);
$$;

create or replace function public.generate_incident_number(target_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year text := to_char(now(), 'YYYY');
  next_number integer;
begin
  select count(*) + 1
  into next_number
  from public.incidents
  where organization_id = target_organization_id
    and number like 'INC-' || current_year || '-%';

  return 'INC-' || current_year || '-' || lpad(next_number::text, 6, '0');
end;
$$;

create or replace function public.set_incident_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.number is null or length(trim(new.number)) = 0 then
    new.number := public.generate_incident_number(new.organization_id);
  end if;

  return new;
end;
$$;

create or replace function public.log_incident_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.incident_events (organization_id, incident_id, actor_profile_id, action, old_values, new_values)
    values (new.organization_id, new.id, auth.uid(), 'CREATE', null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.incident_events (organization_id, incident_id, actor_profile_id, action, old_values, new_values)
    values (old.organization_id, null, auth.uid(), 'DELETE', to_jsonb(old), null);
    return old;
  end if;

  action_name := case
    when new.archived_at is not null and old.archived_at is null then 'ARCHIVE'
    when new.responsible_profile_id is distinct from old.responsible_profile_id then 'ASSIGN'
    else 'UPDATE'
  end;

  insert into public.incident_events (organization_id, incident_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, auth.uid(), action_name, to_jsonb(old), to_jsonb(new));

  return new;
end;
$$;

drop trigger if exists incident_categories_set_updated_at on public.incident_categories;
create trigger incident_categories_set_updated_at before update on public.incident_categories for each row execute function public.set_updated_at();
drop trigger if exists incidents_set_number on public.incidents;
create trigger incidents_set_number before insert on public.incidents for each row execute function public.set_incident_number();
drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at before update on public.incidents for each row execute function public.set_updated_at();
drop trigger if exists incidents_history_changes on public.incidents;
create trigger incidents_history_changes after insert or update or delete on public.incidents for each row execute function public.log_incident_change();

alter table public.incident_categories enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;

drop policy if exists incident_categories_select_policy on public.incident_categories;
create policy incident_categories_select_policy on public.incident_categories for select to authenticated using (
  public.is_super_admin() or organization_id is null or public.is_active_organization_member(organization_id)
);
drop policy if exists incident_categories_insert_policy on public.incident_categories;
create policy incident_categories_insert_policy on public.incident_categories for insert to authenticated with check (
  organization_id is not null and public.can_manage_incidents(organization_id)
);
drop policy if exists incident_categories_update_policy on public.incident_categories;
create policy incident_categories_update_policy on public.incident_categories for update to authenticated using (
  organization_id is not null and public.can_manage_incidents(organization_id)
) with check (
  organization_id is not null and public.can_manage_incidents(organization_id)
);
drop policy if exists incident_categories_delete_policy on public.incident_categories;
create policy incident_categories_delete_policy on public.incident_categories for delete to authenticated using (public.is_super_admin());

drop policy if exists incidents_select_policy on public.incidents;
create policy incidents_select_policy on public.incidents for select to authenticated using (public.can_access_incident(id));
drop policy if exists incidents_insert_policy on public.incidents;
create policy incidents_insert_policy on public.incidents for insert to authenticated with check (public.can_manage_incidents(organization_id));
drop policy if exists incidents_update_policy on public.incidents;
create policy incidents_update_policy on public.incidents for update to authenticated using (public.can_manage_incidents(organization_id)) with check (public.can_manage_incidents(organization_id));
drop policy if exists incidents_delete_policy on public.incidents;
create policy incidents_delete_policy on public.incidents for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_events_select_policy on public.incident_events;
create policy incident_events_select_policy on public.incident_events for select to authenticated using (
  public.is_super_admin() or (incident_id is not null and public.can_access_incident(incident_id)) or (organization_id is not null and public.can_manage_incidents(organization_id))
);
drop policy if exists incident_events_delete_policy on public.incident_events;
create policy incident_events_delete_policy on public.incident_events for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.incident_categories to authenticated, service_role;
grant select, insert, update, delete on table public.incidents to authenticated, service_role;
grant select, insert, delete on table public.incident_events to authenticated, service_role;
grant execute on function public.can_access_incident(uuid) to authenticated, service_role;
grant execute on function public.can_manage_incidents(uuid) to authenticated, service_role;
grant execute on function public.generate_incident_number(uuid) to authenticated, service_role;

insert into public.incident_categories (name, slug, description, is_official, sort_order)
values
  ('Plomberie', 'plomberie', 'Fuites, degats des eaux, robinetterie et canalisations', true, 10),
  ('Electricite', 'electricite', 'Pannes electriques, tableaux, prises et eclairage', true, 20),
  ('Chauffage', 'chauffage', 'Chauffage, eau chaude et equipements thermiques', true, 30),
  ('Serrurerie', 'serrurerie', 'Serrures, portes, acces et securisation', true, 40),
  ('Parties communes', 'parties-communes', 'Halls, escaliers, ascenseurs et espaces partages', true, 50),
  ('Administratif', 'administratif', 'Demandes administratives liees au bien', true, 60)
on conflict do nothing;
