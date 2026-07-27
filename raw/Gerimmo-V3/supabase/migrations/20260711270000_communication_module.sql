-- GERIMMO V3 Sprint 7 - Communication, independante du Bot.

create table if not exists public.communication_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  priority text not null default 'normale',
  action_url text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint communication_notifications_type_valid check (notification_type in ('systeme','incident','document','loyer','devis','intervention')),
  constraint communication_notifications_priority_valid check (priority in ('basse','normale','haute','urgente')),
  constraint communication_notifications_title_not_empty check (length(trim(title)) > 0),
  constraint communication_notifications_body_not_empty check (length(trim(body)) > 0)
);

create table if not exists public.communication_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subject text not null,
  conversation_type text not null default 'directe',
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint communication_conversations_type_valid check (conversation_type in ('directe','groupe','support')),
  constraint communication_conversations_subject_not_empty check (length(trim(subject)) > 0)
);

create table if not exists public.communication_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.communication_conversations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  participant_role text not null default 'membre',
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint communication_participants_unique unique (conversation_id, profile_id),
  constraint communication_participants_role_valid check (participant_role in ('membre','administrateur'))
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.communication_conversations(id) on delete restrict,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  reply_to_message_id uuid references public.communication_messages(id) on delete set null,
  body text not null,
  status text not null default 'envoye',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint communication_messages_status_valid check (status in ('envoye','modifie','archive')),
  constraint communication_messages_body_not_empty check (length(trim(body)) > 0)
);

create table if not exists public.communication_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.communication_conversations(id) on delete restrict,
  message_id uuid not null references public.communication_messages(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_bucket text not null default 'communication-attachments',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint communication_attachments_size_valid check (file_size_bytes between 1 and 10485760),
  constraint communication_attachments_mime_valid check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain'))
);

create table if not exists public.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  application_enabled boolean not null default true,
  email_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  categories jsonb not null default '{"systeme":true,"incident":true,"document":true,"loyer":true,"devis":true,"intervention":true}'::jsonb,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint communication_preferences_unique unique (organization_id, profile_id)
);

create table if not exists public.communication_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  category text not null,
  action text not null,
  title text not null,
  description text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint communication_activity_category_valid check (category in ('systeme','notification','message','preference','incident','document','utilisateur','patrimoine'))
);

create index if not exists communication_notifications_recipient_created_idx on public.communication_notifications (recipient_profile_id, created_at desc) where archived_at is null;
create index if not exists communication_notifications_organization_type_idx on public.communication_notifications (organization_id, notification_type, created_at desc);
create index if not exists communication_conversations_organization_last_idx on public.communication_conversations (organization_id, last_message_at desc nulls last) where archived_at is null;
create index if not exists communication_participants_profile_idx on public.communication_participants (profile_id, conversation_id) where archived_at is null;
create index if not exists communication_messages_conversation_created_idx on public.communication_messages (conversation_id, created_at desc) where archived_at is null;
create index if not exists communication_attachments_message_idx on public.communication_attachments (message_id) where archived_at is null;
create index if not exists communication_activity_profile_created_idx on public.communication_activity_events (profile_id, created_at desc);
create index if not exists communication_activity_organization_created_idx on public.communication_activity_events (organization_id, created_at desc);

create or replace function public.can_access_communication_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.communication_participants cp
    where cp.conversation_id = target_conversation_id
      and cp.profile_id = auth.uid()
      and cp.archived_at is null
  );
$$;

create or replace function public.log_communication_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile uuid;
  event_category text;
  event_action text;
  event_title text;
  target_entity text;
begin
  if tg_table_name = 'communication_notifications' then
    target_profile := new.recipient_profile_id;
    event_category := 'notification';
    event_action := case when tg_op = 'INSERT' then 'NOTIFICATION_CREATED' when old.read_at is null and new.read_at is not null then 'NOTIFICATION_READ' else 'NOTIFICATION_UPDATED' end;
    event_title := new.title;
    target_entity := 'communication_notification';
  elsif tg_table_name = 'communication_messages' then
    target_profile := new.sender_profile_id;
    event_category := 'message';
    event_action := case when tg_op = 'INSERT' then 'MESSAGE_SENT' else 'MESSAGE_UPDATED' end;
    event_title := 'Message de conversation';
    target_entity := 'communication_message';
  else
    target_profile := new.profile_id;
    event_category := 'preference';
    event_action := case when tg_op = 'INSERT' then 'PREFERENCES_CREATED' else 'PREFERENCES_UPDATED' end;
    event_title := 'Preferences de communication';
    target_entity := 'communication_preference';
  end if;

  insert into public.communication_activity_events (
    organization_id, profile_id, actor_profile_id, category, action, title, entity_type, entity_id, metadata
  ) values (
    new.organization_id, target_profile, auth.uid(), event_category, event_action, event_title, target_entity, new.id,
    jsonb_build_object('source', tg_table_name)
  );
  return new;
end;
$$;

create or replace function public.touch_communication_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communication_conversations set last_message_at = new.created_at, updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists communication_notifications_updated_at on public.communication_notifications;
create trigger communication_notifications_updated_at before update on public.communication_notifications for each row execute function public.set_updated_at();
drop trigger if exists communication_conversations_updated_at on public.communication_conversations;
create trigger communication_conversations_updated_at before update on public.communication_conversations for each row execute function public.set_updated_at();
drop trigger if exists communication_messages_updated_at on public.communication_messages;
create trigger communication_messages_updated_at before update on public.communication_messages for each row execute function public.set_updated_at();
drop trigger if exists communication_preferences_updated_at on public.communication_preferences;
create trigger communication_preferences_updated_at before update on public.communication_preferences for each row execute function public.set_updated_at();

