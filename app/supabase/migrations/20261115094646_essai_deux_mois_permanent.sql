-- Les échéances déjà accordées sont conservées.
create or replace function public.essai_ordinaire_fin()
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'Europe/Paris')::date + interval '2 months')::date
$$;
comment on function public.essai_ordinaire_fin() is
  'Fin de l’essai de deux mois calendaires pour toute nouvelle inscription, selon le jour de Paris.';
