-- GERIMMO V3 Sprint 2 - Patrimoine.

create table if not exists public.patrimoines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  reference text not null,
  description text,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint patrimoines_name_not_empty check (length(trim(name)) > 0),
  constraint patrimoines_reference_not_empty check (length(trim(reference)) > 0),
  constraint patrimoines_status_valid check (status in ('active', 'archived'))
);

create table if not exists public.residences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patrimoine_id uuid not null references public.patrimoines(id) on delete restrict,
  name text not null,
  reference text not null,
  address_line1 text,
  postal_code text,
  city text,
  country text not null default 'France',
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint residences_name_not_empty check (length(trim(name)) > 0),
  constraint residences_reference_not_empty check (length(trim(reference)) > 0),
  constraint residences_status_valid check (status in ('active', 'archived'))
);

create table if not exists public.biens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patrimoine_id uuid not null references public.patrimoines(id) on delete restrict,
  residence_id uuid references public.residences(id) on delete restrict,
  reference text not null,
  name text not null,
  type text not null default 'appartement',
  status text not null default 'vacant',
  address_line1 text,
  postal_code text,
  city text,
  country text not null default 'France',
  floor text,
  surface_m2 numeric(10, 2),
  rooms numeric(4, 1),
  monthly_rent_cents integer not null default 0,
  monthly_charges_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint biens_reference_not_empty check (length(trim(reference)) > 0),
  constraint biens_name_not_empty check (length(trim(name)) > 0),
  constraint biens_type_valid check (type in ('appartement', 'maison', 'local', 'parking', 'terrain', 'autre')),
  constraint biens_status_valid check (status in ('vacant', 'occupe', 'travaux', 'archive')),
  constraint biens_surface_positive check (surface_m2 is null or surface_m2 >= 0),
  constraint biens_rooms_positive check (rooms is null or rooms >= 0),
  constraint biens_rent_positive check (monthly_rent_cents >= 0),
  constraint biens_charges_positive check (monthly_charges_cents >= 0)
);

create table if not exists public.bien_occupants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bien_id uuid not null references public.biens(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete restrict,
  full_name text not null,
  occupant_type text not null default 'locataire',
  started_at date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bien_occupants_full_name_not_empty check (length(trim(full_name)) > 0),
  constraint bien_occupants_type_valid check (occupant_type in ('locataire', 'proprietaire', 'autre'))
);

create table if not exists public.bien_echeances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bien_id uuid not null references public.biens(id) on delete restrict,
  title text not null,
  due_date date not null,
  status text not null default 'a_prevoir',
  amount_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bien_echeances_title_not_empty check (length(trim(title)) > 0),
  constraint bien_echeances_status_valid check (status in ('a_prevoir', 'en_cours', 'terminee', 'archive')),
  constraint bien_echeances_amount_positive check (amount_cents is null or amount_cents >= 0)
);

create table if not exists public.bien_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  bien_id uuid references public.biens(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists patrimoines_reference_org_active_idx on public.patrimoines (organization_id, lower(reference)) where archived_at is null;
create unique index if not exists residences_reference_org_active_idx on public.residences (organization_id, lower(reference)) where archived_at is null;
create unique index if not exists biens_reference_org_active_idx on public.biens (organization_id, lower(reference)) where archived_at is null;
create index if not exists patrimoines_organization_id_idx on public.patrimoines (organization_id);
create index if not exists residences_organization_id_idx on public.residences (organization_id);
create index if not exists residences_patrimoine_id_idx on public.residences (patrimoine_id);
create index if not exists biens_organization_id_idx on public.biens (organization_id);
create index if not exists biens_patrimoine_id_idx on public.biens (patrimoine_id);
create index if not exists biens_residence_id_idx on public.biens (residence_id);
create index if not exists biens_status_idx on public.biens (status);
create index if not exists biens_archived_at_idx on public.biens (archived_at);
create index if not exists bien_occupants_bien_id_idx on public.bien_occupants (bien_id);
create index if not exists bien_echeances_bien_id_idx on public.bien_echeances (bien_id);
create index if not exists bien_echeances_due_date_idx on public.bien_echeances (due_date);
create index if not exists bien_history_bien_id_idx on public.bien_history (bien_id);
create index if not exists bien_history_created_at_idx on public.bien_history (created_at desc);

create or replace function public.can_access_bien(target_bien_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
    or coalesce((select true from public.biens b where b.id = target_bien_id and public.is_active_organization_member(b.organization_id) limit 1), false);
$$;

create or replace function public.log_bien_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.bien_history (organization_id, bien_id, actor_profile_id, action, old_values, new_values)
    values (old.organization_id, null, auth.uid(), 'DELETE', to_jsonb(old), null);
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.bien_history (organization_id, bien_id, actor_profile_id, action, old_values, new_values)
    values (new.organization_id, new.id, auth.uid(), 'CREATE', null, to_jsonb(new));
    return new;
  end if;
  insert into public.bien_history (organization_id, bien_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, auth.uid(), case when new.archived_at is not null and old.archived_at is null then 'ARCHIVE' else 'UPDATE' end, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

alter table public.patrimoines enable row level security;
alter table public.residences enable row level security;
alter table public.biens enable row level security;
alter table public.bien_occupants enable row level security;
alter table public.bien_echeances enable row level security;
alter table public.bien_history enable row level security;

drop trigger if exists patrimoines_set_updated_at on public.patrimoines;
create trigger patrimoines_set_updated_at before update on public.patrimoines for each row execute function public.set_updated_at();
drop trigger if exists residences_set_updated_at on public.residences;
create trigger residences_set_updated_at before update on public.residences for each row execute function public.set_updated_at();
drop trigger if exists biens_set_updated_at on public.biens;
create trigger biens_set_updated_at before update on public.biens for each row execute function public.set_updated_at();
drop trigger if exists bien_occupants_set_updated_at on public.bien_occupants;
create trigger bien_occupants_set_updated_at before update on public.bien_occupants for each row execute function public.set_updated_at();
drop trigger if exists bien_echeances_set_updated_at on public.bien_echeances;
create trigger bien_echeances_set_updated_at before update on public.bien_echeances for each row execute function public.set_updated_at();
drop trigger if exists biens_history_changes on public.biens;
create trigger biens_history_changes after insert or update or delete on public.biens for each row execute function public.log_bien_history();

drop policy if exists patrimoines_select_policy on public.patrimoines;
create policy patrimoines_select_policy on public.patrimoines for select to authenticated using (public.is_super_admin() or public.is_active_organization_member(organization_id));
drop policy if exists patrimoines_insert_policy on public.patrimoines;
create policy patrimoines_insert_policy on public.patrimoines for insert to authenticated with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists patrimoines_update_policy on public.patrimoines;
create policy patrimoines_update_policy on public.patrimoines for update to authenticated using (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])) with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists patrimoines_delete_policy on public.patrimoines;
create policy patrimoines_delete_policy on public.patrimoines for delete to authenticated using (public.is_super_admin());

drop policy if exists residences_select_policy on public.residences;
create policy residences_select_policy on public.residences for select to authenticated using (public.is_super_admin() or public.is_active_organization_member(organization_id));
drop policy if exists residences_insert_policy on public.residences;
create policy residences_insert_policy on public.residences for insert to authenticated with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists residences_update_policy on public.residences;
create policy residences_update_policy on public.residences for update to authenticated using (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])) with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists residences_delete_policy on public.residences;
create policy residences_delete_policy on public.residences for delete to authenticated using (public.is_super_admin());

