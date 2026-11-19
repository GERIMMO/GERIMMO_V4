-- Le facteur vérifié est lu auprès d'Auth, jamais dans les métadonnées
-- modifiables du compte. Le JWT signé porte le niveau de la session.
create function gerimmo_session_interne.second_facteur_valide() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select auth.jwt()->>'aal')='aal2', false)
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id=(select auth.uid()) and f.status='verified'
    )
$$;
revoke all on function gerimmo_session_interne.second_facteur_valide() from public,anon;
grant execute on function gerimmo_session_interne.second_facteur_valide() to authenticated;

-- Même contrôle pour toutes les tables et RPC de la Data API, avant que
-- les fonctions privilégiées puissent lire ou modifier des données.
create or replace function gerimmo_session_interne.verifier_session_api() returns void
language plpgsql stable security invoker set search_path='' as $$
begin
  if current_user='authenticated' then
    if not gerimmo_session_interne.session_valide() then
      raise sqlstate 'PT401' using message='La session a pris fin. Reconnectez-vous.';
    end if;
    if not gerimmo_session_interne.second_facteur_valide() then
      raise sqlstate 'PT428' using message='Vérifiez le second facteur de votre compte.';
    end if;
  end if;
end $$;

-- Storage ne passe pas par PostgREST. Cette garde s'ajoute aux politiques
-- métier et d'expiration existantes ; elle ne confère aucun droit nouveau.
create policy second_facteur_pour_stockage on storage.objects
  as restrictive for all to authenticated
  using ((select gerimmo_session_interne.second_facteur_valide()))
  with check ((select gerimmo_session_interne.second_facteur_valide()));

notify pgrst,'reload schema';
