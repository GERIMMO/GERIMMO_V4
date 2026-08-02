-- Un appartement ou un parking EST l'unité locative : il ne se découpe pas en
-- lots. Le garde-fou existait à la création/au découpage, mais rien n'empêchait
-- de *retyper* un bien déjà découpé vers un type non découpable — c'est ainsi
-- qu'un « appartement à 4 lots » avait pu s'installer en base.
create function public.bien_type_coherent_avec_lots()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_lots integer;
begin
  if new.type is distinct from old.type
     and new.type in ('appartement', 'parking') then
    select count(*) into v_lots
      from public.lots where bien_id = new.id and etat <> 'archive';
    if v_lots > 1 then
      raise exception 'Ce bien compte % lots : il ne peut pas devenir « % », qui est déjà l''unité locative. Pour un immeuble entier, utilisez maison, local ou autre.',
        v_lots, new.type;
    end if;
  end if;
  return new;
end $$;

create trigger bien_type_coherent_avec_lots_trg
  before update of type on public.biens
  for each row execute function public.bien_type_coherent_avec_lots();
