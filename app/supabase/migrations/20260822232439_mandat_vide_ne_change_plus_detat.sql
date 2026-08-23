-- Recette 22/08 : un mandat sans lot ni taux a pu traverser la chaîne jusqu'à
-- « résilié » (mandats créés avant la garde applicative du 21/08). Le contrat
-- vit avec son contenu, ou pas du tout : plus aucun changement d'état sans au
-- moins une ligne active (lot + taux). Garde posée en base — l'écran a la
-- sienne, mais seule la base protège les chemins hérités et directs.

create or replace function public.mandat_verifier_contenu_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.etat is distinct from new.etat then
    if not exists (
      select 1 from public.mandat_lignes ml
      where ml.mandat_id = new.id and ml.date_fin is null
    ) then
      raise exception 'Un mandat sans lot ni taux ne change pas d''état : composez-le d''abord (recette 22/08)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mandat_verifier_contenu_transition_trg on public.mandats;
create trigger mandat_verifier_contenu_transition_trg
  before update of etat on public.mandats
  for each row execute function public.mandat_verifier_contenu_transition();
