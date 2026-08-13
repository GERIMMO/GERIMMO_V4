-- Correctif (revue 13/08) : le verrou des lignes ne contrôlait que
-- new.mandat_id — re-parenter une ligne HORS d'un mandat résilié le
-- contournait (le mandat historisé perdait ses lots). On contrôle désormais
-- les deux côtés d'un UPDATE.
create or replace function public.mandat_ligne_verrouiller_resilie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select etat from public.mandats where id = new.mandat_id) = 'resilie'
     or (tg_op = 'UPDATE'
         and (select etat from public.mandats where id = old.mandat_id) = 'resilie') then
    raise exception 'Mandat résilié : historisé, ses lignes ne se modifient plus';
  end if;
  return new;
end;
$$;
