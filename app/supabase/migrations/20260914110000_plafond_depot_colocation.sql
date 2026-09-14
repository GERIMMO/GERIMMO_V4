-- Le type « colocation » représente un bail commun, nu ou meublé selon le
-- logement. Un seul plafond pour la saisie SQL, l'activation et l'encaissement.
-- Sources vérifiées le 14/09/2026 : Service Public F34661 (bail commun vide
-- ou meublé) et F31269 (1 / 2 mois de loyer HC). Aucun montant existant modifié.
create function public.plafond_depot_mois(p_type text, p_lot uuid)
returns integer language sql stable set search_path = '' as $$
  select case when p_type = 'meuble' or (p_type = 'colocation' and exists (
    select 1 from public.lots l where l.id = p_lot and l.meuble
  )) then 2 else 1 end;
$$;
revoke execute on function public.plafond_depot_mois(text,uuid) from public, anon;
grant execute on function public.plafond_depot_mois(text,uuid) to authenticated;

create or replace function public.controler_plafond_depot_garantie()
returns trigger language plpgsql set search_path = '' as $$
declare v_mois integer; v_plafond numeric;
begin
  if new.loyer_hc is null or new.depot_garantie is null then return new; end if;
  v_mois := public.plafond_depot_mois(new.type::text, new.lot_id);
  v_plafond := v_mois * new.loyer_hc;
  if new.depot_garantie > v_plafond then
    raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €) pour un bail %',
      v_mois, v_plafond, new.type;
  end if;
  return new;
end;
$$;
drop trigger plafond_depot_garantie on public.baux;
create trigger plafond_depot_garantie
  before insert or update of type, lot_id, loyer_hc, depot_garantie on public.baux
  for each row execute function public.controler_plafond_depot_garantie();

-- Reprendre les définitions installées pour conserver les autres gardes
-- d'accès et de cycle de vie. Une divergence d'ancre fait annuler le lot.
do $$
declare r record; definition text; corps text; occurrences integer;
begin
  for r in select * from (values
    ('public.controler_mise_en_location(uuid)',
     '(case when v.type = ''meuble'' then 2 else 1 end)', 2),
    ('public.encaisser_depot(uuid,numeric,date,text,uuid,text)',
     'case when v.type = ''meuble'' or v_meuble then 2 else 1 end', 1)
  ) x(signature, ancre, nombre) loop
    select pg_get_functiondef(p.oid), p.prosrc into definition, corps
      from pg_proc p where p.oid = r.signature::regprocedure and p.prosecdef;
    occurrences := (length(corps) - length(replace(corps, r.ancre, ''))) / length(r.ancre);
    if occurrences is distinct from r.nombre then
      raise exception 'Plafond du dépôt : définition inattendue pour %', r.signature;
    end if;
    execute replace(definition, corps,
      replace(corps, r.ancre, 'public.plafond_depot_mois(v.type::text, v.lot_id)'));
  end loop;
end $$;
