-- GERIMMO V3 Sprint 6 - Bot Telegram.
-- Telegram est le seul canal actif. La logique metier reste independante du transport.

create table if not exists public.telegram_link_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint telegram_link_invitations_status_valid check (status in ('pending', 'confirmed', 'expired', 'revoked', 'archived')),
  constraint telegram_link_invitations_expiry_valid check (expires_at > created_at)
);

create table if not exists public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  invitation_id uuid references public.telegram_link_invitations(id) on delete set null,
  telegram_user_id bigint not null,
  telegram_chat_id bigint not null,
  telegram_username text,
  telegram_display_name text,
  status text not null default 'connected',
  linked_at timestamptz not null default now(),
  last_activity_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint telegram_accounts_status_valid check (status in ('connected', 'revoked', 'suspended', 'archived'))
);

create unique index if not exists telegram_accounts_profile_org_active_idx
  on public.telegram_accounts (profile_id, organization_id) where archived_at is null and status = 'connected';
create unique index if not exists telegram_accounts_user_active_idx
  on public.telegram_accounts (telegram_user_id) where archived_at is null and status = 'connected';

create table if not exists public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'telegram',
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  telegram_account_id uuid not null references public.telegram_accounts(id) on delete restrict,
  bien_id uuid references public.biens(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  role_key text,
  intent text,
  state text not null default 'idle',
  status text not null default 'active',
  question_count smallint not null default 0,
  context jsonb not null default '{}'::jsonb,
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bot_conversations_channel_telegram check (channel = 'telegram'),
  constraint bot_conversations_status_valid check (status in ('active', 'waiting_user', 'waiting_system', 'closed', 'error', 'archived')),
  constraint bot_conversations_question_limit check (question_count between 0 and 3),
  constraint bot_conversations_context_object check (jsonb_typeof(context) = 'object')
);

create table if not exists public.bot_conversation_state_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.bot_conversations(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  previous_state text,
  next_state text not null,
  reason text,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bot_state_events_context_object check (jsonb_typeof(context_snapshot) = 'object')
);

create table if not exists public.bot_webhook_updates (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'telegram',
  telegram_update_id bigint not null unique,
  organization_id uuid references public.organizations(id) on delete set null,
  telegram_user_id bigint,
  payload_hash text not null,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  constraint bot_webhook_updates_channel_telegram check (channel = 'telegram'),
  constraint bot_webhook_updates_status_valid check (status in ('received', 'processing', 'processed', 'duplicate', 'error'))
);

