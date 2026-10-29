-- Une clé étrangère peut s'appeler bail_referent, contrat_id ou bail_id.
-- Modifier uniquement la lecture du catalogue préserve toutes les gardes déjà posées.
do $migration$
declare definition text;
begin
 select pg_catalog.pg_get_functiondef('public.supprimer_bail_brouillon(uuid,uuid)'::regprocedure) into definition;
 if position('v_dependance.colonne_bail' in definition)>0 then return; end if;
 if position($ancien$  for v_table in
    select distinct c.conrelid::regclass from pg_catalog.pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.baux'::regclass
      and c.conrelid not in ('public.bail_personnes'::regclass,
        'public.inventaire_lignes'::regclass, 'public.etats_des_lieux'::regclass)
  loop
    execute pg_catalog.format('select exists (select 1 from %s where bail_id = $1)', v_table)
      into v_utilise using p_bail;
    if v_utilise then raise exception 'Ce bail possède des opérations ou un suivi associé et ne peut pas être supprimé.'; end if;
  end loop;$ancien$ in definition)=0 or position('v_table regclass;' in definition)=0 then
   raise exception 'La définition de supprimer_bail_brouillon a changé : correction à vérifier.';
 end if;
 definition:=replace(definition,'v_table regclass;','v_dependance record;');
 definition:=replace(definition,$ancien$  for v_table in
    select distinct c.conrelid::regclass from pg_catalog.pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.baux'::regclass
      and c.conrelid not in ('public.bail_personnes'::regclass,
        'public.inventaire_lignes'::regclass, 'public.etats_des_lieux'::regclass)
  loop
    execute pg_catalog.format('select exists (select 1 from %s where bail_id = $1)', v_table)
      into v_utilise using p_bail;
    if v_utilise then raise exception 'Ce bail possède des opérations ou un suivi associé et ne peut pas être supprimé.'; end if;
  end loop;$ancien$,$nouveau$  for v_dependance in
    select distinct c.conrelid::regclass as table_cible, a.attname as colonne_bail
    from pg_catalog.pg_constraint c
    cross join lateral pg_catalog.generate_subscripts(c.confkey, 1) p(i)
    join pg_catalog.pg_attribute cible on cible.attrelid=c.confrelid and cible.attnum=c.confkey[p.i] and cible.attname='id'
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[p.i]
    where c.contype = 'f' and c.confrelid = 'public.baux'::regclass
      and c.conrelid not in ('public.bail_personnes'::regclass,
        'public.inventaire_lignes'::regclass, 'public.etats_des_lieux'::regclass)
  loop
    execute pg_catalog.format('select exists (select 1 from %s where %I = $1)', v_dependance.table_cible, v_dependance.colonne_bail)
      into v_utilise using p_bail;
    if v_utilise then raise exception 'Ce bail possède des opérations ou un suivi associé et ne peut pas être supprimé.'; end if;
  end loop;$nouveau$);
 execute definition;
end $migration$;
