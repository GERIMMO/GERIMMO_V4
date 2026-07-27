-- GERIMMO V3 Sprint 4 - Documents.
-- Bibliotheque documentaire, versions, droits, historique, alertes et modeles officiels.

create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  color text not null default '#2563eb',
  is_official boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint document_categories_name_not_empty check (length(trim(name)) > 0),
  constraint document_categories_slug_not_empty check (length(trim(slug)) > 0)
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  category_id uuid references public.document_categories(id) on delete set null,
  name text not null,
  template_key text not null,
  description text,
  template_type text not null default 'document',
  content_blocks jsonb not null default '[]'::jsonb,
  merge_fields jsonb not null default '[]'::jsonb,
  official_scope text not null default 'gerimmo',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint document_templates_name_not_empty check (length(trim(name)) > 0),
  constraint document_templates_key_not_empty check (length(trim(template_key)) > 0),
  constraint document_templates_type_valid check (template_type in ('rapport_incident', 'quittance', 'bon_intervention', 'courrier', 'devis', 'compte_rendu', 'document')),
  constraint document_templates_scope_valid check (official_scope in ('gerimmo', 'agence', 'proprietaire'))
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category_id uuid references public.document_categories(id) on delete set null,
  template_id uuid references public.document_templates(id) on delete set null,
  patrimoine_id uuid references public.patrimoines(id) on delete set null,
  residence_id uuid references public.residences(id) on delete set null,
  bien_id uuid references public.biens(id) on delete set null,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  tenant_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  reference text not null,
  description text,
  document_type text not null default 'autre',
  status text not null default 'brouillon',
  visibility text not null default 'organisation',
  storage_bucket text not null default 'documents',
  storage_path text,
  file_name text,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0,
  checksum text,
  current_version integer not null default 1,
  official_document boolean not null default false,
  expires_at date,
  expiration_alert_days integer not null default 30,
  metadata jsonb not null default '{}'::jsonb,
  mail_context jsonb not null default '{}'::jsonb,
  bot_context jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  restored_at timestamptz,
  restored_by uuid references public.profiles(id) on delete set null,
  constraint documents_title_not_empty check (length(trim(title)) > 0),
  constraint documents_reference_not_empty check (length(trim(reference)) > 0),
  constraint documents_file_size_positive check (file_size_bytes >= 0),
  constraint documents_current_version_positive check (current_version > 0),
  constraint documents_expiration_alert_positive check (expiration_alert_days >= 0),
  constraint documents_status_valid check (status in ('brouillon', 'actif', 'envoye', 'expire', 'archive')),
  constraint documents_visibility_valid check (visibility in ('organisation', 'agence', 'proprietaire', 'locataire', 'artisan', 'prive')),
  constraint documents_type_valid check (document_type in ('rapport_incident', 'quittance', 'bon_intervention', 'courrier', 'devis', 'compte_rendu', 'contrat', 'attestation', 'autre'))
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  version_number integer not null,
  storage_bucket text not null default 'documents',
  storage_path text,
  file_name text,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0,
  checksum text,
  change_summary text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint document_versions_number_positive check (version_number > 0),
  constraint document_versions_file_size_positive check (file_size_bytes >= 0)
);

create table if not exists public.document_access_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete cascade,
  role_key text references public.roles(key) on delete cascade,
  access_level text not null default 'lecture',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint document_access_target_present check (profile_id is not null or role_key is not null),
  constraint document_access_level_valid check (access_level in ('lecture', 'edition', 'administration'))
);

create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  document_version_id uuid references public.document_versions(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_events_action_not_empty check (length(trim(action)) > 0)
);

create table if not exists public.document_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  alert_type text not null default 'expiration',
  due_at timestamptz not null,
  status text not null default 'a_traiter',
  message text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  archived_at timestamptz,
  constraint document_alerts_type_valid check (alert_type in ('expiration', 'version', 'signature', 'controle')),
  constraint document_alerts_status_valid check (status in ('a_traiter', 'traitee', 'archive'))
);

create table if not exists public.document_email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  recipient_email citext not null,
  subject text not null,
  body text,
  status text not null default 'pret',
  provider_message_id text,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint document_email_recipient_not_empty check (length(trim(recipient_email::text)) > 0),
  constraint document_email_subject_not_empty check (length(trim(subject)) > 0),
  constraint document_email_status_valid check (status in ('pret', 'envoye', 'erreur', 'archive'))
);