drop policy if exists biens_select_policy on public.biens;
create policy biens_select_policy on public.biens for select to authenticated using (public.is_super_admin() or public.is_active_organization_member(organization_id));
drop policy if exists biens_insert_policy on public.biens;
create policy biens_insert_policy on public.biens for insert to authenticated with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists biens_update_policy on public.biens;
create policy biens_update_policy on public.biens for update to authenticated using (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])) with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists biens_delete_policy on public.biens;
create policy biens_delete_policy on public.biens for delete to authenticated using (public.is_super_admin());

drop policy if exists bien_occupants_select_policy on public.bien_occupants;
create policy bien_occupants_select_policy on public.bien_occupants for select to authenticated using (public.is_super_admin() or public.can_access_bien(bien_id));
drop policy if exists bien_occupants_insert_policy on public.bien_occupants;
create policy bien_occupants_insert_policy on public.bien_occupants for insert to authenticated with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists bien_occupants_update_policy on public.bien_occupants;
create policy bien_occupants_update_policy on public.bien_occupants for update to authenticated using (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])) with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists bien_occupants_delete_policy on public.bien_occupants;
create policy bien_occupants_delete_policy on public.bien_occupants for delete to authenticated using (public.is_super_admin());

drop policy if exists bien_echeances_select_policy on public.bien_echeances;
create policy bien_echeances_select_policy on public.bien_echeances for select to authenticated using (public.is_super_admin() or public.can_access_bien(bien_id));
drop policy if exists bien_echeances_insert_policy on public.bien_echeances;
create policy bien_echeances_insert_policy on public.bien_echeances for insert to authenticated with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists bien_echeances_update_policy on public.bien_echeances;
create policy bien_echeances_update_policy on public.bien_echeances for update to authenticated using (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])) with check (public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']));
drop policy if exists bien_echeances_delete_policy on public.bien_echeances;
create policy bien_echeances_delete_policy on public.bien_echeances for delete to authenticated using (public.is_super_admin());

drop policy if exists bien_history_select_policy on public.bien_history;
create policy bien_history_select_policy on public.bien_history for select to authenticated using (public.is_super_admin() or (organization_id is not null and public.is_active_organization_member(organization_id)));
drop policy if exists bien_history_delete_policy on public.bien_history;
create policy bien_history_delete_policy on public.bien_history for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.patrimoines to authenticated, service_role;
grant select, insert, update, delete on table public.residences to authenticated, service_role;
grant select, insert, update, delete on table public.biens to authenticated, service_role;
grant select, insert, update, delete on table public.bien_occupants to authenticated, service_role;
grant select, insert, update, delete on table public.bien_echeances to authenticated, service_role;
grant select, delete on table public.bien_history to authenticated, service_role;
grant insert on table public.bien_history to service_role;
grant execute on function public.can_access_bien(uuid) to authenticated, service_role;
