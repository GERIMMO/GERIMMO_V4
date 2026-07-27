-- GERIMMO V3 Sprint 5 final - Interventions, rapports, cloture et evaluations.

alter table public.incidents drop constraint if exists incidents_status_valid;
alter table public.incidents
  add constraint incidents_status_valid check (status in ('nouveau', 'en_cours', 'cloture', 'archive'));

create table if not exists public.incident_interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  bien_id uuid not null references public.biens(id) on delete restrict,
  schedule_request_id uuid references public.incident_schedule_requests(id) on delete set null,
  selected_slot_id uuid references public.incident_schedule_slots(id) on delete set null,
  accepted_quote_id uuid references public.incident_quotes(id) on delete set null,
  quote_recipient_id uuid references public.incident_quote_recipients(id) on delete set null,
  artisan_profile_id uuid references public.profiles(id) on delete set null,
  internal_intervenant_profile_id uuid references public.profiles(id) on delete set null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  tenant_profile_id uuid references public.profiles(id) on delete set null,
  execution_mode text not null default 'artisan_gerimmo',
  planned_starts_at timestamptz not null,
  planned_ends_at timestamptz not null,
  actual_starts_at timestamptz,
  actual_ends_at timestamptz,
  status text not null default 'planifiee',
  work_description text,
  artisan_comment text,
  responsible_comment text,
  photos_before jsonb not null default '[]'::jsonb,
  photos_during jsonb not null default '[]'::jsonb,
  photos_after jsonb not null default '[]'::jsonb,
  planned_amount_cents integer not null default 0,
  final_amount_cents integer,
  amount_difference_cents integer,
  difference_reason text,
  completion_validation jsonb not null default '{}'::jsonb,
  future_links jsonb not null default '{"rapport":null,"bot":null,"notifications":null}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_interventions_mode_valid check (execution_mode in ('artisan_gerimmo', 'artisan_prive', 'interne')),
  constraint incident_interventions_status_valid check (status in ('planifiee', 'confirmee', 'en_cours', 'suspendue', 'terminee', 'annulee', 'a_reprogrammer')),
  constraint incident_interventions_planned_order check (planned_ends_at > planned_starts_at),
  constraint incident_interventions_actual_order check (actual_ends_at is null or actual_starts_at is null or actual_ends_at >= actual_starts_at),
  constraint incident_interventions_amounts_positive check (planned_amount_cents >= 0 and (final_amount_cents is null or final_amount_cents >= 0)),
  constraint incident_interventions_photos_before_array check (jsonb_typeof(photos_before) = 'array'),
  constraint incident_interventions_photos_during_array check (jsonb_typeof(photos_during) = 'array'),
  constraint incident_interventions_photos_after_array check (jsonb_typeof(photos_after) = 'array')
);

create table if not exists public.incident_intervention_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  intervention_id uuid not null references public.incident_interventions(id) on delete restrict,
  name text not null,
  quantity numeric(10, 2) not null default 1,
  unit text,
  amount_cents integer not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint incident_intervention_materials_name_not_empty check (length(trim(name)) > 0),
  constraint incident_intervention_materials_quantity_positive check (quantity > 0),
  constraint incident_intervention_materials_amount_positive check (amount_cents >= 0)
);

create table if not exists public.incident_intervention_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  intervention_id uuid references public.incident_interventions(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  comment text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_intervention_events_action_not_empty check (length(trim(action)) > 0)
);

create table if not exists public.incident_intervention_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  intervention_id uuid not null references public.incident_interventions(id) on delete restrict,
  document_id uuid references public.documents(id) on delete set null,
  report_reference text not null,
  status text not null default 'brouillon',
  report_data jsonb not null default '{}'::jsonb,
  observations text,
  validation_comment text,
  generated_at timestamptz,
  validated_at timestamptz,
  validated_by uuid references public.profiles(id) on delete set null,
  downloaded_at timestamptz,
  printed_at timestamptz,
  email_prepared_at timestamptz,
  pdf_storage_path text,
  pdf_file_name text,
  pdf_checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_intervention_reports_reference_not_empty check (length(trim(report_reference)) > 0),
  constraint incident_intervention_reports_status_valid check (status in ('brouillon', 'previsualise', 'modifie', 'genere', 'valide', 'archive'))
);

