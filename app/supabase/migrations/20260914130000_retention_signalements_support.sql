-- Support séparé du métier : six mois pour les signalements de bug
-- (wiki/processus/Retours utilisateurs, RM-20.1.7 / RM-A2.6).
-- Les idées, questions et contestations ne sont pas supprimées par cette règle.
insert into public.retention_rules(data_type,libelle,finalite,declencheur,duree_mois,sort)
values('support:bug','Signalements de problème','Diagnostiquer les problèmes du site et suivre leur traitement','Date du signalement',6,'suppression');

create function public.purger_signalements_support()
returns integer language plpgsql security definer set search_path='' as $$
declare v_mois integer;v_ids uuid[];v_count integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then raise exception 'Purge réservée à la supervision'; end if;
  select duree_mois into v_mois from public.retention_rules where data_type='support:bug' and actif and sort='suppression';
  if not found then return 0; end if;
  -- Lots bornés, verrouillés avant les réponses concurrentes. Un dossier déjà
  -- en cours de traitement sera repris à la prochaine exécution du nettoyage.
  select array_agg(x.id) into v_ids from (
    select id from public.retours_utilisateurs where nature='bug'
      and cree_le < now()-make_interval(months=>v_mois)
    order by cree_le,id limit 500 for update skip locked
  ) x;
  if v_ids is null then return 0; end if;
  delete from public.retours_historique where retour_id=any(v_ids);
  delete from public.retours_soutiens where retour_id=any(v_ids);
  delete from public.retours_utilisateurs where id=any(v_ids);
  get diagnostics v_count=row_count;
  -- Le journal ne conserve ni le texte ni les auteurs supprimés.
  insert into public.tech_log(evenement,details)
    values('purge_signalements_support',jsonb_build_object('nombre',v_count,'duree_mois',v_mois));
  return v_count;
end;
$$;
revoke all on function public.purger_signalements_support() from public,anon,authenticated;
grant execute on function public.purger_signalements_support() to authenticated,service_role;

-- Réutilise le nettoyage nocturne et le bouton de supervision existants.
-- L'ancre protège contre l'écrasement silencieux d'une évolution antérieure.
do $$
declare v_sql text;v_ancre text := '  return jsonb_build_object(''journaux'', v_journaux, ''documents_purges'', v_docs_purges,';
begin
  v_sql := pg_get_functiondef('public.appliquer_retention()'::regprocedure);
  if strpos(v_sql,v_ancre)=0 or strpos(v_sql,'purger_signalements_support')>0 then
    raise exception 'Fonction de conservation inattendue';
  end if;
  execute replace(v_sql,v_ancre,
    '  v_journaux := v_journaux || jsonb_build_object(''signalements_support'',public.purger_signalements_support());'||E'\n'||v_ancre);
end;
$$;
