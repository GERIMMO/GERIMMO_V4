-- Les relances, le défaut de paiement et les compteurs suivent le même jour de Paris que les droits.
-- Aucun montant ni historique modifié ; aucune permission ajoutée. Rejeu sans effet, divergence refusée.
-- Retour : supabase/retours-arriere/20261018231827_abonnement_jour_paris.retour.sql
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
    if utc=c[2]::integer and paris=0 then
      execute regexp_replace(d,'\mcurrent_date\M','public.aujourdhui_paris()','gi');
    elsif utc<>0 or paris<>c[2]::integer then
      raise exception 'Abonnement Paris : définition inattendue de %, aucune réécriture',c[1];
    end if;
  end loop;
end $dates$;