create table if not exists public.incident_intervention_report_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  report_id uuid references public.incident_intervention_reports(id) on delete set null,
  intervention_id uuid references public.incident_interventions(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  comment text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint incident_intervention_report_events_action_not_empty check (length(trim(action)) > 0)
);

create table if not exists public.incident_closure_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  intervention_id uuid not null references public.incident_interventions(id) on delete restrict,
  report_id uuid not null references public.incident_intervention_reports(id) on delete restrict,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  status text not null default 'a_verifier',
  comment text,
  reserve_details text,
  correction_requested text,
  new_intervention_required boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_closure_reviews_action_valid check (action in ('validation', 'correction', 'nouvelle_intervention', 'cloture_reserve', 'cloture_normale')),
  constraint incident_closure_reviews_status_valid check (status in ('a_verifier', 'valide', 'correction_demandee', 'nouvelle_intervention', 'cloture_reserve', 'cloture_normale'))
);

create table if not exists public.incident_closure_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  closure_review_id uuid references public.incident_closure_reviews(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  comment text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_artisan_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  intervention_id uuid not null references public.incident_interventions(id) on delete restrict,
  artisan_profile_id uuid references public.profiles(id) on delete set null,
  evaluator_profile_id uuid not null references public.profiles(id) on delete restrict,
  evaluator_role text not null,
  work_quality integer not null,
  appointment_respect integer not null,
  communication integer not null,
  cleanliness integer not null,
  overall_rating integer not null,
  average_rating numeric(3, 2) generated always as (round(((work_quality + appointment_respect + communication + cleanliness + overall_rating)::numeric / 5), 2)) stored,
  comment text,
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint incident_artisan_evaluations_role_valid check (evaluator_role in ('locataire', 'responsable')),
  constraint incident_artisan_evaluations_scores_valid check (
    work_quality between 1 and 5 and appointment_respect between 1 and 5 and communication between 1 and 5 and cleanliness between 1 and 5 and overall_rating between 1 and 5
  )
);

create unique index if not exists incident_artisan_evaluations_once_idx on public.incident_artisan_evaluations (intervention_id, evaluator_profile_id) where archived_at is null;
create index if not exists incident_interventions_organization_id_idx on public.incident_interventions (organization_id);
create index if not exists incident_interventions_incident_id_idx on public.incident_interventions (incident_id);
create index if not exists incident_interventions_bien_id_idx on public.incident_interventions (bien_id);
create index if not exists incident_interventions_status_idx on public.incident_interventions (status);
create index if not exists incident_interventions_artisan_idx on public.incident_interventions (artisan_profile_id);
create index if not exists incident_interventions_tenant_idx on public.incident_interventions (tenant_profile_id);
create index if not exists incident_interventions_planned_idx on public.incident_interventions (planned_starts_at);
create index if not exists incident_intervention_materials_intervention_idx on public.incident_intervention_materials (intervention_id);
create index if not exists incident_intervention_events_intervention_idx on public.incident_intervention_events (intervention_id);
create index if not exists incident_intervention_events_created_at_idx on public.incident_intervention_events (created_at desc);
create unique index if not exists incident_intervention_reports_intervention_active_idx on public.incident_intervention_reports (intervention_id) where archived_at is null;
create index if not exists incident_intervention_reports_incident_idx on public.incident_intervention_reports (incident_id);
create index if not exists incident_intervention_reports_document_idx on public.incident_intervention_reports (document_id);
create index if not exists incident_intervention_report_events_report_idx on public.incident_intervention_report_events (report_id);
create index if not exists incident_closure_reviews_incident_idx on public.incident_closure_reviews (incident_id);
create index if not exists incident_closure_events_incident_idx on public.incident_closure_events (incident_id);
create index if not exists incident_artisan_evaluations_artisan_idx on public.incident_artisan_evaluations (artisan_profile_id);
create index if not exists incident_artisan_evaluations_intervention_idx on public.incident_artisan_evaluations (intervention_id);

