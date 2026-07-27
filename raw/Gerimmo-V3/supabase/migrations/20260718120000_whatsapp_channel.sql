-- Support du canal WhatsApp (migration bot Telegram -> WhatsApp).
-- Additive et rétro-compatible : le canal Telegram continue de fonctionner.

-- 1) bot_webhook_updates : identifiants externes (texte) pour les canaux non-Telegram (WhatsApp = wamid…).
alter table public.bot_webhook_updates
  alter column telegram_update_id drop not null;

alter table public.bot_webhook_updates
  add column if not exists external_update_id text,
  add column if not exists external_user_id text;

create unique index if not exists bot_webhook_updates_external_update_idx
  on public.bot_webhook_updates (channel, external_update_id)
  where external_update_id is not null;

-- 2) Comptes WhatsApp : liaison par numéro (wa_id = E.164 sans +).
create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  invitation_id uuid,
  wa_id text not null,
  phone_e164 text,
  display_name text,
  status text not null default 'connected' check (status in ('connected', 'revoked', 'suspended', 'archived')),
  linked_at timestamptz not null default now(),
  last_activity_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid
);

create unique index if not exists whatsapp_accounts_wa_id_connected_idx
  on public.whatsapp_accounts (wa_id) where status = 'connected';

create index if not exists whatsapp_accounts_org_profile_idx
  on public.whatsapp_accounts (organization_id, profile_id);

alter table public.whatsapp_accounts enable row level security;

-- RLS miroir de telegram_accounts (l'écriture par le bot passe par le service role et contourne la RLS).
create policy whatsapp_accounts_select_policy on public.whatsapp_accounts
  for select using (can_access_bot_data(organization_id, profile_id));

create policy whatsapp_accounts_update_policy on public.whatsapp_accounts
  for update using (can_manage_users(organization_id)) with check (can_manage_users(organization_id));

create policy whatsapp_accounts_delete_policy on public.whatsapp_accounts
  for delete using (is_super_admin());

-- 3) Invitations de liaison : réutilisables multi-canal.
alter table public.telegram_link_invitations
  add column if not exists channel text not null default 'telegram';

-- 4) bot_conversations : autoriser un rattachement à un compte WhatsApp.
alter table public.bot_conversations
  alter column telegram_account_id drop not null;

alter table public.bot_conversations
  add column if not exists whatsapp_account_id uuid references public.whatsapp_accounts (id) on delete cascade;
