-- Compatibilité du retour PKCE du modèle Supabase « Change email address » conservé.
-- Auth garde l'échange, sa durée de validité et le contrôle du navigateur demandeur.
create or replace function public.autoriser_retour_adresse_confirmee(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_code is null or p_code !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    return null;
  end if;
  return (
    select f.user_id
    from auth.flow_state f
    join auth.users u on u.id = f.user_id
    where f.auth_code = p_code
      and f.authentication_method = 'email_change'
      and u.email_confirmed_at < f.created_at
      and u.deleted_at is null
      and not coalesce(u.is_anonymous, false)
      and f.auth_code_issued_at is not null
      and f.auth_code_issued_at <= statement_timestamp()
    limit 1
  );
end;
$$;
revoke all on function public.autoriser_retour_adresse_confirmee(text) from public, anon, authenticated;
grant execute on function public.autoriser_retour_adresse_confirmee(text) to service_role;
select public.fermer_fonctions_a_anon();
