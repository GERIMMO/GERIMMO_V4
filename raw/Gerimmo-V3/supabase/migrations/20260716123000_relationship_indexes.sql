-- GERIMMO V3 - Index des relations sollicitees par les parcours principaux.

begin;

create index if not exists bot_attachments_conversation_idx on public.bot_attachments (conversation_id);
create index if not exists bot_attachments_message_idx on public.bot_attachments (message_id);
create index if not exists bot_attachments_document_idx on public.bot_attachments (document_id);
create index if not exists bot_messages_document_idx on public.bot_messages (document_id);
create index if not exists bot_messages_webhook_update_idx on public.bot_messages (webhook_update_id);

create index if not exists communication_attachments_conversation_idx
  on public.communication_attachments (conversation_id);
create index if not exists communication_messages_reply_to_idx
  on public.communication_messages (reply_to_message_id);
create index if not exists communication_messages_sender_idx
  on public.communication_messages (sender_profile_id);

create index if not exists document_events_version_idx on public.document_events (document_version_id);
create index if not exists documents_patrimoine_idx on public.documents (patrimoine_id);
create index if not exists documents_residence_idx on public.documents (residence_id);
create index if not exists documents_owner_idx on public.documents (owner_profile_id);
create index if not exists documents_tenant_idx on public.documents (tenant_profile_id);
create index if not exists documents_template_idx on public.documents (template_id);

create index if not exists incident_interventions_accepted_quote_idx
  on public.incident_interventions (accepted_quote_id);
create index if not exists incident_interventions_quote_recipient_idx
  on public.incident_interventions (quote_recipient_id);
create index if not exists incident_interventions_schedule_request_idx
  on public.incident_interventions (schedule_request_id);
create index if not exists incident_interventions_selected_slot_idx
  on public.incident_interventions (selected_slot_id);
create index if not exists incident_interventions_responsible_idx
  on public.incident_interventions (responsible_profile_id);
create index if not exists incident_interventions_internal_intervenant_idx
  on public.incident_interventions (internal_intervenant_profile_id);

create index if not exists incident_schedule_requests_comparison_idx
  on public.incident_schedule_requests (comparison_id);
create index if not exists incident_schedule_requests_quote_recipient_idx
  on public.incident_schedule_requests (quote_recipient_id);
create index if not exists incident_schedule_requests_selected_slot_idx
  on public.incident_schedule_requests (selected_slot_id);

commit;