create unique index if not exists document_categories_slug_org_active_idx on public.document_categories (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug)) where archived_at is null;
create unique index if not exists document_templates_key_org_active_idx on public.document_templates (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(template_key)) where archived_at is null;
create unique index if not exists documents_reference_org_active_idx on public.documents (organization_id, lower(reference)) where archived_at is null;
create unique index if not exists document_versions_document_number_idx on public.document_versions (document_id, version_number);
create index if not exists document_categories_organization_id_idx on public.document_categories (organization_id);
create index if not exists documents_organization_id_idx on public.documents (organization_id);
create index if not exists documents_category_id_idx on public.documents (category_id);
create index if not exists documents_bien_id_idx on public.documents (bien_id);
create index if not exists documents_status_idx on public.documents (status);
create index if not exists documents_visibility_idx on public.documents (visibility);
create index if not exists documents_expires_at_idx on public.documents (expires_at);
create index if not exists documents_archived_at_idx on public.documents (archived_at);
create index if not exists document_versions_document_id_idx on public.document_versions (document_id);
create index if not exists document_access_rules_document_id_idx on public.document_access_rules (document_id);
create index if not exists document_access_rules_profile_id_idx on public.document_access_rules (profile_id);
create index if not exists document_events_document_id_idx on public.document_events (document_id);
create index if not exists document_events_created_at_idx on public.document_events (created_at desc);
create index if not exists document_alerts_document_id_idx on public.document_alerts (document_id);
create index if not exists document_alerts_due_at_idx on public.document_alerts (due_at);
create index if not exists document_email_outbox_document_id_idx on public.document_email_outbox (document_id);

create or replace function public.can_access_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or coalesce((
      select true
      from public.documents d
      where d.id = target_document_id
        and d.archived_at is null
        and (
          public.has_organization_role(d.organization_id, array['administrateur_agence', 'agent_immobilier'])
          or public.is_active_organization_member(d.organization_id)
          or d.owner_profile_id = auth.uid()
          or d.tenant_profile_id = auth.uid()
          or exists (
            select 1
            from public.document_access_rules dar
            where dar.document_id = d.id
              and dar.archived_at is null
              and (
                dar.profile_id = auth.uid()
                or exists (
                  select 1
                  from public.organization_members om
                  join public.member_role_assignments mra on mra.organization_member_id = om.id
                  join public.roles r on r.id = mra.role_id
                  where om.profile_id = auth.uid()
                    and om.organization_id = d.organization_id
                    and om.archived_at is null
                    and om.status = 'active'
                    and r.key = dar.role_key
                )
              )
          )
        )
      limit 1
    ), false);
$$;