create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'telegram',
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.bot_conversations(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  webhook_update_id uuid references public.bot_webhook_updates(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  direction text not null,
  message_type text not null default 'text',
  telegram_message_id bigint,
  body text,
  status text not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bot_messages_channel_telegram check (channel = 'telegram'),
  constraint bot_messages_direction_valid check (direction in ('incoming', 'outgoing')),
  constraint bot_messages_type_valid check (message_type in ('text', 'photo', 'document', 'callback', 'system')),
  constraint bot_messages_status_valid check (status in ('received', 'queued', 'sent', 'processed', 'failed', 'archived')),
  constraint bot_messages_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.bot_attachments (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'telegram',
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.bot_conversations(id) on delete restrict,
  message_id uuid not null references public.bot_messages(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  telegram_file_id text not null,
  telegram_file_unique_id text,
  caption text,
  storage_bucket text not null default 'incident-attachments',
  storage_path text,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  checksum text,
  status text not null default 'pending',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bot_attachments_channel_telegram check (channel = 'telegram'),
  constraint bot_attachments_status_valid check (status in ('pending', 'stored', 'invalid', 'duplicate', 'failed', 'archived')),
  constraint bot_attachments_size_valid check (file_size_bytes is null or file_size_bytes between 0 and 10485760)
);

create table if not exists public.bot_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid references public.bot_conversations(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  action_type text not null,
  target_table text,
  target_id uuid,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  attempts smallint not null default 0,
  next_retry_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bot_actions_status_valid check (status in ('pending', 'processing', 'completed', 'failed', 'retry_pending', 'archived')),
  constraint bot_actions_attempts_valid check (attempts between 0 and 10),
  constraint bot_actions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint bot_actions_result_object check (result is null or jsonb_typeof(result) = 'object')
);

create table if not exists public.bot_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  conversation_id uuid references public.bot_conversations(id) on delete set null,
  message_id uuid references public.bot_messages(id) on delete set null,
  action_id uuid references public.bot_actions(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  error_code text not null,
  safe_message text not null,
  internal_details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  retry_count smallint not null default 0,
  last_retry_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bot_errors_status_valid check (status in ('open', 'retry_pending', 'resolved', 'ignored', 'archived')),
  constraint bot_errors_retry_count_valid check (retry_count between 0 and 10),
  constraint bot_errors_details_object check (jsonb_typeof(internal_details) = 'object')
);

create table if not exists public.bot_document_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid not null references public.bot_conversations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  email_outbox_id uuid references public.document_email_outbox(id) on delete set null,
  status text not null default 'awaiting_confirmation',
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint bot_document_requests_status_valid check (status in ('awaiting_confirmation', 'prepared', 'sent', 'refused', 'failed', 'archived'))
);

create index if not exists telegram_link_invitations_profile_idx on public.telegram_link_invitations (profile_id, status);
create index if not exists telegram_link_invitations_org_idx on public.telegram_link_invitations (organization_id, created_at desc);
create index if not exists telegram_link_invitations_expires_idx on public.telegram_link_invitations (expires_at) where status = 'pending';
create index if not exists telegram_accounts_org_idx on public.telegram_accounts (organization_id, last_activity_at desc);
create index if not exists bot_conversations_account_idx on public.bot_conversations (telegram_account_id, status);
create index if not exists bot_conversations_profile_idx on public.bot_conversations (profile_id, last_activity_at desc);
create index if not exists bot_conversations_org_idx on public.bot_conversations (organization_id, last_activity_at desc);
create index if not exists bot_conversations_incident_idx on public.bot_conversations (incident_id);
create index if not exists bot_state_events_conversation_idx on public.bot_conversation_state_events (conversation_id, created_at desc);
create index if not exists bot_messages_conversation_idx on public.bot_messages (conversation_id, created_at desc);
create index if not exists bot_messages_incident_idx on public.bot_messages (incident_id, created_at desc);
create index if not exists bot_messages_telegram_message_idx on public.bot_messages (telegram_message_id);
create index if not exists bot_attachments_incident_idx on public.bot_attachments (incident_id, created_at desc);
create index if not exists bot_attachments_file_unique_idx on public.bot_attachments (telegram_file_unique_id) where telegram_file_unique_id is not null;
create index if not exists bot_actions_status_idx on public.bot_actions (status, next_retry_at);
create index if not exists bot_actions_conversation_idx on public.bot_actions (conversation_id, created_at desc);
create index if not exists bot_errors_status_idx on public.bot_errors (status, created_at desc);
create index if not exists bot_errors_conversation_idx on public.bot_errors (conversation_id, created_at desc);
create index if not exists bot_document_requests_profile_idx on public.bot_document_requests (profile_id, created_at desc);

create or replace function public.can_access_bot_data(target_organization_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or target_profile_id = auth.uid()
    or public.has_organization_role(target_organization_id, array['administrateur_agence']);
$$;

create or replace function public.log_bot_conversation_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.bot_conversation_state_events (
      organization_id, conversation_id, profile_id, previous_state, next_state, reason, context_snapshot
    ) values (
      new.organization_id, new.id, new.profile_id, null, new.state, 'CONVERSATION_CREATED', new.context
    );
  elsif new.state is distinct from old.state or new.status is distinct from old.status then
    insert into public.bot_conversation_state_events (
      organization_id, conversation_id, profile_id, previous_state, next_state, reason, context_snapshot
    ) values (
      new.organization_id, new.id, new.profile_id, old.state, new.state, 'STATE_CHANGED', new.context
    );
  end if;
  return new;
end;
$$;

create or replace function public.log_bot_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  old_data jsonb;
  org_id uuid;
  actor_id uuid;
  record_uuid uuid;
begin
  row_data := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_data := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  org_id := coalesce((row_data ->> 'organization_id')::uuid, (old_data ->> 'organization_id')::uuid);
  actor_id := coalesce(auth.uid(), (row_data ->> 'profile_id')::uuid, (old_data ->> 'profile_id')::uuid);
  record_uuid := coalesce((row_data ->> 'id')::uuid, (old_data ->> 'id')::uuid);

  insert into public.audit_logs (organization_id, actor_profile_id, action, table_name, record_id, old_values, new_values)
  values (org_id, actor_id, 'BOT_' || tg_op, tg_table_name, record_uuid, old_data, row_data);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists telegram_link_invitations_updated_at on public.telegram_link_invitations;
create trigger telegram_link_invitations_updated_at before update on public.telegram_link_invitations for each row execute function public.set_updated_at();
drop trigger if exists telegram_accounts_updated_at on public.telegram_accounts;
create trigger telegram_accounts_updated_at before update on public.telegram_accounts for each row execute function public.set_updated_at();
drop trigger if exists bot_conversations_updated_at on public.bot_conversations;
create trigger bot_conversations_updated_at before update on public.bot_conversations for each row execute function public.set_updated_at();
drop trigger if exists bot_attachments_updated_at on public.bot_attachments;
create trigger bot_attachments_updated_at before update on public.bot_attachments for each row execute function public.set_updated_at();
drop trigger if exists bot_actions_updated_at on public.bot_actions;
create trigger bot_actions_updated_at before update on public.bot_actions for each row execute function public.set_updated_at();
drop trigger if exists bot_document_requests_updated_at on public.bot_document_requests;
create trigger bot_document_requests_updated_at before update on public.bot_document_requests for each row execute function public.set_updated_at();
drop trigger if exists bot_conversations_state_history on public.bot_conversations;
create trigger bot_conversations_state_history after insert or update on public.bot_conversations for each row execute function public.log_bot_conversation_state();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'telegram_link_invitations', 'telegram_accounts', 'bot_conversations', 'bot_messages',
    'bot_attachments', 'bot_actions', 'bot_errors', 'bot_document_requests'
  ] loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.log_bot_audit()', table_name, table_name);
  end loop;
end;
$$;

alter table public.telegram_link_invitations enable row level security;
alter table public.telegram_accounts enable row level security;
alter table public.bot_conversations enable row level security;
alter table public.bot_conversation_state_events enable row level security;
alter table public.bot_webhook_updates enable row level security;
alter table public.bot_messages enable row level security;
alter table public.bot_attachments enable row level security;
alter table public.bot_actions enable row level security;
alter table public.bot_errors enable row level security;
alter table public.bot_document_requests enable row level security;

drop policy if exists telegram_link_invitations_select_policy on public.telegram_link_invitations;
create policy telegram_link_invitations_select_policy on public.telegram_link_invitations for select to authenticated using (public.can_access_bot_data(organization_id, profile_id));
drop policy if exists telegram_link_invitations_insert_policy on public.telegram_link_invitations;
create policy telegram_link_invitations_insert_policy on public.telegram_link_invitations for insert to authenticated with check (public.can_manage_users(organization_id));
drop policy if exists telegram_link_invitations_update_policy on public.telegram_link_invitations;
create policy telegram_link_invitations_update_policy on public.telegram_link_invitations for update to authenticated using (public.can_manage_users(organization_id)) with check (public.can_manage_users(organization_id));
drop policy if exists telegram_link_invitations_delete_policy on public.telegram_link_invitations;
create policy telegram_link_invitations_delete_policy on public.telegram_link_invitations for delete to authenticated using (public.is_super_admin());

drop policy if exists telegram_accounts_select_policy on public.telegram_accounts;
create policy telegram_accounts_select_policy on public.telegram_accounts for select to authenticated using (public.can_access_bot_data(organization_id, profile_id));
drop policy if exists telegram_accounts_update_policy on public.telegram_accounts;
create policy telegram_accounts_update_policy on public.telegram_accounts for update to authenticated using (public.can_manage_users(organization_id)) with check (public.can_manage_users(organization_id));
drop policy if exists telegram_accounts_delete_policy on public.telegram_accounts;
create policy telegram_accounts_delete_policy on public.telegram_accounts for delete to authenticated using (public.is_super_admin());

drop policy if exists bot_conversations_select_policy on public.bot_conversations;
create policy bot_conversations_select_policy on public.bot_conversations for select to authenticated using (public.can_access_bot_data(organization_id, profile_id));
drop policy if exists bot_conversations_delete_policy on public.bot_conversations;
create policy bot_conversations_delete_policy on public.bot_conversations for delete to authenticated using (public.is_super_admin());

drop policy if exists bot_state_events_select_policy on public.bot_conversation_state_events;
create policy bot_state_events_select_policy on public.bot_conversation_state_events for select to authenticated using (public.can_access_bot_data(organization_id, profile_id));
drop policy if exists bot_messages_select_policy on public.bot_messages;
create policy bot_messages_select_policy on public.bot_messages for select to authenticated using (profile_id is not null and public.can_access_bot_data(organization_id, profile_id));
drop policy if exists bot_messages_delete_policy on public.bot_messages;
create policy bot_messages_delete_policy on public.bot_messages for delete to authenticated using (public.is_super_admin());
drop policy if exists bot_attachments_select_policy on public.bot_attachments;
create policy bot_attachments_select_policy on public.bot_attachments for select to authenticated using (profile_id is not null and public.can_access_bot_data(organization_id, profile_id));
drop policy if exists bot_attachments_delete_policy on public.bot_attachments;
create policy bot_attachments_delete_policy on public.bot_attachments for delete to authenticated using (public.is_super_admin());
drop policy if exists bot_actions_select_policy on public.bot_actions;
create policy bot_actions_select_policy on public.bot_actions for select to authenticated using (profile_id is not null and public.can_access_bot_data(organization_id, profile_id));
drop policy if exists bot_actions_update_policy on public.bot_actions;
create policy bot_actions_update_policy on public.bot_actions for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists bot_actions_delete_policy on public.bot_actions;
create policy bot_actions_delete_policy on public.bot_actions for delete to authenticated using (public.is_super_admin());
drop policy if exists bot_errors_select_policy on public.bot_errors;
create policy bot_errors_select_policy on public.bot_errors for select to authenticated using (public.is_super_admin() or (organization_id is not null and public.has_organization_role(organization_id, array['administrateur_agence'])));
drop policy if exists bot_errors_update_policy on public.bot_errors;
create policy bot_errors_update_policy on public.bot_errors for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists bot_errors_delete_policy on public.bot_errors;
create policy bot_errors_delete_policy on public.bot_errors for delete to authenticated using (public.is_super_admin());
drop policy if exists bot_document_requests_select_policy on public.bot_document_requests;
create policy bot_document_requests_select_policy on public.bot_document_requests for select to authenticated using (public.can_access_bot_data(organization_id, profile_id));
drop policy if exists bot_document_requests_delete_policy on public.bot_document_requests;
create policy bot_document_requests_delete_policy on public.bot_document_requests for delete to authenticated using (public.is_super_admin());
drop policy if exists bot_webhook_updates_select_policy on public.bot_webhook_updates;
create policy bot_webhook_updates_select_policy on public.bot_webhook_updates for select to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.telegram_link_invitations to authenticated, service_role;
grant select, update, delete on table public.telegram_accounts to authenticated;
grant select, insert, update, delete on table public.telegram_accounts to service_role;
grant select, delete on table public.bot_conversations to authenticated;
grant select, insert, update, delete on table public.bot_conversations to service_role;
grant select on table public.bot_conversation_state_events to authenticated;
grant select, insert, delete on table public.bot_conversation_state_events to service_role;
grant select on table public.bot_webhook_updates to authenticated;
grant select, insert, update, delete on table public.bot_webhook_updates to service_role;
grant select, delete on table public.bot_messages to authenticated;
grant select, insert, update, delete on table public.bot_messages to service_role;
grant select, delete on table public.bot_attachments to authenticated;
grant select, insert, update, delete on table public.bot_attachments to service_role;
grant select, update, delete on table public.bot_actions to authenticated;
grant select, insert, update, delete on table public.bot_actions to service_role;
grant select, update, delete on table public.bot_errors to authenticated;
grant select, insert, update, delete on table public.bot_errors to service_role;
grant select, delete on table public.bot_document_requests to authenticated;
grant select, insert, update, delete on table public.bot_document_requests to service_role;
grant execute on function public.can_access_bot_data(uuid, uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incident-attachments', 'incident-attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
