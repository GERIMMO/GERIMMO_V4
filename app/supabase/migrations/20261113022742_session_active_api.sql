-- Contexte imposé par PostgREST après vérification du JWT et changement de rôle.
create function public.verifier_session_api() returns void
language plpgsql stable security invoker set search_path='' as $$
begin
  if current_user='authenticated' then
    if not exists(select from public.ma_session_active()) then
      raise sqlstate 'PT401' using message='La session a pris fin. Reconnectez-vous.';
    end if;
  end if;
end $$;
revoke all on function public.verifier_session_api() from public;
grant execute on function public.verifier_session_api() to anon,authenticated,service_role;

-- Limiter le paramètre à la base visée et conserver tout hook déjà installé.
do $$
declare conflit boolean;
begin
  select exists(select from pg_db_role_setting s cross join unnest(s.setconfig) v
    where s.setrole in (0,'authenticator'::regrole::oid)
      and s.setdatabase in (0,(select oid from pg_database where datname=current_database()))
      and split_part(v,'=',1)='pgrst.db_pre_request'
      and substring(v from position('=' in v)+1) not in ('','public.verifier_session_api')) into conflit;
  if conflit then raise exception 'Un contrôle PostgREST existe déjà. Intégrer les deux contrôles avant bascule.'; end if;
  execute format('alter role authenticator in database %I set pgrst.db_pre_request = %L',current_database(),'public.verifier_session_api');
end $$;
notify pgrst,'reload config';
