-- Le webhook peut précéder le rattachement de la souscription ou être rejoué.
-- La file durable reprend l'événement si le rattachement n'est pas encore connu.
create or replace function public.abonnement_facture_payee(p_customer text, p_subscription text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org uuid;
  v_sub text;
  v_deja boolean;
begin
  select organization_id, stripe_subscription_id, premiere_facture_payee
    into v_org, v_sub, v_deja from public.abonnements
    where stripe_customer_id = btrim(p_customer) for update;
  if not found or nullif(btrim(p_subscription), '') is null then return null; end if;
  if v_sub is null then
    raise exception 'Rattachement de la souscription en attente' using errcode = '40001';
  end if;
  if v_sub <> btrim(p_subscription) then return null; end if;
  if not v_deja then
    update public.abonnements set premiere_facture_payee = true, updated_at = now()
      where organization_id = v_org;
    insert into public.audit_log (organization_id, action, details)
      values (v_org,'abonnement_premiere_facture_payee',jsonb_build_object('souscription',v_sub));
  end if;
  return v_org;
end;
$$;