create or replace function public.can_manage_documents(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.has_organization_role(target_organization_id, array['administrateur_agence', 'agent_immobilier']);
$$;

create or replace function public.log_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.document_versions (organization_id, document_id, version_number, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, checksum, change_summary, created_by)
    values (new.organization_id, new.id, new.current_version, new.storage_bucket, new.storage_path, new.file_name, new.mime_type, new.file_size_bytes, new.checksum, 'Version initiale', auth.uid())
    on conflict (document_id, version_number) do nothing;

    insert into public.document_events (organization_id, document_id, actor_profile_id, action, old_values, new_values)
    values (new.organization_id, new.id, auth.uid(), 'CREATE', null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.document_events (organization_id, document_id, actor_profile_id, action, old_values, new_values)
    values (old.organization_id, null, auth.uid(), 'DELETE', to_jsonb(old), null);
    return old;
  end if;

  action_name := case
    when new.archived_at is not null and old.archived_at is null then 'ARCHIVE'
    when new.archived_at is null and old.archived_at is not null then 'RESTORE'
    when new.current_version is distinct from old.current_version then 'VERSION'
    when new.status = 'envoye' and old.status is distinct from 'envoye' then 'SEND'
    else 'UPDATE'
  end;

  insert into public.document_events (organization_id, document_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, auth.uid(), action_name, to_jsonb(old), to_jsonb(new));

  return new;
end;
$$;

create or replace function public.create_document_expiration_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expires_at is not null and (tg_op = 'INSERT' or new.expires_at is distinct from old.expires_at) then
    insert into public.document_alerts (organization_id, document_id, alert_type, due_at, message)
    values (
      new.organization_id,
      new.id,
      'expiration',
      (new.expires_at::timestamp - make_interval(days => new.expiration_alert_days))::timestamptz,
      'Document a verifier avant expiration'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists document_categories_set_updated_at on public.document_categories;
create trigger document_categories_set_updated_at before update on public.document_categories for each row execute function public.set_updated_at();
drop trigger if exists document_templates_set_updated_at on public.document_templates;
create trigger document_templates_set_updated_at before update on public.document_templates for each row execute function public.set_updated_at();
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
drop trigger if exists documents_history_changes on public.documents;
create trigger documents_history_changes after insert or update or delete on public.documents for each row execute function public.log_document_change();
drop trigger if exists documents_expiration_alert on public.documents;
create trigger documents_expiration_alert after insert or update of expires_at, expiration_alert_days on public.documents for each row execute function public.create_document_expiration_alert();

alter table public.document_categories enable row level security;
alter table public.document_templates enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_access_rules enable row level security;
alter table public.document_events enable row level security;
alter table public.document_alerts enable row level security;
alter table public.document_email_outbox enable row level security;

drop policy if exists document_categories_select_policy on public.document_categories;
create policy document_categories_select_policy on public.document_categories for select to authenticated using (
  public.is_super_admin() or organization_id is null or public.is_active_organization_member(organization_id)
);
drop policy if exists document_categories_insert_policy on public.document_categories;
create policy document_categories_insert_policy on public.document_categories for insert to authenticated with check (
  organization_id is not null and public.can_manage_documents(organization_id)
);
drop policy if exists document_categories_update_policy on public.document_categories;
create policy document_categories_update_policy on public.document_categories for update to authenticated using (
  organization_id is not null and public.can_manage_documents(organization_id)
) with check (
  organization_id is not null and public.can_manage_documents(organization_id)
);
drop policy if exists document_categories_delete_policy on public.document_categories;
create policy document_categories_delete_policy on public.document_categories for delete to authenticated using (public.is_super_admin());

drop policy if exists document_templates_select_policy on public.document_templates;
create policy document_templates_select_policy on public.document_templates for select to authenticated using (
  public.is_super_admin() or organization_id is null or public.is_active_organization_member(organization_id)
);
drop policy if exists document_templates_write_policy on public.document_templates;
create policy document_templates_write_policy on public.document_templates for all to authenticated using (
  organization_id is not null and public.can_manage_documents(organization_id)
) with check (
  organization_id is not null and public.can_manage_documents(organization_id)
);

drop policy if exists documents_select_policy on public.documents;
create policy documents_select_policy on public.documents for select to authenticated using (public.can_access_document(id));
drop policy if exists documents_insert_policy on public.documents;
create policy documents_insert_policy on public.documents for insert to authenticated with check (public.can_manage_documents(organization_id));
drop policy if exists documents_update_policy on public.documents;
create policy documents_update_policy on public.documents for update to authenticated using (public.can_manage_documents(organization_id)) with check (public.can_manage_documents(organization_id));
drop policy if exists documents_delete_policy on public.documents;
create policy documents_delete_policy on public.documents for delete to authenticated using (public.is_super_admin());

drop policy if exists document_versions_select_policy on public.document_versions;
create policy document_versions_select_policy on public.document_versions for select to authenticated using (public.can_access_document(document_id));
drop policy if exists document_versions_insert_policy on public.document_versions;
create policy document_versions_insert_policy on public.document_versions for insert to authenticated with check (public.can_manage_documents(organization_id));
drop policy if exists document_versions_update_policy on public.document_versions;
create policy document_versions_update_policy on public.document_versions for update to authenticated using (public.can_manage_documents(organization_id)) with check (public.can_manage_documents(organization_id));
drop policy if exists document_versions_delete_policy on public.document_versions;
create policy document_versions_delete_policy on public.document_versions for delete to authenticated using (public.is_super_admin());

drop policy if exists document_access_rules_select_policy on public.document_access_rules;
create policy document_access_rules_select_policy on public.document_access_rules for select to authenticated using (public.can_access_document(document_id));
drop policy if exists document_access_rules_write_policy on public.document_access_rules;
create policy document_access_rules_write_policy on public.document_access_rules for all to authenticated using (public.can_manage_documents(organization_id)) with check (public.can_manage_documents(organization_id));

drop policy if exists document_events_select_policy on public.document_events;
create policy document_events_select_policy on public.document_events for select to authenticated using (
  public.is_super_admin() or (document_id is not null and public.can_access_document(document_id)) or (organization_id is not null and public.can_manage_documents(organization_id))
);
drop policy if exists document_events_delete_policy on public.document_events;
create policy document_events_delete_policy on public.document_events for delete to authenticated using (public.is_super_admin());

drop policy if exists document_alerts_select_policy on public.document_alerts;
create policy document_alerts_select_policy on public.document_alerts for select to authenticated using (public.can_access_document(document_id));
drop policy if exists document_alerts_update_policy on public.document_alerts;
create policy document_alerts_update_policy on public.document_alerts for update to authenticated using (public.can_manage_documents(organization_id)) with check (public.can_manage_documents(organization_id));
drop policy if exists document_alerts_delete_policy on public.document_alerts;
create policy document_alerts_delete_policy on public.document_alerts for delete to authenticated using (public.is_super_admin());

drop policy if exists document_email_outbox_select_policy on public.document_email_outbox;
create policy document_email_outbox_select_policy on public.document_email_outbox for select to authenticated using (public.can_access_document(document_id));
drop policy if exists document_email_outbox_insert_policy on public.document_email_outbox;
create policy document_email_outbox_insert_policy on public.document_email_outbox for insert to authenticated with check (public.can_manage_documents(organization_id));
drop policy if exists document_email_outbox_update_policy on public.document_email_outbox;
create policy document_email_outbox_update_policy on public.document_email_outbox for update to authenticated using (public.can_manage_documents(organization_id)) with check (public.can_manage_documents(organization_id));
drop policy if exists document_email_outbox_delete_policy on public.document_email_outbox;
create policy document_email_outbox_delete_policy on public.document_email_outbox for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.document_categories to authenticated, service_role;
grant select, insert, update, delete on table public.document_templates to authenticated, service_role;
grant select, insert, update, delete on table public.documents to authenticated, service_role;
grant select, insert, update, delete on table public.document_versions to authenticated, service_role;
grant select, insert, update, delete on table public.document_access_rules to authenticated, service_role;
grant select, insert, delete on table public.document_events to authenticated, service_role;
grant select, insert, update, delete on table public.document_alerts to authenticated, service_role;
grant select, insert, update, delete on table public.document_email_outbox to authenticated, service_role;
grant execute on function public.can_access_document(uuid) to authenticated, service_role;
grant execute on function public.can_manage_documents(uuid) to authenticated, service_role;

insert into public.document_categories (name, slug, description, color, is_official, sort_order)
values
  ('Rapports', 'rapports', 'Rapports officiels GERIMMO', '#0f766e', true, 10),
  ('Quittances', 'quittances', 'Quittances et documents de paiement', '#2563eb', true, 20),
  ('Interventions', 'interventions', 'Bons et comptes rendus d intervention', '#7c3aed', true, 30),
  ('Courriers', 'courriers', 'Courriers agences, proprietaires et locataires', '#ea580c', true, 40),
  ('Devis', 'devis', 'Devis et propositions artisans', '#be123c', true, 50)
on conflict do nothing;

insert into public.document_templates (name, template_key, description, template_type, official_scope, content_blocks, merge_fields)
values
  ('Rapport d incident', 'rapport-incident', 'Modele officiel de rapport d incident', 'rapport_incident', 'gerimmo', '[{"title":"Contexte"},{"title":"Constat"},{"title":"Actions recommandees"}]'::jsonb, '["agence","bien","incident","date"]'::jsonb),
  ('Quittance', 'quittance', 'Modele officiel de quittance', 'quittance', 'gerimmo', '[{"title":"Identite locataire"},{"title":"Periode"},{"title":"Montants"}]'::jsonb, '["locataire","bien","loyer","charges","periode"]'::jsonb),
  ('Bon d intervention', 'bon-intervention', 'Modele officiel de bon d intervention', 'bon_intervention', 'gerimmo', '[{"title":"Mission"},{"title":"Acces"},{"title":"Validation"}]'::jsonb, '["artisan","bien","mission","date"]'::jsonb),
  ('Courrier', 'courrier', 'Modele officiel de courrier', 'courrier', 'gerimmo', '[{"title":"Destinataire"},{"title":"Objet"},{"title":"Message"}]'::jsonb, '["destinataire","agence","objet"]'::jsonb),
  ('Devis', 'devis', 'Modele officiel de devis', 'devis', 'gerimmo', '[{"title":"Prestations"},{"title":"Prix"},{"title":"Conditions"}]'::jsonb, '["artisan","client","montant","validite"]'::jsonb),
  ('Compte rendu', 'compte-rendu', 'Modele officiel de compte rendu', 'compte_rendu', 'gerimmo', '[{"title":"Synthese"},{"title":"Decisions"},{"title":"Suites"}]'::jsonb, '["auteur","date","participants"]'::jsonb)
on conflict do nothing;
