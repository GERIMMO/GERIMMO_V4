-- Recette 13/08 (scénario 3.3) — un mandat résilié est HISTORISÉ : il reste
-- consultable (taux et lots conservés) mais ne se modifie plus, ni lui ni ses
-- lignes. Les server actions le refusent avec un message clair ; le verrou en
-- base garantit la règle même face à un client direct (PostgREST).

-- 1. Le mandat lui-même : aucune mise à jour d'un mandat déjà résilié.
create function public.mandat_verrouiller_resilie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.etat = 'resilie' then
    raise exception 'Mandat résilié : historisé, non modifiable';
  end if;
  return new;
end;
$$;

create trigger mandat_verrouiller_resilie_trg
  before update on public.mandats
  for each row execute function public.mandat_verrouiller_resilie();

-- 2. Les lignes : plus d'ajout ni de modification sur un mandat résilié.
create function public.mandat_ligne_verrouiller_resilie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select etat from public.mandats where id = new.mandat_id) = 'resilie' then
    raise exception 'Mandat résilié : historisé, ses lignes ne se modifient plus';
  end if;
  return new;
end;
$$;

create trigger mandat_ligne_verrouiller_resilie_trg
  before insert or update on public.mandat_lignes
  for each row execute function public.mandat_ligne_verrouiller_resilie();

-- Les contrôles sont des triggers, jamais appelables en direct (leçon advisor S2)
revoke execute on function public.mandat_verrouiller_resilie() from public, anon, authenticated;
revoke execute on function public.mandat_ligne_verrouiller_resilie() from public, anon, authenticated;
