-- Ouverture effective du canal WhatsApp sur les tables du bot.
-- La migration 20260718120000 a ajouté les colonnes, mais les contraintes
-- `channel = 'telegram'` héritées de 20260711250000 bloquaient toute insertion
-- WhatsApp. Additive et rétro-compatible : Telegram continue de fonctionner.

-- 1) Autoriser le canal whatsapp partout où le bot écrit.
alter table public.bot_conversations
  drop constraint if exists bot_conversations_channel_telegram;
alter table public.bot_conversations
  add constraint bot_conversations_channel_valid check (channel in ('telegram', 'whatsapp'));

alter table public.bot_webhook_updates
  drop constraint if exists bot_webhook_updates_channel_telegram;
alter table public.bot_webhook_updates
  add constraint bot_webhook_updates_channel_valid check (channel in ('telegram', 'whatsapp'));

alter table public.bot_messages
  drop constraint if exists bot_messages_channel_telegram;
alter table public.bot_messages
  add constraint bot_messages_channel_valid check (channel in ('telegram', 'whatsapp'));

alter table public.bot_attachments
  drop constraint if exists bot_attachments_channel_telegram;
alter table public.bot_attachments
  add constraint bot_attachments_channel_valid check (channel in ('telegram', 'whatsapp'));

-- 2) Identifiant de message externe texte (WhatsApp wamid…) ; telegram_message_id (bigint)
--    reste utilisé pour Telegram.
alter table public.bot_messages
  add column if not exists external_message_id text;