create or replace view public.incident_artisan_rating_statistics as
select
  organization_id,
  artisan_profile_id,
  count(*)::integer as evaluations_count,
  round(avg(average_rating), 2) as average_rating
from public.incident_artisan_evaluations
where archived_at is null and artisan_profile_id is not null
group by organization_id, artisan_profile_id;

create or replace function public.can_access_incident_intervention(target_intervention_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or coalesce((
    select true from public.incident_interventions ii
    where ii.id = target_intervention_id and ii.archived_at is null and (
      public.can_manage_incidents(ii.organization_id)
      or public.can_access_incident(ii.incident_id)
      or ii.responsible_profile_id = auth.uid()
      or ii.tenant_profile_id = auth.uid()
      or ii.artisan_profile_id = auth.uid()
      or ii.internal_intervenant_profile_id = auth.uid()
    )
    limit 1
  ), false);
$$;

create or replace function public.can_write_incident_intervention(target_intervention_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or coalesce((
    select true from public.incident_interventions ii
    where ii.id = target_intervention_id and ii.archived_at is null and (
      public.can_manage_incidents(ii.organization_id)
      or ii.responsible_profile_id = auth.uid()
      or ii.artisan_profile_id = auth.uid()
      or ii.internal_intervenant_profile_id = auth.uid()
    )
    limit 1
  ), false);
$$;

create or replace function public.can_evaluate_incident_intervention(target_intervention_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or coalesce((
    select true from public.incident_interventions ii
    where ii.id = target_intervention_id and ii.status = 'terminee' and ii.archived_at is null and (
      ii.tenant_profile_id = auth.uid()
      or ii.responsible_profile_id = auth.uid()
      or public.can_manage_incidents(ii.organization_id)
    )
    limit 1
  ), false);
$$;

create or replace function public.validate_incident_intervention()
returns trigger language plpgsql security definer set search_path = public as $$
declare schedule_status text;
begin
  if new.schedule_request_id is not null then
    select status into schedule_status from public.incident_schedule_requests where id = new.schedule_request_id and archived_at is null;
    if schedule_status is distinct from 'valide' then
      raise exception 'L intervention necessite un rendez-vous confirme.';
    end if;
  end if;
  if new.status = 'terminee' and (new.actual_starts_at is null or new.actual_ends_at is null) then
    raise exception 'Une intervention terminee doit avoir une heure reelle de debut et de fin.';
  end if;
  if new.final_amount_cents is not null then
    new.amount_difference_cents := new.final_amount_cents - new.planned_amount_cents;
    if new.final_amount_cents <> new.planned_amount_cents and (new.difference_reason is null or length(trim(new.difference_reason)) = 0) then
      raise exception 'Un ecart de montant doit etre justifie.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.log_incident_intervention_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'CREATE';
  else
    action_name := case
      when new.status = 'en_cours' and old.status is distinct from 'en_cours' then 'START'
      when new.status = 'suspendue' and old.status is distinct from 'suspendue' then 'SUSPEND'
      when new.status = 'terminee' and old.status is distinct from 'terminee' then 'COMPLETE'
      when new.status = 'annulee' and old.status is distinct from 'annulee' then 'CANCEL'
      when new.status = 'a_reprogrammer' and old.status is distinct from 'a_reprogrammer' then 'REPROGRAM'
      else 'UPDATE'
    end;
  end if;
  insert into public.incident_intervention_events (organization_id, intervention_id, incident_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, new.incident_id, auth.uid(), action_name, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

create or replace function public.log_incident_intervention_material()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_intervention_events (organization_id, intervention_id, actor_profile_id, action, new_values)
  values (new.organization_id, new.intervention_id, auth.uid(), 'MATERIAL_ADD', to_jsonb(new));
  return new;
end;
$$;

create or replace function public.log_incident_report_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'GENERATION';
  else
    action_name := case
      when new.status = 'valide' and old.status is distinct from 'valide' then 'VALIDATION'
      when new.downloaded_at is not null and old.downloaded_at is distinct from new.downloaded_at then 'TELECHARGEMENT'
      when new.printed_at is not null and old.printed_at is distinct from new.printed_at then 'IMPRESSION'
      when new.email_prepared_at is not null and old.email_prepared_at is distinct from new.email_prepared_at then 'PREPARATION_ENVOI'
      when new.archived_at is not null and old.archived_at is null then 'ARCHIVE'
      else 'MODIFICATION'
    end;
  end if;
  insert into public.incident_intervention_report_events (organization_id, report_id, intervention_id, document_id, actor_profile_id, action, old_values, new_values)
  values (new.organization_id, new.id, new.intervention_id, new.document_id, auth.uid(), action_name, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

create or replace function public.validate_incident_closure()
returns trigger language plpgsql security definer set search_path = public as $$
declare intervention_status text; report_status text;
begin
  select status into intervention_status from public.incident_interventions where id = new.intervention_id and archived_at is null;
  select status into report_status from public.incident_intervention_reports where id = new.report_id and archived_at is null;
  if new.action in ('validation', 'cloture_reserve', 'cloture_normale') then
    if intervention_status is distinct from 'terminee' then raise exception 'La cloture necessite une intervention terminee.'; end if;
    if report_status not in ('genere', 'valide') then raise exception 'La cloture necessite un rapport genere et valide.'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.apply_incident_closure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_closure_events (organization_id, closure_review_id, incident_id, actor_profile_id, action, comment, new_values)
  values (new.organization_id, new.id, new.incident_id, auth.uid(), upper(new.action), new.comment, to_jsonb(new));
  if new.action in ('validation', 'cloture_reserve', 'cloture_normale') then
    update public.incidents set status = 'cloture' where id = new.incident_id;
  elsif new.action in ('correction', 'nouvelle_intervention') then
    update public.incidents set status = 'en_cours' where id = new.incident_id;
  end if;
  return new;
end;
$$;

create or replace function public.validate_incident_artisan_evaluation()
returns trigger language plpgsql security definer set search_path = public as $$
declare tenant_id uuid; responsible_id uuid; org_id uuid; artisan_id uuid;
begin
  select tenant_profile_id, responsible_profile_id, organization_id, artisan_profile_id
  into tenant_id, responsible_id, org_id, artisan_id
  from public.incident_interventions
  where id = new.intervention_id and status = 'terminee' and archived_at is null;
  if org_id is null then raise exception 'Evaluation impossible sans intervention terminee.'; end if;
  if new.organization_id is distinct from org_id then raise exception 'Evaluation hors organisation interdite.'; end if;
  if new.evaluator_role = 'locataire' and new.evaluator_profile_id is distinct from tenant_id then raise exception 'Seul le locataire concerne peut evaluer comme locataire.'; end if;
  if new.evaluator_role = 'responsable' and not (new.evaluator_profile_id is not distinct from responsible_id or public.can_manage_incidents(new.organization_id)) then raise exception 'Seul un responsable concerne peut evaluer.'; end if;
  new.artisan_profile_id := coalesce(new.artisan_profile_id, artisan_id);
  return new;
end;
$$;

create or replace function public.log_incident_artisan_evaluation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_intervention_events (organization_id, intervention_id, incident_id, actor_profile_id, action, new_values)
  values (new.organization_id, new.intervention_id, new.incident_id, new.evaluator_profile_id, 'EVALUATION', to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists incident_interventions_validate on public.incident_interventions;
create trigger incident_interventions_validate before insert or update on public.incident_interventions for each row execute function public.validate_incident_intervention();
drop trigger if exists incident_interventions_set_updated_at on public.incident_interventions;
create trigger incident_interventions_set_updated_at before update on public.incident_interventions for each row execute function public.set_updated_at();
drop trigger if exists incident_interventions_history on public.incident_interventions;
create trigger incident_interventions_history after insert or update on public.incident_interventions for each row execute function public.log_incident_intervention_change();
drop trigger if exists incident_intervention_materials_history on public.incident_intervention_materials;
create trigger incident_intervention_materials_history after insert on public.incident_intervention_materials for each row execute function public.log_incident_intervention_material();
drop trigger if exists incident_intervention_reports_set_updated_at on public.incident_intervention_reports;
create trigger incident_intervention_reports_set_updated_at before update on public.incident_intervention_reports for each row execute function public.set_updated_at();
drop trigger if exists incident_intervention_reports_history on public.incident_intervention_reports;
create trigger incident_intervention_reports_history after insert or update on public.incident_intervention_reports for each row execute function public.log_incident_report_change();
drop trigger if exists incident_closure_reviews_validate on public.incident_closure_reviews;
create trigger incident_closure_reviews_validate before insert or update on public.incident_closure_reviews for each row execute function public.validate_incident_closure();
drop trigger if exists incident_closure_reviews_apply on public.incident_closure_reviews;
create trigger incident_closure_reviews_apply after insert on public.incident_closure_reviews for each row execute function public.apply_incident_closure();
drop trigger if exists incident_artisan_evaluations_validate on public.incident_artisan_evaluations;
create trigger incident_artisan_evaluations_validate before insert or update on public.incident_artisan_evaluations for each row execute function public.validate_incident_artisan_evaluation();
drop trigger if exists incident_artisan_evaluations_history on public.incident_artisan_evaluations;
create trigger incident_artisan_evaluations_history after insert on public.incident_artisan_evaluations for each row execute function public.log_incident_artisan_evaluation();

alter table public.incident_interventions enable row level security;
alter table public.incident_intervention_materials enable row level security;
alter table public.incident_intervention_events enable row level security;
alter table public.incident_intervention_reports enable row level security;
alter table public.incident_intervention_report_events enable row level security;
alter table public.incident_closure_reviews enable row level security;
alter table public.incident_closure_events enable row level security;
alter table public.incident_artisan_evaluations enable row level security;

drop policy if exists incident_interventions_select_policy on public.incident_interventions;
create policy incident_interventions_select_policy on public.incident_interventions for select to authenticated using (public.can_access_incident_intervention(id));
drop policy if exists incident_interventions_insert_policy on public.incident_interventions;
create policy incident_interventions_insert_policy on public.incident_interventions for insert to authenticated with check (public.can_manage_incidents(organization_id));
drop policy if exists incident_interventions_update_policy on public.incident_interventions;
create policy incident_interventions_update_policy on public.incident_interventions for update to authenticated using (public.can_write_incident_intervention(id)) with check (public.can_write_incident_intervention(id));
drop policy if exists incident_interventions_delete_policy on public.incident_interventions;
create policy incident_interventions_delete_policy on public.incident_interventions for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_intervention_materials_select_policy on public.incident_intervention_materials;
create policy incident_intervention_materials_select_policy on public.incident_intervention_materials for select to authenticated using (public.can_access_incident_intervention(intervention_id));
drop policy if exists incident_intervention_materials_write_policy on public.incident_intervention_materials;
create policy incident_intervention_materials_write_policy on public.incident_intervention_materials for all to authenticated using (public.can_write_incident_intervention(intervention_id)) with check (public.can_write_incident_intervention(intervention_id));

drop policy if exists incident_intervention_events_select_policy on public.incident_intervention_events;
create policy incident_intervention_events_select_policy on public.incident_intervention_events for select to authenticated using (public.is_super_admin() or (intervention_id is not null and public.can_access_incident_intervention(intervention_id)) or (organization_id is not null and public.can_manage_incidents(organization_id)));
drop policy if exists incident_intervention_events_delete_policy on public.incident_intervention_events;
create policy incident_intervention_events_delete_policy on public.incident_intervention_events for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_intervention_reports_select_policy on public.incident_intervention_reports;
create policy incident_intervention_reports_select_policy on public.incident_intervention_reports for select to authenticated using (public.can_access_incident_intervention(intervention_id));
drop policy if exists incident_intervention_reports_write_policy on public.incident_intervention_reports;
create policy incident_intervention_reports_write_policy on public.incident_intervention_reports for all to authenticated using (public.can_write_incident_intervention(intervention_id)) with check (public.can_write_incident_intervention(intervention_id));

drop policy if exists incident_intervention_report_events_select_policy on public.incident_intervention_report_events;
create policy incident_intervention_report_events_select_policy on public.incident_intervention_report_events for select to authenticated using (public.is_super_admin() or (intervention_id is not null and public.can_access_incident_intervention(intervention_id)) or (organization_id is not null and public.can_manage_incidents(organization_id)));
drop policy if exists incident_intervention_report_events_delete_policy on public.incident_intervention_report_events;
create policy incident_intervention_report_events_delete_policy on public.incident_intervention_report_events for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_closure_reviews_select_policy on public.incident_closure_reviews;
create policy incident_closure_reviews_select_policy on public.incident_closure_reviews for select to authenticated using (public.can_access_incident_intervention(intervention_id));
drop policy if exists incident_closure_reviews_insert_policy on public.incident_closure_reviews;
create policy incident_closure_reviews_insert_policy on public.incident_closure_reviews for insert to authenticated with check (public.can_write_incident_intervention(intervention_id));
drop policy if exists incident_closure_reviews_delete_policy on public.incident_closure_reviews;
create policy incident_closure_reviews_delete_policy on public.incident_closure_reviews for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_closure_events_select_policy on public.incident_closure_events;
create policy incident_closure_events_select_policy on public.incident_closure_events for select to authenticated using (public.is_super_admin() or (incident_id is not null and public.can_access_incident(incident_id)) or (organization_id is not null and public.can_manage_incidents(organization_id)));
drop policy if exists incident_closure_events_delete_policy on public.incident_closure_events;
create policy incident_closure_events_delete_policy on public.incident_closure_events for delete to authenticated using (public.is_super_admin());

drop policy if exists incident_artisan_evaluations_select_policy on public.incident_artisan_evaluations;
create policy incident_artisan_evaluations_select_policy on public.incident_artisan_evaluations for select to authenticated using (public.can_access_incident_intervention(intervention_id));
drop policy if exists incident_artisan_evaluations_insert_policy on public.incident_artisan_evaluations;
create policy incident_artisan_evaluations_insert_policy on public.incident_artisan_evaluations for insert to authenticated with check (public.can_evaluate_incident_intervention(intervention_id));
drop policy if exists incident_artisan_evaluations_delete_policy on public.incident_artisan_evaluations;
create policy incident_artisan_evaluations_delete_policy on public.incident_artisan_evaluations for delete to authenticated using (public.is_super_admin());

grant select on public.incident_artisan_rating_statistics to authenticated, service_role;
grant select, insert, update, delete on table public.incident_interventions to authenticated, service_role;
grant select, insert, update, delete on table public.incident_intervention_materials to authenticated, service_role;
grant select, insert, delete on table public.incident_intervention_events to authenticated, service_role;
grant select, insert, update, delete on table public.incident_intervention_reports to authenticated, service_role;
grant select, insert, delete on table public.incident_intervention_report_events to authenticated, service_role;
grant select, insert, delete on table public.incident_closure_reviews to authenticated, service_role;
grant select, insert, delete on table public.incident_closure_events to authenticated, service_role;
grant select, insert, delete on table public.incident_artisan_evaluations to authenticated, service_role;
grant execute on function public.can_access_incident_intervention(uuid) to authenticated, service_role;
grant execute on function public.can_write_incident_intervention(uuid) to authenticated, service_role;
grant execute on function public.can_evaluate_incident_intervention(uuid) to authenticated, service_role;
