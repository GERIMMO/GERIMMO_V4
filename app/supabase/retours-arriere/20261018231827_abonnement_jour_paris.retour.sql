-- Retour du calcul des abonnements, sans modifier les dates déjà enregistrées ni les droits.
do $dates$
declare
  c text[]; d text; utc integer; paris integer;
  fonctions constant text[][] := array[
    ['public.abonnement_appliquer(text,text,text,integer,timestamp with time zone,boolean)','5'],
    ['public.abonnement_relance_envoyee(uuid)','2'],
    ['public.abonnements_a_relancer(integer)','4'],
    ['public.etat_abonnement(uuid)','1'],
    ['public.mon_abonnement(uuid)','1']
  ];
begin
  perform set_config('lock_timeout','10s',true);
  foreach c slice 1 in array fonctions loop
    if to_regprocedure(c[1]) is null then raise exception 'Abonnement Paris : fonction absente %',c[1]; end if;
    select pg_get_functiondef(to_regprocedure(c[1])) into d;
    select count(*) into utc from regexp_matches(d,'\mcurrent_date\M','gi');
    select count(*) into paris from regexp_matches(d,'\m(public\.)?aujourdhui_paris\(\)','gi');
    if utc=0 and paris=c[2]::integer then
      execute regexp_replace(d,'\m(public\.)?aujourdhui_paris\(\)','CURRENT_DATE','gi');
    elsif utc<>c[2]::integer or paris<>0 then
      raise exception 'Abonnement Paris : définition inattendue de %, aucune réécriture',c[1];
    end if;
  end loop;
end $dates$;

-- Même transaction externe que le retour ; permettre une réapplication tracée.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261018231827';
  end if;
end $historique$;
