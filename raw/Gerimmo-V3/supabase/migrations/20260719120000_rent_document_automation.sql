-- Fonctions d'automatisation cron (appelées par n8n via RPC, service role) pour le bloc 4.
-- Modèle identique à evaluate_subscription_lifecycle : logique métier côté GERIMMO,
-- n8n ne fait que déclencher et envoyer les e-mails (file document_email_outbox).

-- 1) Génère les loyers du mois pour toutes les locations actives (cross-org). Idempotent.
create or replace function public.generate_rent_periods_for_month(
  target_month date default date_trunc('month', current_date)::date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  month_start date := date_trunc('month', target_month)::date;
begin
  with ins as (
    insert into public.rent_periods (
      organization_id, bien_id, tenant_profile_id, tenant_name, period_month, due_date, amount_cents
    )
    select b.organization_id, b.id, bo.profile_id, bo.full_name, month_start,
           (month_start + interval '4 days')::date, coalesce(b.monthly_rent_cents, 0)
    from public.bien_occupants bo
    join public.biens b on b.id = bo.bien_id
    where bo.occupant_type = 'locataire'
      and bo.ended_at is null
      and bo.archived_at is null
    on conflict (bien_id, tenant_profile_id, period_month) do nothing
    returning 1
  )
  select count(*) into inserted_count from ins;
  return inserted_count;
end;
$$;

-- 2) Met en file les rappels des documents officiels arrivant à échéance (cross-org).
--    Anti-doublon : ne re-rappelle pas un document rappelé il y a moins de 30 jours.
create or replace function public.queue_document_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
  rec record;
  recipient_email text;
begin
  for rec in
    select d.id, d.organization_id, d.title, d.expires_at,
           coalesce(d.tenant_profile_id, d.owner_profile_id) as recipient_profile_id
    from public.documents d
    where d.official_document = true
      and d.expires_at is not null
      and d.archived_at is null
      and d.status in ('actif', 'envoye')
      and d.expires_at <= current_date + (d.expiration_alert_days || ' days')::interval
      and (
        d.metadata->>'expiry_reminded_at' is null
        or (d.metadata->>'expiry_reminded_at')::timestamptz < now() - interval '30 days'
      )
  loop
    recipient_email := null;
    if rec.recipient_profile_id is not null then
      select p.email into recipient_email from public.profiles p where p.id = rec.recipient_profile_id;
    end if;

    if recipient_email is not null then
      insert into public.document_email_outbox (organization_id, document_id, recipient_email, subject, body, status)
      values (
        rec.organization_id, rec.id, recipient_email,
        'Document a renouveler - ' || rec.title,
        'Le document ' || rec.title || ' arrive a echeance le ' || to_char(rec.expires_at, 'DD/MM/YYYY')
          || '. Merci de proceder a son renouvellement. Il est disponible dans votre espace GERIMMO.',
        'pret'
      );
      queued_count := queued_count + 1;
    end if;

    update public.documents
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiry_reminded_at', now()::text)
    where id = rec.id;
  end loop;
  return queued_count;
end;
$$;

-- Réservé au déclencheur d'automatisation (n8n via service role), jamais aux utilisateurs.
revoke execute on function public.generate_rent_periods_for_month(date) from public;
revoke execute on function public.queue_document_expiry_reminders() from public;
grant execute on function public.generate_rent_periods_for_month(date) to service_role;
grant execute on function public.queue_document_expiry_reminders() to service_role;
