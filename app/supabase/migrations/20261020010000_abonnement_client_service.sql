-- Association au dossier de paiement vérifiée côté serveur.
create or replace function public.abonnement_client_pose(p_org uuid, p_customer text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Réservé au serveur de paiement';
  end if;
  if nullif(btrim(coalesce(p_customer, '')), '') is null then
    raise exception 'Identifiant client Stripe vide';
  end if;

  insert into public.abonnements (organization_id, stripe_customer_id)
  values (p_org, btrim(p_customer))
  on conflict (organization_id) do update
    -- On ne REMPLACE jamais un client existant : deux clients pour une même
    -- organisation, c'est deux factures et un moyen de paiement orphelin.
    set stripe_customer_id = coalesce(public.abonnements.stripe_customer_id, excluded.stripe_customer_id),
        updated_at = now();
end;
$$;
revoke execute on function public.abonnement_client_pose(uuid, text) from public, anon, authenticated;
grant execute on function public.abonnement_client_pose(uuid, text) to service_role;

select public.fermer_fonctions_a_anon();