drop trigger if exists communication_notifications_activity on public.communication_notifications;
create trigger communication_notifications_activity after insert or update on public.communication_notifications for each row execute function public.log_communication_activity();
drop trigger if exists communication_messages_activity on public.communication_messages;
create trigger communication_messages_activity after insert or update on public.communication_messages for each row execute function public.log_communication_activity();
drop trigger if exists communication_preferences_activity on public.communication_preferences;
create trigger communication_preferences_activity after insert or update on public.communication_preferences for each row execute function public.log_communication_activity();
drop trigger if exists communication_messages_touch_conversation on public.communication_messages;
create trigger communication_messages_touch_conversation after insert on public.communication_messages for each row execute function public.touch_communication_conversation();

alter table public.communication_notifications enable row level security;
alter table public.communication_conversations enable row level security;
alter table public.communication_participants enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_attachments enable row level security;
alter table public.communication_preferences enable row level security;
alter table public.communication_activity_events enable row level security;

create policy communication_notifications_select on public.communication_notifications for select to authenticated using (public.is_super_admin() or recipient_profile_id = auth.uid());
create policy communication_notifications_insert on public.communication_notifications for insert to authenticated with check (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence','agent_immobilier']));
create policy communication_notifications_update on public.communication_notifications for update to authenticated using (public.is_super_admin() or recipient_profile_id = auth.uid()) with check (public.is_super_admin() or recipient_profile_id = auth.uid());
create policy communication_notifications_delete on public.communication_notifications for delete to authenticated using (public.is_super_admin());

create policy communication_conversations_select on public.communication_conversations for select to authenticated using (public.can_access_communication_conversation(id));
create policy communication_conversations_insert on public.communication_conversations for insert to authenticated with check (created_by = auth.uid() and public.is_active_organization_member(organization_id));
create policy communication_conversations_update on public.communication_conversations for update to authenticated using (public.can_access_communication_conversation(id)) with check (public.can_access_communication_conversation(id));
create policy communication_conversations_delete on public.communication_conversations for delete to authenticated using (public.is_super_admin());

create policy communication_participants_select on public.communication_participants for select to authenticated using (public.can_access_communication_conversation(conversation_id));
create policy communication_participants_insert on public.communication_participants for insert to authenticated with check (public.is_super_admin() or public.is_active_organization_member(organization_id));
create policy communication_participants_update on public.communication_participants for update to authenticated using (public.can_access_communication_conversation(conversation_id)) with check (public.can_access_communication_conversation(conversation_id));
create policy communication_participants_delete on public.communication_participants for delete to authenticated using (public.is_super_admin());

create policy communication_messages_select on public.communication_messages for select to authenticated using (public.can_access_communication_conversation(conversation_id));
create policy communication_messages_insert on public.communication_messages for insert to authenticated with check (sender_profile_id = auth.uid() and public.can_access_communication_conversation(conversation_id));
create policy communication_messages_update on public.communication_messages for update to authenticated using (public.is_super_admin() or sender_profile_id = auth.uid()) with check (public.is_super_admin() or sender_profile_id = auth.uid());
create policy communication_messages_delete on public.communication_messages for delete to authenticated using (public.is_super_admin());

create policy communication_attachments_select on public.communication_attachments for select to authenticated using (public.can_access_communication_conversation(conversation_id));
create policy communication_attachments_insert on public.communication_attachments for insert to authenticated with check (uploaded_by = auth.uid() and public.can_access_communication_conversation(conversation_id));
create policy communication_attachments_update on public.communication_attachments for update to authenticated using (public.is_super_admin() or uploaded_by = auth.uid()) with check (public.is_super_admin() or uploaded_by = auth.uid());
create policy communication_attachments_delete on public.communication_attachments for delete to authenticated using (public.is_super_admin());

create policy communication_preferences_select on public.communication_preferences for select to authenticated using (public.is_super_admin() or profile_id = auth.uid());
create policy communication_preferences_insert on public.communication_preferences for insert to authenticated with check (profile_id = auth.uid() and public.is_active_organization_member(organization_id));
create policy communication_preferences_update on public.communication_preferences for update to authenticated using (public.is_super_admin() or profile_id = auth.uid()) with check (public.is_super_admin() or profile_id = auth.uid());
create policy communication_preferences_delete on public.communication_preferences for delete to authenticated using (public.is_super_admin());

create policy communication_activity_select on public.communication_activity_events for select to authenticated using (public.is_super_admin() or profile_id = auth.uid() or public.can_manage_users(organization_id));
create policy communication_activity_insert on public.communication_activity_events for insert to authenticated with check (public.is_super_admin() or actor_profile_id = auth.uid());
create policy communication_activity_delete on public.communication_activity_events for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on public.communication_notifications to authenticated, service_role;
grant select, insert, update, delete on public.communication_conversations to authenticated, service_role;
grant select, insert, update, delete on public.communication_participants to authenticated, service_role;
grant select, insert, update, delete on public.communication_messages to authenticated, service_role;
grant select, insert, update, delete on public.communication_attachments to authenticated, service_role;
grant select, insert, update, delete on public.communication_preferences to authenticated, service_role;
grant select, insert, delete on public.communication_activity_events to authenticated, service_role;
grant execute on function public.can_access_communication_conversation(uuid) to authenticated, service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('communication-attachments','communication-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists communication_storage_select on storage.objects;
create policy communication_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'communication-attachments'
  and public.can_access_communication_conversation(((storage.foldername(name))[2])::uuid)
);
drop policy if exists communication_storage_insert on storage.objects;
create policy communication_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'communication-attachments'
  and (storage.foldername(name))[3] = auth.uid()::text
  and public.can_access_communication_conversation(((storage.foldername(name))[2])::uuid)
);
