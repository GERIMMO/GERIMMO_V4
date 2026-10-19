-- Retour de l'association au dossier de paiement. Remettre le code précédent avec ce retour.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction.';
  end if;
end $retour_arriere$;
begin;
set local lock_timeout = '10s';
create or replace function public.abonnement_client_pose(p_org uuid, p_customer text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Réservé au responsable de l''organisation : souscrire engage l''agence';
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
revoke execute on function public.abonnement_client_pose(uuid, text) from public, anon;
grant execute on function public.abonnement_client_pose(uuid, text) to authenticated, service_role;
select public.fermer_fonctions_a_anon();
delete from supabase_migrations.schema_migrations where version = '20261020010000';
commit;
