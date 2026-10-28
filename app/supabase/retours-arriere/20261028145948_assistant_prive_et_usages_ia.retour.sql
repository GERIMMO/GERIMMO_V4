-- Retour conservateur atomique : désactive les appels privés et conserve tous les compteurs.
-- La réservation globale reste gardée ; ses usages historiques continuent de fonctionner.
do $retour_ia_prive$
begin
 perform set_config('lock_timeout','10s',true);
 execute $definition$
  create or replace function public.reserver_appel_ia_prive(p_org uuid,p_usage text)
  returns text language plpgsql volatile security definer set search_path='' as $corps$
  begin raise exception 'L’assistant privé est désactivé après retour arrière.'; end
  $corps$;
 $definition$;
 revoke execute on function public.reserver_appel_ia_prive(uuid,text) from public,anon,authenticated,service_role;
 if to_regclass('supabase_migrations.schema_migrations') is not null then
  delete from supabase_migrations.schema_migrations where version in ('20261028145948','20261028145948_assistant_prive_et_usages_ia');
 end if;
 notify pgrst,'reload schema';
end $retour_ia_prive$;
