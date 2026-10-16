-- Mission du 16/10, Q3 : les dates métier demandées suivent le jour de Paris.
-- Relevé des cinq définitions de production le 16/10 ; nombres exacts vérifiés.
-- Aucun montant, droit ou date déjà enregistrée ne change. Toute divergence arrête le lot.
-- Une instruction DO assure l'atomicité, y compris dans la simulation externe.
-- Retour : 20261016200000_jour_paris_complements.retour.sql.
do $q3$
declare
  c text[]; d text; n integer; inverse integer;
  fonctions constant text[][] := array[
    ['public.org_ecriture_ouverte(uuid)','2'],
    ['public.generer_alertes_assurance()','4'],
    ['public.generer_alertes_restitution()','2'],
    ['public.rafraichir_alerte_restitution(uuid)','2'],
    ['public.actualiser_orchestration_socle()','2']
  ];
  colonnes constant text[][] := array[
    ['factures_honoraires','emise_le'],
    ['appels_charges','date_reception'],
    ['cles_repartition','date_effet']
  ];
begin
  perform set_config('lock_timeout','10s',true);
  foreach c slice 1 in array fonctions loop
    if to_regprocedure(c[1]) is null then raise exception 'Q3 : fonction absente %',c[1]; end if;
    select pg_get_functiondef(to_regprocedure(c[1])) into d;
    select count(*) into n from regexp_matches(d,'\mcurrent_date\M','gi');
    select count(*) into inverse from regexp_matches(d,'\m(public\.)?aujourdhui_paris\(\)','gi');
    if n=c[2]::integer and inverse=0 then
      execute regexp_replace(d,'\mcurrent_date\M','public.aujourdhui_paris()','gi');
    elsif n<>0 or inverse<>c[2]::integer then
      raise exception 'Q3 : définition inattendue de %, aucune réécriture',c[1];
    end if;
  end loop;
  foreach c slice 1 in array colonnes loop
    select pg_get_expr(adbin,adrelid) into d from pg_attrdef a
      join pg_attribute col on col.attrelid=a.adrelid and col.attnum=a.adnum
      where a.adrelid=format('public.%I',c[1])::regclass and col.attname=c[2];
    if d ~* '^current_date$' then
      execute format('alter table public.%I alter column %I set default public.aujourdhui_paris()',c[1],c[2]);
    elsif d is null or d !~* '^(public\.)?aujourdhui_paris\(\)$' then
      raise exception 'Q3 : défaut inattendu de %.%',c[1],c[2];
    end if;
  end loop;
end $q3$;
