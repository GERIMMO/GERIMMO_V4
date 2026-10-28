-- Retour conservateur atomique : ferme les nouveaux envois, conserve les courriers et leurs preuves.
-- Le calcul de dette est remplacé par un refus : aucune dépendance au calendrier retiré ensuite.
do $retour_ar24$
declare contexte text := current_setting('gerimmo.systeme',true);
begin
 perform set_config('lock_timeout','10s',true);
 perform public.tache_systeme();
 update public.connexions_ar24 set actif=false;
 perform set_config('gerimmo.systeme',coalesce(contexte,''),true);
 revoke execute on function public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text,uuid) from public,anon,authenticated,service_role;
 revoke execute on function public.reserver_recommande_ar24(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
 revoke execute on function public.attester_echec_definitif_ar24(uuid,uuid,text) from public,anon,authenticated,service_role;
 execute $definition$
  create or replace function public.dette_recommande_ar24(p_bail uuid) returns jsonb
  language plpgsql stable security invoker set search_path='' as $corps$
  begin raise exception 'Les nouveaux envois AR24 sont désactivés après retour arrière.'; end
  $corps$;
 $definition$;
 revoke execute on function public.dette_recommande_ar24(uuid) from public,anon,authenticated,service_role;
 if to_regclass('supabase_migrations.schema_migrations') is not null then
  delete from supabase_migrations.schema_migrations where version in ('20261028150004','20261028150004_recommandes_ar24_durables');
 end if;
 notify pgrst,'reload schema';
end $retour_ar24$;
